package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"golang.org/x/crypto/curve25519"
	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun/netstack"
	"io"
	"net"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func keys(t *testing.T) ([]byte, []byte) {
	t.Helper()
	k := make([]byte, 32)
	if _, e := rand.Read(k); e != nil {
		t.Fatal(e)
	}
	pub, e := curve25519.X25519(k, curve25519.Basepoint)
	if e != nil {
		t.Fatal(e)
	}
	return k, pub
}
func TestProfileRestrictsRoutes(t *testing.T) {
	k, p := keys(t)
	profile := fmt.Sprintf("[Interface]\nPrivateKey = %s\nAddress = 192.168.3.2/32\nDNS = 10.0.0.5\n[Peer]\nPublicKey = %s\nEndpoint = 177.43.195.55:51820\nAllowedIPs = 0.0.0.0/0, ::/0\n", base64.StdEncoding.EncodeToString(k), base64.StdEncoding.EncodeToString(p))
	a, ipc, e := parseProfile(profile)
	if e != nil || a.String() != "192.168.3.2" {
		t.Fatal("valid profile rejected")
	}
	if !strings.Contains(ipc, "allowed_ip=10.0.0.215/32\n") || strings.Contains(ipc, "0.0.0.0/0") {
		t.Fatal("broad route")
	}
	for _, bad := range []string{profile + "[Peer]\n", strings.Replace(profile, "177.43.195.55", "127.0.0.1", 1), strings.Replace(profile, "192.168.3.2/32", "8.8.8.8/32", 1), strings.Replace(profile, "PrivateKey = ", "PrivateKey = invalid", 1)} {
		if _, _, e := parseProfile(bad); e == nil {
			t.Fatal("invalid profile accepted")
		}
	}
}
func TestEncryptedUserspaceForward(t *testing.T) {
	// Synthetic endpoints only; no production profile, TUN or privileges.
	cp, cu := keys(t)
	sp, su := keys(t)
	makeDevice := func(ip string) (*device.Device, *netstack.Net) {
		tun, stack, e := netstack.CreateNetTUN([]netip.Addr{netip.MustParseAddr(ip)}, nil, 1280)
		if e != nil {
			t.Fatal(e)
		}
		d := device.NewDevice(tun, conn.NewDefaultBind(), device.NewLogger(device.LogLevelSilent, ""))
		t.Cleanup(d.Close)
		return d, stack
	}
	server, snet := makeDevice("10.0.0.215")
	if e := server.IpcSet(fmt.Sprintf("private_key=%s\nlisten_port=0\npublic_key=%s\nallowed_ip=192.168.3.2/32\n", hex.EncodeToString(sp), hex.EncodeToString(cu))); e != nil {
		t.Fatal("server setup")
	}
	if e := server.Up(); e != nil {
		t.Fatal(e)
	}
	state, e := server.IpcGet()
	if e != nil {
		t.Fatal("server state")
	}
	port := ""
	for _, line := range strings.Split(state, "\n") {
		if strings.HasPrefix(line, "listen_port=") {
			port = strings.TrimPrefix(line, "listen_port=")
		}
	}
	if port == "" || port == "0" {
		t.Fatal("no UDP port")
	}
	remote, e := snet.ListenTCP(&net.TCPAddr{IP: net.ParseIP("10.0.0.215"), Port: 445})
	if e != nil {
		t.Fatal(e)
	}
	defer remote.Close()
	go func() {
		c, e := remote.Accept()
		if e != nil {
			return
		}
		defer c.Close()
		io.Copy(c, c)
	}()
	client, cnet := makeDevice("192.168.3.2")
	if e := client.IpcSet(fmt.Sprintf("private_key=%s\npublic_key=%s\nendpoint=127.0.0.1:%s\nallowed_ip=10.0.0.215/32\n", hex.EncodeToString(cp), hex.EncodeToString(su), port)); e != nil {
		t.Fatal("client setup")
	}
	if e := client.Up(); e != nil {
		t.Fatal(e)
	}
	listener, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stopped := make(chan error, 1)
	go func() { stopped <- serve(ctx, listener, cnet.DialContext) }()
	c, e := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	c.SetDeadline(time.Now().Add(15 * time.Second))
	message := []byte(strings.Repeat("synthetic-backup-block", 4096))
	if _, e = c.Write(message); e != nil {
		t.Fatal(e)
	}
	got := make([]byte, len(message))
	if _, e = io.ReadFull(c, got); e != nil {
		t.Fatal(e)
	}
	if string(got) != string(message) {
		t.Fatal("data mismatch")
	}
	cancel()
	select {
	case e := <-stopped:
		if e != nil {
			t.Fatal(e)
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown stalled")
	}
}
