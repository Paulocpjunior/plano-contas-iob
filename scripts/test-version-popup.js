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
  source.includes("window.location.reload(true)"),
  'Uma versao detectada durante o uso deve continuar recarregando a aplicacao.'
);

console.log('OK: popup de atualizacao validado para versao carregada e versao pendente.');
