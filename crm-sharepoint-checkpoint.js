'use strict';
// Separacao explicita entre inventario inicial e mudancas subsequentes.
// Persistencia e concorrencia devem ser implementadas pelo adaptador transacional.
function erro(m){throw Object.assign(new Error(m),{status:400});}
function prepararCiclo({estado,leitura}){
 if(!leitura || leitura.completo!==true || !leitura.checkpoint) erro('Delta incompleto: nao avance checkpoint.');
 if(!estado || estado.fase==='novo'){
   return {fase:'inventario_inicial',eventos_para_notificar:[],checkpoint_proposto:leitura.checkpoint,
     itens_para_indexar:leitura.itens||[],confirmacao_transacional_necessaria:true};
 }
 if(estado.fase!=='ativo' || !estado.checkpoint) erro('Estado da biblioteca invalido.');
 return {fase:'incremental',eventos_para_notificar:leitura.itens||[],
   checkpoint_anterior:estado.checkpoint,checkpoint_proposto:leitura.checkpoint,
   confirmacao_transacional_necessaria:true};
}
module.exports={prepararCiclo};
