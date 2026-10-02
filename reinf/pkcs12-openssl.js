'use strict';
const { spawn } = require('child_process');
const { X509Certificate, createPrivateKey } = require('crypto');

// PFX e senha trafegam apenas por pipes. Nenhum segredo em argumentos,
// variáveis de ambiente, arquivos temporários, logs ou mensagens de erro.
function executar(pfx, senha, legacy = false) {
  return new Promise((resolve, reject) => {
    const args = ['pkcs12', '-nodes', '-passin', 'fd:3'];
    if (legacy) args.push('-legacy');
    const child = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    let output = [], stderr = [], bytes = 0, concluido = false;
    const terminar = (erro, valor) => {
      if (concluido) return;
      concluido = true;
      clearTimeout(timer);
      if (erro) reject(erro); else resolve(valor);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      terminar(new Error('Tempo limite ao ler certificado A1.'));
    }, 15000);
    child.on('error', () => terminar(new Error('Leitor OpenSSL indisponível.')));
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 10 * 1024 * 1024) {
        child.kill('SIGKILL');
        terminar(new Error('Certificado A1 excede o limite de leitura.'));
      } else output.push(chunk);
    });
    child.stderr.on('data', chunk => { if (stderr.length < 20) stderr.push(chunk); });
    child.on('close', code => terminar(null, {
      code, pem: Buffer.concat(output).toString('utf8'),
      unsupported: /unsupported/i.test(Buffer.concat(stderr).toString('utf8')),
    }));
    // EPIPE pode ocorrer quando OpenSSL recusa o arquivo antes de ler os pipes.
    child.stdin.on('error', () => {});
    child.stdio[3].on('error', () => {});
    child.stdin.end(pfx);
    child.stdio[3].end(senha + '\n');
  });
}

async function extrairPem(pfx, senha) {
  if (!Buffer.isBuffer(pfx) || !pfx.length || pfx.length > 10 * 1024 * 1024)
    throw new Error('Arquivo A1 vazio ou acima do limite de 10 MB.');
  if (typeof senha !== 'string' || /[\r\n\0]/.test(senha))
    throw new Error('Senha do certificado A1 contém caracteres não suportados.');
  let result = await executar(pfx, senha);
  // Arquivos A1 antigos podem usar RC2. Mantém a verificação MAC obrigatória.
  if (result.code !== 0 && result.unsupported) result = await executar(pfx, senha, true);
  if (result.code !== 0) throw new Error('Não foi possível ler o certificado A1. Confira o arquivo e a senha.');
  const keys = result.pem.match(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g) || [];
  const certs = result.pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (keys.length !== 1) throw new Error('O certificado A1 deve conter exatamente uma chave privada.');
  const key = createPrivateKey(keys[0]);
  const pemCert = certs.find(pem => new X509Certificate(pem).checkPrivateKey(key));
  if (!pemCert) throw new Error('Certificado correspondente à chave privada não encontrado no A1.');
  return { pemKey: key.export({ type: 'pkcs8', format: 'pem' }), pemCert };
}
module.exports = { extrairPem };
