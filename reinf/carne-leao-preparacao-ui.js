(function(root){
  'use strict';
  const U=root.ReinfAlugueisPlanilha,P=root.CarneLeaoPreparacao;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  root.montarPreparacaoCarneLeao=function(container,contexto){
    const host=container;container=document.createElement('div');host.replaceChildren(container);
    let indice=-1,revisoes={},preparado=null,revision=0,ocupado=false;
    const {analise,proprietarios}=contexto,rs=analise.registros.filter(r=>r.tipo==='carne_leao'&&!r.naoPago);
    const $=id=>container.querySelector('[data-cl="'+id+'"]');
    container.innerHTML=`<section class="rap-review"><h3>Preparar Carnê-Leão</h3><p class="rap-note">Selecione o proprietário e confira sua participação em cada recebimento. O valor sugerido inclui o total recebido, inclusive IPTU. Informe somente exclusões comprovadas e suportadas pelo proprietário. Datas múltiplas devem ser separadas em pagamentos. Não use a data do repasse da administradora.</p><label>Proprietário / CPF <select data-cl="owner"><option value="">Selecione</option>${proprietarios.map((p,i)=>`<option value="${i}">${esc(p.nome)} — ${esc(p.cpf)||'CPF pendente'} (${esc(p.percentual)}%)</option>`).join('')}</select></label><details><summary>Conferir recebimentos do proprietário</summary><div data-cl="rows"></div></details><div class="rap-tools"><label>Outros rendimentos PF/exterior no mês (R$)<input data-cl="outros" type="number" min="0" step="0.01" value="0"></label><label>Deduções legais mensais (R$)<input data-cl="deducoes" type="number" min="0" step="0.01" value="0"></label></div><p><label><input data-cl="simplificado" type="checkbox" checked> Comparar desconto simplificado mensal e usar o mais favorável</label></p><p class="rap-note">As deduções mensais entram uma vez no cálculo. Outros rendimentos e deduções mensais devem ser conferidos também no portal; o CSV contém apenas os aluguéis desta planilha.</p><button data-cl="prepare" class="rap-primary" disabled>Preparar Carnê-Leão do proprietário</button> <button data-cl="export" disabled>Baixar CSV para Carnê-Leão Web</button> <button data-cl="memory" disabled>Baixar memória da preparação</button><div data-cl="result" role="status" aria-live="polite"></div><p class="rap-note">Preparação e exportação não transmitem à Receita. No Carnê-Leão Web, acesse o CPF do proprietário → Escrituração → Importar Escrituração → Analisar arquivo. Confira antes de importar: nova importação adiciona lançamentos e pode duplicar valores. A memória é baixada para guardar a revisão; esta etapa não salva uma declaração no servidor.</p></section>`;
    function invalidar(){revision++;preparado=null;$('export').disabled=true;$('memory').disabled=true;$('result').textContent='Dados alterados. Prepare novamente para atualizar o cálculo e os arquivos.';}
    function desenhar(){
      $('rows').innerHTML=rs.map((r,i)=>{const rev=revisoes[r.id];return `<details class="rap-review" open><summary>${esc(r.locatario)} — ${esc(r.endereco)}</summary><p class="rap-note">CPF ${esc(r.documento)} · Total da origem ${money(r.recebido||0)} · Datas informadas: ${esc(r.dataOriginal)}. ${esc((r.pendencias||[]).join('; '))}</p>${rev.pagamentos.map((p,j)=>`<div class="rap-tools"><label>Data do recebimento<input type="date" data-row="${i}" data-item="${j}" data-field="data" value="${esc(p.data)}"></label><label>Recebido pelo proprietário (R$)<input type="number" min="0" step="0.01" data-row="${i}" data-item="${j}" data-field="bruto" value="${p.bruto==null?'':(p.bruto/100).toFixed(2)}"></label><label>Exclusões comprovadas (R$)<input type="number" min="0" step="0.01" data-row="${i}" data-item="${j}" data-field="exclusoes" value="${p.exclusoes==null?'':(p.exclusoes/100).toFixed(2)}"></label>${rev.pagamentos.length>1?`<button data-remove="${i}" data-item="${j}">Remover</button>`:''}</div>`).join('')}<button data-add="${i}">Separar mais um pagamento</button><label>Justificativa das exclusões/divergências<input type="text" data-row="${i}" data-field="justificativa" value="${esc(rev.justificativa)}"></label><p><label><input type="checkbox" data-row="${i}" data-field="conferido" ${rev.conferido?'checked':''}> Conferi CPF, datas, participação, valores e exclusões deste recebimento.</label></p></details>`;}).join('');
    }
    $('owner').onchange=()=>{
      invalidar();indice=$('owner').value===''?-1:Number($('owner').value);revisoes={};$('rows').innerHTML='';$('prepare').disabled=indice<0||!rs.length;
      if(indice<0)return;
      try{rs.forEach(r=>{const bruto=r.recebido==null?null:U.ratear(r.recebido,proprietarios)[indice];revisoes[r.id]={conferido:false,justificativa:'',pagamentos:[{data:r.data||'',bruto,exclusoes:0}]};});desenhar();}catch(e){$('result').textContent=e.message;$('prepare').disabled=true;}
    };
    container.addEventListener('input',e=>{
      if(e.target.dataset.cl==='owner')return;
      invalidar();const i=e.target.dataset.row;if(i==null)return;
      const rev=revisoes[rs[Number(i)].id],field=e.target.dataset.field;
      if(field==='conferido')rev.conferido=e.target.checked;
      else {rev.conferido=false;if(field==='justificativa')rev.justificativa=e.target.value;else rev.pagamentos[Number(e.target.dataset.item)][field]=field==='data'?e.target.value:U.cents(e.target.value);container.querySelector('[data-row="'+i+'"][data-field="conferido"]').checked=false;}
    });
    container.addEventListener('click',e=>{const add=e.target.dataset.add,remove=e.target.dataset.remove;if(add==null&&remove==null)return;invalidar();const rev=revisoes[rs[Number(add??remove)].id];rev.conferido=false;if(add!=null)rev.pagamentos.push({data:'',bruto:null,exclusoes:0});else rev.pagamentos.splice(Number(e.target.dataset.item),1);desenhar();});
    $('prepare').onclick=async()=>{
      if(ocupado)return;invalidar();const snapshot=revision;
      try{contexto.vigente();ocupado=true;$('prepare').disabled=true;$('result').textContent='Consultando tabela vigente e preparando...';
        const {tabela}=await contexto.api(contexto.cnpj+'/tabela-ir/'+analise.competencia);
        if(snapshot!==revision||!container.isConnected)return;contexto.vigente();
        preparado=P.preparar(analise,proprietarios,indice,revisoes,{outros:U.cents($('outros').value),deducoes:U.cents($('deducoes').value),simplificado:$('simplificado').checked},tabela);
        preparado.empresa=contexto.cnpj;preparado.arquivo=contexto.arquivo;preparado.preparadoEm=new Date().toISOString();
        const c=preparado.calculo;
        $('result').textContent='Preparado para '+preparado.proprietario.nome+' · CPF '+preparado.proprietario.cpf+' · '+preparado.pagamentos.length+' recebimentos. Rendimento tributável: '+money(preparado.rendimento)+' · Dedução mensal aplicada: '+money(Math.round(c.deducao*100))+' · Base: '+money(Math.round(c.base*100))+' · IR: '+money(Math.round(c.imposto*100))+'. Tabela: '+c.versao+'. Nenhum dado transmitido.';
        $('export').disabled=false;$('memory').disabled=false;
      }catch(e){if(snapshot===revision)$('result').textContent=e.message;}finally{ocupado=false;$('prepare').disabled=indice<0||!rs.length;}
    };
    function baixar(memoria){try{contexto.vigente();if(!preparado)throw Error('Prepare novamente antes de exportar.');const nome='carne-leao-'+preparado.proprietario.cpf+'-'+preparado.competencia;const blob=new Blob([memoria?JSON.stringify(preparado,null,2):P.csv(preparado)],{type:memoria?'application/json':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nome+(memoria?'-memoria.json':'.csv');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('result').textContent=e.message;}}
    $('export').onclick=()=>baixar(false);$('memory').onclick=()=>baixar(true);
    return {invalidar};
  };
})(window);
