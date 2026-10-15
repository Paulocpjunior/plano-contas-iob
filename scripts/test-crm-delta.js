'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planejar, inventariar, executar } = require('./planejar-crm-delta');
const clone = x => JSON.parse(JSON.stringify(x));
const p = { fontes:[{id:'defis_2025',sha256:'abc',registros:1,colunas:2,cabecalhos:['A','RECIBO + DEFIS 2025/2026']}], registros:[{
  id:'defis_2025_000002', fonte:'defis_2025', origem_sha256:'abc', linha:2, cnpj:'44388152000189',codigo:'1200',nome:'Empresa privada',revisao:1,
  campos:[{nome:'A',original:null,valor:null},{nome:'RECIBO + DEFIS 2025/2026',original:'https://example.com/privado.pdf',valor:'https://example.com/privado.pdf'}]
}]};
const n = clone(p); n.fontes[0].sha256='novo'; n.registros[0].origem_sha256='novo';
const link = [{anterior:p.registros[0].id,novo:n.registros[0].id,motivo:'ID da submissão conferido'}];
assert.equal(planejar(p,p,p.registros).totais.inalterado,1);
assert.equal(planejar(p,n,p.registros).totais.identidade_a_confirmar,1);
assert.equal(planejar(p,n,p.registros,link).totais.inalterado,1);
// Linha reordenada nunca é vínculo automático.
n.registros[0].id='defis_2025_000008'; n.registros[0].linha=8;
assert.equal(planejar(p,n,p.registros).totais.identidade_a_confirmar,1);
link[0].novo=n.registros[0].id;
assert.equal(planejar(p,n,p.registros,link).totais.inalterado,1);
n.registros[0].campos[0].valor=0; n.registros[0].campos[0].original=0;
assert.equal(planejar(p,n,p.registros,link).itens[0].campos[0].estado,'mudanca_origem_a_conferir');
const c=clone(p.registros); Object.assign(c[0],{revisao:2,atualizado_em:'2026-10-15',atualizado_por_uid:'privado'}); c[0].campos[0].valor=10;
assert.equal(planejar(p,n,c,link).totais.conflito,1);
assert.equal(c[0].campos[0].valor,10);
assert.equal(planejar(p,p,c).itens[0].campos[0].estado,'preservar_edicao_cci');
c[0].campos[0].valor=0;
assert.equal(planejar(p,n,c,link).itens[0].campos[0].estado,'convergente_conferir_metadados');
assert.throws(()=>planejar(p,n,c,[...link,...link]));
assert.throws(()=>planejar(p,n,c,[{...link[0],motivo:''}]));
const ruim=clone(c); ruim[0].campos[0].original=999;
assert.throws(()=>planejar(p,n,ruim,link));
const identidade=clone(n); identidade.registros[0].cnpj='99999999999999';
assert.equal(planejar(p,identidade,c,link).totais.identificacao_alterada,1);
const estrutura=clone(n); estrutura.fontes[0].cabecalhos.reverse();
assert.equal(planejar(p,estrutura,c,link).totais.estrutura_alterada,1);
const removida=clone(n); removida.fontes[0].id='outra'; removida.registros[0].fonte='outra';
const ausencia=planejar(p,removida,c);
assert.equal(ausencia.totais.origem_anterior_sem_vinculo_preservar,1);
assert.equal(ausencia.aplicacao_automatica,false);
// A coluna de IA não gera proposta; saldos numéricos semelhantes continuam conferidos.
const ia = clone(p);
ia.fontes[0].cabecalhos = ['Saldo a Distribuir 2028', 'SALDO A DISTRIBUIR ATÉ 2028'];
ia.registros[0].campos = ia.fontes[0].cabecalhos.map(nome => ({nome, original: 10, valor: 10}));
const iaNova = clone(ia);
iaNova.registros[0].campos[0].original = 99;
iaNova.registros[0].campos[0].valor = 99;
const intactos = JSON.stringify([ia, iaNova]);
let planoIA = planejar(ia, iaNova, ia.registros);
assert.equal(planoIA.totais.inalterado, 1);
assert.deepEqual(planoIA.itens[0].colunas_excluidas, [0]);
assert.deepEqual(planoIA.itens[0].campos, []);
assert.equal(JSON.stringify([ia, iaNova]), intactos);
iaNova.registros[0].campos[1].original = 0;
iaNova.registros[0].campos[1].valor = 0;
planoIA = planejar(ia, iaNova, ia.registros);
assert.deepEqual(planoIA.itens[0].campos, [{coluna:1, estado:'mudanca_origem_a_conferir'}]);
// Exclusão não enfraquece auditoria do histórico nem permite identidade implícita.
const iaCorrompida = clone(ia.registros); iaCorrompida[0].campos[0].original = 5;
assert.throws(() => planejar(ia, iaNova, iaCorrompida));
const iaOutraFonte = clone(iaNova); iaOutraFonte.fontes[0].sha256 = 'outro'; iaOutraFonte.registros[0].origem_sha256 = 'outro';
assert.equal(planejar(ia, iaOutraFonte, ia.registros).totais.identidade_a_confirmar, 1);
const docs=clone(p); docs.registros.push({...clone(p.registros[0]),id:'segunda',linha:3}); docs.fontes[0].registros=2;
let inv=inventariar(docs); assert.equal(inv.arquivos.length,1); assert.equal(inv.arquivos[0].referencias.length,2);
assert.equal(inv.arquivos[0].referencias[0].obrigacao,'DEFIS');
docs.registros[1].cnpj='00000000000000'; inv=inventariar(docs);
assert.equal(inv.arquivos.length,2); assert.equal(inv.arquivos[1].identidade_valida,false);
assert.equal(inv.binarios_copiados,0);
const output=JSON.stringify({plano:planejar(p,n,c,link),inventario:inv});
for(const s of ['Empresa privada','privado.pdf','44388152000189','1200']) assert(!output.includes(s));
// CLI offline e saída exclusiva: não sobregrava relatórios existentes.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-delta-'));
try {
  const files=['antes','novo','cci'].map((name,i)=>{const f=path.join(dir,name+'.json'); fs.writeFileSync(f,JSON.stringify([p,n,c][i])); return f;});
  const out=path.join(dir,'out.json'); executar([...files,out]);
  assert.equal(JSON.parse(fs.readFileSync(out)).somente_previa,true);
  assert.equal(fs.statSync(out).mode & 0o777,0o600);
  assert.throws(()=>executar([...files,out]));
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
console.log('CRM delta: identidade, reordenação, conflitos, edições, nulos/zero, anexos e CLI offline OK');
