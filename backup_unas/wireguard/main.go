// Rootless WireGuard transport: only loopback TCP 1445 -> UNAS TCP 445.
package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun/netstack"
)

const nas = "10.0.0.215:445"

// IPv4-only tunnel: reserve headroom for WireGuard and the serverless underlay.
const tunnelMTU = 1100

// Keep UDP datagrams separate: serverless underlays may accept UDP GSO socket
// options while dropping the resulting coalesced datagram on the network path.
// The official bind still owns endpoints, receive batching and cryptographic I/O.
type datagramBind struct{ conn.Bind }

func (b datagramBind) Send(bufs [][]byte, endpoint conn.Endpoint) error {
	for _, buf := range bufs {
		if err := b.Bind.Send([][]byte{buf}, endpoint); err != nil {
			return err
		}
	}
	return nil
}

// Import the UniFi export without logging credentials. Routes/DNS in the export
// do not broaden access: this process exposes only one fixed destination.
func parseProfile(raw string) (netip.Addr, string, error) {
	fail := func() (netip.Addr, string, error) { return netip.Addr{}, "", errors.New("WIREGUARD_PROFILE_INVALID") }
	values := map[string]string{}
	section := ""
	sections := map[string]bool{}
	scan := bufio.NewScanner(strings.NewReader(raw))
	for scan.Scan() {
		line := strings.TrimSpace(scan.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			if (line != "[Interface]" && line != "[Peer]") || sections[line] {
				return fail()
			}
			section = line
			sections[line] = true
			continue
		}
		pair := strings.SplitN(line, "=", 2)
		if len(pair) != 2 || section == "" {
			return fail()
		}
		key := section + strings.TrimSpace(pair[0])
		if _, exists := values[key]; exists {
			return fail()
		}
		values[key] = strings.TrimSpace(pair[1])
	}
	if scan.Err() != nil {
		return fail()
	}
	addressText := strings.Split(values["[Interface]Address"], ",")[0]
	address, err := netip.ParsePrefix(strings.TrimSpace(addressText))
	if err != nil || !address.Addr().Is4() || !address.Addr().IsPrivate() {
		return fail()
	}
	endpoint, err := netip.ParseAddrPort(values["[Peer]Endpoint"])
	if err != nil || !endpoint.Addr().Is4() || endpoint.Addr().IsPrivate() || !endpoint.Addr().IsGlobalUnicast() || endpoint.Port() == 0 {
		return fail()
	}
	keyHex := func(value string) (string, error) {
		b, e := base64.StdEncoding.DecodeString(value)
		if e != nil || len(b) != 32 || string(b) == strings.Repeat("\x00", 32) {
			return "", errors.New("KEY_INVALID")
		}
		return hex.EncodeToString(b), nil
	}
	private, err := keyHex(values["[Interface]PrivateKey"])
	if err != nil {
		return fail()
	}
	public, err := keyHex(values["[Peer]PublicKey"])
	if err != nil {
		return fail()
	}
	ipc := "private_key=" + private + "\npublic_key=" + public + "\nendpoint=" + endpoint.String() + "\nallowed_ip=10.0.0.215/32\npersistent_keepalive_interval=25\n"
	if value := values["[Peer]PresharedKey"]; value != "" {
		key, e := keyHex(value)
		if e != nil {
			return fail()
		}
		ipc += "preshared_key=" + key + "\n"
	}
	return address.Addr(), ipc, nil
}

type dialer func(context.Context, string, string) (net.Conn, error)

func serve(ctx context.Context, listener net.Listener, dial dialer) error {
	defer listener.Close()
	go func() { <-ctx.Done(); listener.Close() }()
	slots := make(chan struct{}, 4)
	for {
		local, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		select {
		case slots <- struct{}{}:
		default:
			local.Close()
			continue
		}
		go func() {
			defer func() { <-slots }()
			defer local.Close()
			dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			remote, err := dial(dialCtx, "tcp", nas)
			cancel()
			if err != nil {
				return
			}
			defer remote.Close()
			// Each direction has a bounded buffer. Closing either side releases both.
			done := make(chan struct{}, 1)
			go func() { io.Copy(remote, local); done <- struct{}{} }()
			other := make(chan struct{}, 1)
			go func() { io.Copy(local, remote); other <- struct{}{} }()
			select {
			case <-done:
			case <-other:
			case <-ctx.Done():
			}
		}()
	}
}

func run() error {
	if os.Getenv("CLOUD_RUN_JOB") == "" {
		return errors.New("CLOUD_RUN_REQUIRED")
	}
	f, err := os.Open(os.Getenv("UNAS_WIREGUARD_PROFILE_FILE"))
	if err != nil {
		return err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, 65537))
	if err != nil || len(raw) > 65536 {
		return errors.New("PROFILE_SIZE")
	}
	addr, ipc, err := parseProfile(string(raw))
	if err != nil {
		return err
	}
	tun, stack, err := netstack.CreateNetTUN([]netip.Addr{addr}, nil, tunnelMTU)
	if err != nil {
		return err
	}
	dev := device.NewDevice(tun, datagramBind{conn.NewDefaultBind()}, device.NewLogger(device.LogLevelSilent, ""))
	defer dev.Close()
	if err = dev.IpcSet(ipc); err != nil {
		return err
	}
	if err = dev.Up(); err != nil {
		return err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:1445")
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	// Readiness here means local transport ready, NOT a completed VPN handshake.
	fmt.Println("WIREGUARD_LOCAL_FORWARD_READY")
	return serve(ctx, listener, stack.DialContext)
}
func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "WIREGUARD_TRANSPORT_FAILED")
		os.Exit(1)
	}
}
