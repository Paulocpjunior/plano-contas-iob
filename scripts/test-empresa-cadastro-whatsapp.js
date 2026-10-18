'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cadastro = require('../empresa-cadastro');
const whatsapp = require('../whatsapp-cfi-client');

assert.deepStrictEqual(cadastro.normalizarCodigoEmpresa('587'), { ok: true, valor: '0587' });
assert.strictEqual(cadastro.normalizarCodigoEmpresa('0000').ok, false);
assert.deepStrictEqual(cadastro.normalizarWhatsappBr('(11) 91234-5678'), { ok: true, valor: '5511912345678' });
assert.strictEqual(cadastro.normalizarWhatsappBr('123').ok, false);

const empresa = { razao_social: 'SP Assessoria Contabil', cnpj: '12345678000190', codigo_empresa: '0587' };
assert.strictEqual(cadastro.empresaBateBusca('587', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('assessoria', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('56.780', empresa), true);
assert.strictEqual(cadastro.empresaBateBusca('9999', empresa), false);

const raiz = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(raiz, 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
assert(server.includes("app.patch('/api/empresas/:cnpj/cadastro'"));
assert(server.includes("app.post('/api/empresas/:cnpj/whatsapp/enviar'"));
assert(server.includes('validarCodigoEmpresaUnico'));
assert(index.includes('placeholder="Número, nome ou CNPJ..."'));
assert(index.includes('⚡ Ativar empresa'));
assert(index.includes('id="btnAtivarEmpresaTopo"'));
assert(index.includes('id="ativacaoEmpresaInicio"'));
assert(index.includes('function abrirAtivacaoEmpresa()'));
assert(index.includes('Qual empresa você vai atender?'));
assert(index.includes('WhatsApp API'));
assert(index.includes("modo: 'ativacao'"));
assert(index.includes('function prepararGateAtivacaoEmpresa()'));
assert(index.includes('window.__empresaAtivadaExplicitamente = false'));
assert(index.includes("botao.id === 'btnAtivarEmpresaNav' || botao.id === 'btnCadastroEmpresaNav'"));
assert(index.includes('id="btnCadastroEmpresaNav"'));
assert(index.includes('function abrirCadastroEmpresa()'));
assert(index.includes('A empresa não será ativada automaticamente.'));
assert(index.includes("if (p !== 'empresas' && !empresaAtivadaExplicitamente())"));

const authInicio = index.indexOf('} else auth.onAuthStateChanged(async u => {');
const authFim = index.indexOf('// ============ AUTO-SAVE REMOTO', authInicio);
const authFluxo = index.slice(authInicio, authFim);
assert(authFluxo.includes('prepararGateAtivacaoEmpresa();'));
assert.strictEqual(authFluxo.includes('loadState();'), false, 'Login nao pode restaurar empresa anterior antes da ativacao.');
assert.strictEqual(authFluxo.includes('initApp();'), false, 'Login nao pode iniciar varredura operacional antes da ativacao.');

const ramoLeve = server.indexOf("if (modo === 'ativacao')");
const enriquecimento = server.indexOf('// Carregar nomes dos planos para enriquecer', ramoLeve);
assert(ramoLeve > 0 && enriquecimento > ramoLeve, 'Ramo leve deve responder antes de planos, sessoes e relatorios.');
assert(server.includes("modo: 'ativacao'"));
assert(server.includes("if (!usuarioPodeAcessarEmpresa(doc.data(), req.user)) return res.status(403)"));
assert(server.includes("app.get('/api/empresas/:cnpj/plano-contexto'"));
assert(index.includes('loadPlanosCadastrados(state.info && state.info.cnpj)'));
assert(index.includes('window.API.loadPlanoEmpresa(cnpjLimpo)'));
assert(fs.readFileSync(path.join(raiz, 'api-adapter.js'), 'utf8').includes("'/plano-contexto'"));

assert.strictEqual(whatsapp.baseCfi({ CFI_URL: 'https://cfi.example/' }), 'https://cfi.example');
// G5: com SP_CONNECT_URL o envio vai ao Connect (mesmas rotas); sem ela, CFI.
// baseCfi não muda: o regime tributário (cfi-regime-client) só existe no CFI.
assert.strictEqual(
  whatsapp.baseWhatsapp({ SP_CONNECT_URL: 'https://connect.example/', CFI_URL: 'https://cfi.example' }),
  'https://connect.example'
);
assert.strictEqual(
  whatsapp.baseCfi({ SP_CONNECT_URL: 'https://connect.example/', CFI_URL: 'https://cfi.example/' }),
  'https://cfi.example'
);
assert.strictEqual(
  require('../cfi-regime-client').urlRegimeCfi('11222333000181', { SP_CONNECT_URL: 'https://connect.example', CFI_URL: 'https://cfi.example' }),
  'https://cfi.example/api/admin/cadastro-contabil/regime/11222333000181'
);
assert.strictEqual(
  whatsapp.urlWhatsappCfi('enviar', { SP_CONNECT_URL: 'https://connect.example', CFI_URL: 'https://cfi.example' }),
  'https://connect.example/api/admin/whatsapp/enviar'
);
assert.strictEqual(
  whatsapp.urlWhatsappCfi('status', { CFI_URL: 'https://cfi.example/' }),
  'https://cfi.example/api/admin/whatsapp/status'
);

(async function () {
  const chamadasStatus = [];
  const status = await whatsapp.statusWhatsappCfi('firebase-token', {
    env: { CFI_URL: 'https://cfi.example/' },
    fetchImpl: async function (url, opcoes) {
      chamadasStatus.push({ url, opcoes });
      const corpo = url.endsWith('/status')
        ? { ok: true, pronto: true }
        : { ok: true, templates: [{ nome: 'cci_aviso', departamento: 'contabil', ativo: true, temDocumento: false, variaveis: [{ chave: 'cliente' }] }] };
      return { ok: true, status: 200, json: async function () { return corpo; } };
    }
  });
  assert.strictEqual(status.pronto, true);
  assert.strictEqual(status.templates[0].nome, 'cci_aviso');
  assert.strictEqual(chamadasStatus.length, 2);
  assert(chamadasStatus.every(function (chamada) {
    return chamada.opcoes.headers.Authorization === 'Bearer firebase-token';
  }));

  const semTemplate = await whatsapp.statusWhatsappCfi('firebase-token', {
    env: { CFI_URL: 'https://cfi.example' },
    fetchImpl: async function (url) {
      const corpo = url.endsWith('/status') ? { ok: true, pronto: true } : { ok: true, templates: [] };
      return { ok: true, status: 200, json: async function () { return corpo; } };
    }
  });
  assert.strictEqual(semTemplate.pronto, false);
  assert(semTemplate.faltas.some(function (falta) { return falta.includes('template ativo'); }));

  let chamadaEnvio = null;
  const resultado = await whatsapp.enviarWhatsappCfi(
    { token: 'firebase-token', para: '5511912345678', template: 'cci_aviso', variaveis: { cliente: 'Empresa' }, referencia: { cnpj: '12345678000190' } },
    {
      env: { CFI_URL: 'https://cfi.example' },
      fetchImpl: async function (url, opcoes) {
        chamadaEnvio = { url, opcoes };
        return { ok: true, status: 200, json: async function () { return { ok: true, messageId: 'wamid.2' }; } };
      }
    }
  );
  assert.deepStrictEqual(resultado, { ok: true, messageId: 'wamid.2' });
  assert.strictEqual(chamadaEnvio.url, 'https://cfi.example/api/admin/whatsapp/enviar');
  assert.strictEqual(chamadaEnvio.opcoes.headers.Authorization, 'Bearer firebase-token');
  const corpoEnvio = JSON.parse(chamadaEnvio.opcoes.body);
  assert.strictEqual(corpoEnvio.departamento, 'contabil');
  assert.strictEqual(corpoEnvio.template, 'cci_aviso');
  assert.deepStrictEqual(corpoEnvio.variaveis, { cliente: 'Empresa' });
  assert.strictEqual(chamadaEnvio.opcoes.body.includes('firebase-token'), false);

  let erroRede = null;
  try {
    await whatsapp.enviarWhatsappCfi(
      { token: 'firebase-token', para: '5511912345678', template: 'cci_aviso', variaveis: {} },
      { env: { CFI_URL: 'https://cfi.example' }, fetchImpl: async function () { throw new Error('rede'); } }
    );
  } catch (erro) {
    erroRede = erro;
  }
  assert(erroRede);
  assert.strictEqual(erroRede.indeterminado, true);
  console.log('OK empresa cadastro, busca e gateway central WhatsApp do CFI');
})().catch(function (erro) {
  console.error(erro);
  process.exitCode = 1;
});

// A entrada vazia não consulta nem o servidor nem o Firestore.
(async function testarBuscaSobDemanda() {
  const vm = require('vm');
  const elementos = Object.fromEntries(['empCards','empInfo','empBusca','empPaginacao','empAdminToggle','empBanco','empStatus','empSort'].map(id => [id, {value:'',innerHTML:'',textContent:'',style:{}}]));
  let chamadas = 0;
  let resolver;
  const ctx = {document:{getElementById:id=>elementos[id]},window:{CURRENT_USER:{is_admin:true},API:{listarEmpresasFiltrado:()=>{chamadas++;return new Promise(r=>resolver=r);}}},empEscape:String};
  vm.createContext(ctx);
  const inicio = index.indexOf('        async function loadEmpresasPage()');
  const fim = index.indexOf('        function empGoPage(', inicio);
  vm.runInContext('let _empRequest=0,_empCache=null,_empOffset=0; const _empPageSize=8;'+index.slice(inicio,fim),ctx);
  await ctx.loadEmpresasPage();
  assert.strictEqual(chamadas,0);
  elementos.empBusca.value='Yokoama';
  const pendente=ctx.loadEmpresasPage();
  assert.strictEqual(chamadas,1);
  elementos.empBusca.value='';
  await ctx.loadEmpresasPage();
  const vazio=elementos.empCards.innerHTML;
  resolver({empresas:[{cnpj:'123'}],total:1});
  await pendente;
  assert.strictEqual(elementos.empCards.innerHTML,vazio,'Resposta atrasada não repovoa a tela após limpar a busca.');
  const routeStart=server.indexOf("app.get('/api/empresas/listar'");
  const routeEnd=server.indexOf("app.get('/api/empresas/:cnpj/plano-contexto'",routeStart);
  let handler;
  vm.runInNewContext(server.slice(routeStart,routeEnd),{app:{get:(url,fn)=>handler=fn},db:{collection:()=>{throw Error('Leitura indevida da carteira');}},console});
  let resposta;
  await handler({query:{modo:'ativacao',q:''},user:{is_admin:true}},{json:d=>resposta=d,status:()=>{throw Error('A busca vazia não deve falhar');}});
  assert.strictEqual(resposta.empresas.length,0);
  const doc={id:'47476379000174',data:()=>({cnpj:'47476379000174',razao_social:'Yokoama',codigo_empresa:'0004',segredo:'não retornar'})};
  let vinculadas=false;
  vm.runInNewContext(server.slice(routeStart,routeEnd),{app:{get:(url,fn)=>handler=fn},db:{collection:()=>{throw Error('Colaborador não pode varrer coleção inteira');}},listarEmpresasAcessiveis:async(user,opts)=>{vinculadas=opts.somenteVinculadas;return [doc];},empresaBateBusca:cadastro.empresaBateBusca,codigoEmpresaDe:cadastro.codigoEmpresaDe,console});
  await handler({query:{modo:'ativacao',q:'Yokoama',limit:8},user:{is_admin:false}},{json:d=>resposta=d,status:()=>{throw Error('Busca deve responder');}});
  assert.strictEqual(vinculadas,true);
  assert.strictEqual(resposta.total,1);
  assert.strictEqual(Object.keys(resposta.empresas[0]).sort().join(','),'cnpj,codigo_empresa,razao_social');
  console.log('✓ ativação sob demanda, carteira restrita e descarte de resposta atrasada');
})().catch(e=>{console.error(e);process.exitCode=1;});
