// BRB: extrato mensal com historico em duas linhas e sinal monetario explicito.
(function(root) {
  'use strict';
  function parsearPaginasBRB(paginas) {
    const texto = paginas.flat().map(i => i.str).join(' ');
    const vazio = {detectado:false,lancamentos:[],textoCompleto:texto};
    // O logotipo BRB e uma imagem; assinatura estrutural completa do documento.
    const conta = texto.match(/Ag[eê]ncia:\s*(\d+)\s*[—–-]\s*Conta Corrente:\s*(\d{3}\.\d{3}\.\d{3}-\d)/i);
    if (!conta || !/Saldo da Poupan[cç]a\s*\/\s*CDB Autom[aá]tico\s*\/\s*Fundo Autom[aá]tico/i.test(texto) || !/DOC:\s*\d+/.test(texto)) return vazio;
    const meses = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
    const competencias = [...texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').matchAll(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})\b/g)].map(m=>m[2]+'-'+String(meses.indexOf(m[1])+1).padStart(2,'0'));
    if (!competencias.length || new Set(competencias).size !== 1) throw new Error('BRB: competencia mensal ausente ou ambigua.');
    const competencia=competencias[0], ano=Number(competencia.slice(0,4)), mes=Number(competencia.slice(5));
    const ultimo=new Date(ano,mes,0).getDate();
    const lancamentos=[];
    for (const itens of paginas) {
      const datas=itens.filter(i=>/^\d{2}\/\d{2}$/.test(i.str.trim()) && i.transform[4]<50).sort((a,b)=>b.transform[5]-a.transform[5]);
      for (const d of datas) {
        const y=d.transform[5], data=d.str.trim();
        if (Number(data.slice(3))!==mes || Number(data.slice(0,2))<1 || Number(data.slice(0,2))>ultimo) throw new Error('BRB: data fora da competencia: '+data);
        const valorTexto=itens.filter(i=>i.transform[4]>450 && Math.abs(i.transform[5]-y)<2).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('').replace(/\s/g,'').replace(/−/g,'-');
        const m=valorTexto.match(/^R\$([+-])([\d.]+,\d{2})$/);
        if(!m) throw new Error('BRB: valor ou sinal ilegivel em '+data);
        const descricao=itens.filter(i=>i.transform[4]>=50 && i.transform[4]<450 && Math.abs(i.transform[5]-y)<9).sort((a,b)=>Math.abs(a.transform[5]-b.transform[5])>2 ? b.transform[5]-a.transform[5] : a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
        if(!/DOC:\s*\d+/.test(descricao)) throw new Error('BRB: historico incompleto em '+data);
        const valor=Number(m[2].replace(/\./g,'').replace(',','.'))*(m[1]==='-'?-1:1);
        if ((/^DEBITO/.test(descricao)&&valor>0)||(/^CREDITO/.test(descricao)&&valor<0)) throw new Error('BRB: sinal divergente do historico em '+data);
        lancamentos.push({data:competencia+'-'+data.slice(0,2),descricao,documento:(descricao.match(/DOC:\s*(\d+)/)||[])[1]||'',valor,tipo:valor<0?'D':'C',contaDebito:'',contaCredito:'',codigoHistorico:'',historico:descricao,incomum:false,origem:'pdf-brb-extrato'});
      }
    }
    const qtdDoc= (texto.match(/DOC:\s*\d+/g)||[]).length;
    if(!lancamentos.length || lancamentos.length!==qtdDoc) throw new Error('BRB: quantidade de historicos diverge das linhas reconhecidas.');
    const r2=v=>Math.round(v*100)/100;
    return {detectado:true,lancamentos,textoCompleto:texto,banco_detectado:'070',fingerprint:'brb-extrato-mensal-v1',conta_detectada:'AG-'+conta[1]+'/CC-'+conta[2],nome_conta_detectado:'AG-'+conta[1]+'/CC-'+conta[2],periodo_inicio:competencia+'-01',periodo_fim:competencia+'-'+ultimo,total_credito:r2(lancamentos.reduce((s,l)=>s+Math.max(l.valor,0),0)),total_debito:r2(lancamentos.reduce((s,l)=>s+Math.max(-l.valor,0),0))};
  }
  async function parsearPDF_BRB_Extrato(buffer) {
    const pdf=await pdfjsLib.getDocument({data:buffer}).promise;
    const paginas=[];
    for(let p=1;p<=pdf.numPages;p++) paginas.push((await(await pdf.getPage(p)).getTextContent()).items);
    return parsearPaginasBRB(paginas);
  }
  root.parsearPDF_BRB_Extrato=parsearPDF_BRB_Extrato;
  if(typeof module!=='undefined'&&module.exports) module.exports={parsearPDF_BRB_Extrato,parsearPaginasBRB};
})(typeof window!=='undefined'?window:globalThis);
