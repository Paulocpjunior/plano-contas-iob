(function(root){
  'use strict';
  const U=root.ReinfAlugueisPlanilha,C=root.AlugueisConferencia;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moeda=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let sequencia=0;
  root.montarConferenciaAlugueis=function(container,contexto){
    const seq=++sequencia;
    container.innerHTML=`<details class="rap-review"><summary>Conferir prestação de contas e calcular IR mensal</summary>
    <p class="rap-note">O recebimento do locatário pela administradora define a data do aluguel para o IR. O repasse ao proprietário tem data própria, sem dia fixo. Data de fechamento não comprova pagamento. Lucros da PEC são conferidos separadamente.</p>
    <label>Planilhas de apoio (pode selecionar várias)<input data-id="arquivos" type="file" multiple accept=".xlsx,.xls"></label><div data-id="auditoria" role="status"></div>
    <h3>Conferência mensal de IR por proprietário</h3><p class="rap-note">Informe o rendimento tributável após as exclusões de aluguel comprovadas e antes das deduções mensais de IR. Para Carnê-Leão, reúna os rendimentos de PF/exterior do proprietário; para IRRF, reúna os pagamentos da mesma fonte ao CPF no mês. Outros rendimentos precisam ser considerados. Não use o repasse líquido como base. O resultado é uma simulação e não altera o IRRF informado nem prepara eventos.</p>
    <div class="rap-tools"><label>Competência fiscal<input data-id="mes" type="month"></label><label>Proprietário / CPF<input data-id="beneficiario" type="text" placeholder="Identifique o beneficiário"></label><label>Rendimento tributável mensal (R$)<input data-id="renda" type="number" min="0" step="0.01"></label><label>Deduções legais mensais (R$)<input data-id="deducoes" type="number" min="0" step="0.01" value="0"></label><label>IR informado (R$), opcional<input data-id="informado" type="number" min="0" step="0.01"></label></div>
    <label><input data-id="simplificado" type="checkbox" checked> Comparar com desconto simplificado mensal e usar o mais favorável</label><p><button data-id="calcular">Consultar tabela oficial e conferir IR</button></p><div data-id="ir" role="status"></div></details>`;
    const $=id=>container.querySelector('[data-id="'+id+'"]');
    let revisao=0;
    container.addEventListener('input',e=>{if(e.target.dataset.id!=='arquivos'){revisao++;$('ir').textContent='Dados alterados. Consulte novamente para atualizar a conferência.';}});
    $('arquivos').onchange=async e=>{
      const files=[...e.target.files];if(!files.length)return;
      try{contexto.vigente();if(files.length>8||files.some(f=>f.size>15*1024*1024))throw Error('Selecione até 8 planilhas, de até 15 MB cada.');$('auditoria').textContent='Conferindo valores, fórmulas e datas...';const arquivos=[];
        for(const f of files){const wb=root.XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true,cellFormula:true});arquivos.push({nome:f.name,abas:wb.SheetNames.map(nome=>({nome,cells:wb.Sheets[nome],rows:root.XLSX.utils.sheet_to_json(wb.Sheets[nome],{header:1,raw:true,defval:'',range:0})}))});}
        if(seq!==sequencia)return;contexto.vigente();const a=C.auditar(arquivos);
        $('auditoria').innerHTML=`<p>${a.formulasConferidas} fórmulas aritméticas conferidas; ${a.formulasNaoConferidas} fora do avaliador e dependentes de conferência. ${a.achados.length} apontamentos. As fórmulas não comprovam, sozinhas, o pagamento nem a classificação fiscal.</p>`+
          (a.naoConferidas.length?'<details><summary>Ver fórmulas não conferidas</summary>'+a.naoConferidas.map(x=>'<p>'+esc(x.arquivo)+' · '+esc(x.aba)+' · '+esc(x.celula)+': '+esc(x.motivo)+'</p>').join('')+'</details>':'')+
          (a.achados.length?'<table class="rap-table"><thead><tr><th>Arquivo / aba / célula</th><th>Divergência ou pendência</th></tr></thead><tbody>'+a.achados.map(x=>`<tr><td>${esc(x.arquivo)}<small>${esc(x.aba)} · ${esc(x.celula)}</small></td><td>${esc(x.mensagem)}</td></tr>`).join('')+'</tbody></table>':'<p>Nenhuma divergência nas verificações executadas.</p>')+
          '<h4>Repasses identificados</h4><p class="rap-note">Não conciliados com extrato bancário. Recebimentos e repasses podem ocorrer em meses diferentes.</p><table class="rap-table"><thead><tr><th>Descrição / origem</th><th>Data real informada</th><th>Valor</th></tr></thead><tbody>'+a.repasses.map(r=>`<tr><td>${esc(r.descricao)}<small>${esc(r.arquivo)} · ${esc(r.aba)} · linha ${r.linha}</small></td><td>${esc(r.data)||'Pendente'}</td><td>${moeda(r.valor/100)}</td></tr>`).join('')+'</tbody></table>';
      }catch(err){if(seq===sequencia)$('auditoria').textContent=err.message;}finally{e.target.value='';}
    };
    $('calcular').onclick=async()=>{
      try{contexto.vigente();const mes=$('mes').value,renda=U.cents($('renda').value),deducoes=U.cents($('deducoes').value),nome=$('beneficiario').value.trim(),simp=$('simplificado').checked,informado=$('informado').value===''?null:U.cents($('informado').value);if(!nome||!mes||renda===null||deducoes===null)throw Error('Informe competência, beneficiário, rendimento e deduções.');
        const rev=revisao;$('calcular').disabled=true;$('ir').textContent='Consultando a tabela oficial para '+mes+'...';
        const resposta=await contexto.api(contexto.cnpj+'/tabela-ir/'+mes);if(seq!==sequencia||rev!==revisao)return;contexto.vigente();
        const t=resposta.tabela,r=C.calcular(t,mes,renda,deducoes,simp);
        $('ir').innerHTML=`<div class="rap-status"><strong>${esc(nome)} · ${esc(mes)} — IR calculado: ${moeda(r.imposto)}</strong><br>Base: ${moeda(r.base)} · Dedução mensal aplicada: ${moeda(r.deducao)} · Redução: ${moeda(r.reducao)}${informado!==null?'<br>IR informado: '+moeda(informado/100)+' · Diferença: '+moeda(r.imposto-informado/100):''}<br><a href="${esc(t.fonte)}" target="_blank" rel="noopener">Receita Federal — tabela consultada</a> · Vigência ${esc(t.inicio)} a ${esc(t.fim)}<br>Consulta: ${esc(t.consultadaEm)} · Versão: ${esc(t.versao.slice(0,12))}</div>`;
      }catch(err){if(seq===sequencia)$('ir').textContent=err.message;}finally{if(seq===sequencia)$('calcular').disabled=false;}
    };
  };
})(window);
