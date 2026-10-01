'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../plano-consulta'), 'utf8');
(async () => {
  const elements = Object.fromEntries(['conta_referencia', 'cod', 'desc', 'ref_rfb', 'analitica'].map(n => [n, {value: ''}]));
  const button = {}, status = {}, estrutura = {}, tbody = {}, search = {value: ''};
  let submit, posted, refreshed = 0;
  const form = {elements, querySelector: () => button, addEventListener: (_, f) => {submit = f;}, reset: () => Object.values(elements).forEach(e => {e.value = '';})};
  const dialog = {style: {}, showModal() {}, querySelector: s => ({'form': form, 'form button': button, '[data-close]': {}, '[data-status]': status, '[data-estrutura]': estrutura, '[data-search]': search, 'tbody': tbody}[s])};
  const contas = [{cod:'4.1.2.01.0004',desc:'Modelo',analitica:true}];
  const window = {CURRENT_USER:{is_admin:true}, API:{apiFetch: async (_, options) => {
    if (options) {posted = JSON.parse(options.body);contas.push(posted);}
    return {ok:true,json: async () => options ? {} : contas};
  }}};
  vm.runInNewContext(source, {window, document:{getElementById:()=>null,createElement:()=>dialog,body:{appendChild(){}}}, FormData: class {constructor(){return Object.entries(elements).filter(([n])=>n!=='analitica').map(([n,e])=>[n,e.value]);}}});
  await window.abrirConsultaPlano('Teste',{plano_id:'p'},async()=>{refreshed++;});
  assert(dialog.innerHTML.includes('Cadastrar nova conta contábil'));
  assert.equal(button.disabled,true);
  elements.conta_referencia.value = '4.1.2.01.0004';
  elements.conta_referencia.onchange();
  assert.equal(elements.cod.value,'4.1.2.01.0005');
  assert.equal(elements.analitica.value,'true');
  assert(estrutura.textContent.includes('Grau 5'));
  elements.desc.value = 'Nova';
  elements.cod.value = '4.1.2.02.0005';
  await submit({preventDefault(){},target:form});
  assert.equal(posted,undefined);
  elements.cod.value = '4.1.2.01.0005';
  await submit({preventDefault(){},target:form});
  assert.equal(posted.conta_referencia,'4.1.2.01.0004');
  assert.equal(posted.analitica,true);
  assert.equal(refreshed,1);
  assert.equal(button.disabled,true);
  assert(status.textContent.includes('Conta criada'));
  console.log('OK: seleção, sugestão, validação e atualização do formulário.');
})().catch(e=>{console.error(e);process.exitCode=1;});
