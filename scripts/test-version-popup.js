'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const source = fs.readFileSync(indexPath, 'utf8');

assert(
  !source.includes("if (info.version === _VERSAO_BUILD) localStorage.setItem(_VERSAO_VISTA_KEY, info.version)"),
  'A versao nao pode ser marcada como vista automaticamente no carregamento.'
);
assert(
  source.includes("if (!versaoJaVista && _versaoAdiadaNestaSessao !== info.version)"),
  'Uma versao publicada e ainda nao vista deve abrir o popup.'
);
assert(
  source.includes("_mostrarModalAtualizacao(info, true)"),
  'O popup deve reconhecer quando a nova versao ja esta carregada.'
);
assert(
  source.includes("btn.textContent = versaoJaCarregada ? 'Entendi' : 'Atualizar agora'"),
  'A versao ja carregada deve ser confirmada com Entendi.'
);
assert(
  source.includes("localStorage.setItem(_VERSAO_VISTA_KEY, info.version);\n                        localStorage.removeItem(_VERSAO_ADIADA_KEY);\n                        modal.style.display = 'none';\n                        return;"),
  'A versao so deve ser marcada como vista ao ser confirmada.'
);
assert(
  source.includes("window.location.replace(destino.toString())"),
  'Uma versao detectada deve abrir uma URL unica para vencer o cache do Safari.'
);
assert(
  source.includes("destino.searchParams.set('v', info.version)"),
  'A URL de atualizacao deve carregar explicitamente a versao publicada.'
);
assert(
  !source.includes("localStorage.setItem(_VERSAO_ADIADA_KEY, info.version)"),
  'Ver depois nao pode ocultar a atualizacao indefinidamente em novas sessoes.'
);
assert(
  source.includes("window.addEventListener('pageshow', checarVersaoAoRetomar)") &&
    source.includes("window.addEventListener('focus', checarVersaoAoRetomar)"),
  'Safari e abas retomadas devem revalidar a versao imediatamente.'
);
assert(
  source.includes('window.__verificarVersaoAntesDeImportar = async function()'),
  'Toda importacao deve consultar a versao ativa antes de processar o arquivo.'
);
assert(
  source.includes("btnLater.style.display = atualizacaoObrigatoria ? 'none' : ''"),
  'A atualizacao nao pode ser adiada quando uma importacao usa parser antigo.'
);
assert(
  source.includes('if (!versaoAtual) return;'),
  'O processamento do arquivo deve parar quando a versao estiver desatualizada.'
);

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert(
  server.includes("res.set('Clear-Site-Data', '\"cache\"')"),
  'A consulta de versao deve limpar somente o cache HTTP antes da troca.'
);

console.log('OK: popup de atualizacao validado para versao carregada e versao pendente.');
