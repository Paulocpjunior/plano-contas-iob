'use strict';
const {movimentos,marcar}=require('./conciliacao-manual');
const {normalizarConta}=require('./admin-exclusao-lancamentos');
const crypto=require('crypto');
function contextoConciliacao(entries,conta,contas,grupos){
 if(!conta)return {assinatura:'sem-conta'};
 const candidatas=contas.filter(c=>[c.codigo,c.reduzido].some(v=>v && normalizarConta(v)===normalizarConta(conta)));
 if(candidatas.length!==1)throw Error('Conta não encontrada ou ambígua. Informe código ou reduzido do plano ativo.');
 const cadastro=candidatas[0],dados=movimentos(entries,cadastro.codigo,contas);
 const rows=marcar(dados.rows,grupos.filter(g=>g.conta===cadastro.codigo));
 return {aliases:new Set([cadastro.codigo,cadastro.reduzido].filter(Boolean).map(normalizarConta)),situacoes:new Map(rows.map(r=>[r.id,r.conciliado])),assinatura:crypto.createHash('sha256').update(JSON.stringify(rows.map(r=>[r.id,r.conciliado,r.grupo,r.fingerprint]))).digest('hex')};
}
module.exports={contextoConciliacao};
