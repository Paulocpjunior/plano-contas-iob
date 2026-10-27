'use strict';
const {movimentos,marcar}=require('./conciliacao-manual');
const {normalizarConta}=require('./admin-exclusao-lancamentos');
const crypto=require('crypto');
// O campo da tela é "Conta reduzida". Sem pontos, um código estrutural (1.1) pode coincidir com
// um reduzido (11); o reduzido vence, como no Razão, e o código só é usado quando nenhum reduzido bate.
function candidatasConta(conta,contas){
 const alvo=normalizarConta(conta),por=campo=>contas.filter(c=>c[campo]&&normalizarConta(c[campo])===alvo);
 const reduzidas=por('reduzido');
 return reduzidas.length?reduzidas:por('codigo');
}
function rotulo(c){return [c.codigo,c.reduzido&&'reduzido '+c.reduzido,c.descricao].filter(Boolean).join(' — ');}
function assinar(rows){return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
function contextoConciliacao(entries,conta,contas,grupos,situacao){
 if(!conta)return {assinatura:'sem-conta'};
 const alvo=normalizarConta(conta),candidatas=candidatasConta(conta,contas||[]);
 if(candidatas.length>1)throw Error('A conta '+conta+' aparece em '+candidatas.length+' cadastros do plano ativo ('+candidatas.slice(0,5).map(rotulo).join('; ')+'). Corrija o reduzido duplicado em Planos de contas ou informe o código completo da conta.');
 if(!candidatas.length){
  const usada=(entries||[]).filter(e=>[e.contaDebito,e.contaCredito].some(v=>normalizarConta(v)===alvo));
  if(!usada.length)throw Error('A conta '+conta+' não está no plano ativo da empresa nem nos lançamentos da sessão. Confira o reduzido no Razão ou em Planos de contas.');
  if(situacao&&String(situacao).toLowerCase()!=='todos')throw Error('A conta '+conta+' não está no plano ativo da empresa, então não há conciliação S/N para ela. Use Situação da conciliação = Todos ou cadastre a conta em Planos de contas.');
  // Fora do plano não há conciliação: filtra pelo código exatamente como gravado nos lançamentos e avisa.
  return {aliases:new Set([alvo]),aviso:'A conta '+conta+' não está no plano ativo da empresa; a prévia filtra os '+usada.length+' lançamentos da sessão que usam esse código. Confira o cadastro em Planos de contas.',assinatura:assinar(['fora-do-plano',alvo,usada.map(e=>String(e.id))])};
 }
 const cadastro=candidatas[0],dados=movimentos(entries,cadastro.codigo,[cadastro]);
 const rows=marcar(dados.rows,grupos.filter(g=>g.conta===cadastro.codigo));
 return {aliases:new Set([cadastro.codigo,cadastro.reduzido].filter(Boolean).map(normalizarConta)),situacoes:new Map(rows.map(r=>[r.id,r.conciliado])),assinatura:assinar(rows.map(r=>[r.id,r.conciliado,r.grupo,r.fingerprint]))};
}
module.exports={contextoConciliacao,candidatasConta};
