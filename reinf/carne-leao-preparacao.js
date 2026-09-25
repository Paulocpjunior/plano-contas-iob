(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./reinf-alugueis-planilha'),require('./alugueis-conferencia'));else root.CarneLeaoPreparacao=factory(root.ReinfAlugueisPlanilha,root.AlugueisConferencia);})(typeof globalThis!=='undefined'?globalThis:this,function(U,C){
  'use strict';
  function valor(v,nome){if(!Number.isSafeInteger(v)||v<0||v>9999999999999)throw Error(nome+' inválido.');return v;}
  function preparar(analise,proprietarios,indice,revisoes,opcoes,tabela){
    const p=proprietarios[indice];U.validarProprietarios(proprietarios,false);
    if(!p||!U.documentoValido(p.cpf,11))throw Error('Informe um CPF válido para o proprietário selecionado.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(analise.competencia))throw Error('Competência inválida.');
    const fontes=analise.registros.filter(r=>r.tipo==='carne_leao'&&!r.naoPago);
    if(!fontes.length)throw Error('Não há recebimentos PF para preparar.');
    const vistos=new Set(),pagamentos=[];
    for(const r of fontes){
      if(vistos.has(r.id))throw Error('Linha de origem duplicada.');vistos.add(r.id);
      const rev=revisoes[r.id];
      if(!rev?.conferido)throw Error('Confira o recebimento de '+r.locatario+'.');
      if(!U.documentoValido(r.documento,11))throw Error('CPF do locatário inválido: '+r.locatario+'. Corrija a planilha.');
      if(r.irrf!==0)throw Error('IRRF inesperado em pagamento PF: '+r.locatario+'. Confira a origem.');
      const esperado=U.ratear(valor(r.recebido,'Recebimento'),proprietarios)[indice];
      if(!Array.isArray(rev.pagamentos)||!rev.pagamentos.length)throw Error('Discrimine os pagamentos de '+r.locatario+'.');
      let soma=0;
      for(const item of rev.pagamentos){
        const data=U.date(item.data),bruto=valor(item.bruto,'Valor recebido'),exclusoes=valor(item.exclusoes,'Exclusões');
        if(!data||data.slice(0,7)!==analise.competencia)throw Error('Data inválida ou fora da competência: '+r.locatario+'.');
        if(bruto<=0||exclusoes>bruto)throw Error('Valor ou exclusões inválidos: '+r.locatario+'.');
        soma+=bruto;
        if((exclusoes>0||(r.pendencias||[]).length)&&!String(rev.justificativa||'').trim())throw Error('Justifique as exclusões/divergências de '+r.locatario+'.');
        pagamentos.push({origem:r.id,data,bruto,exclusoes,tributavel:bruto-exclusoes,locatario:r.locatario,cpf:U.digits(r.documento),imovel:r.endereco,justificativa:String(rev.justificativa||'').trim()});
      }
      if(soma!==esperado)throw Error('A soma dos recebimentos de '+r.locatario+' deve corresponder à participação do proprietário: R$ '+(esperado/100).toFixed(2)+'.');
    }
    if(pagamentos.length>1000)throw Error('O arquivo excede 1.000 pagamentos.');
    const outros=valor(opcoes.outros,'Outros rendimentos'),deducoes=valor(opcoes.deducoes,'Deduções mensais');
    const rendimento=pagamentos.reduce((s,p)=>s+p.tributavel,0)+outros;
    const calculo=C.calcular(tabela,analise.competencia,rendimento,deducoes,opcoes.simplificado===true);
    return {versao:1,competencia:analise.competencia,proprietario:{nome:p.nome,cpf:U.digits(p.cpf),percentual:p.percentual},pagamentos,outros,deducoes,simplificado:opcoes.simplificado===true,rendimento,calculo,tabela,status:'preparado',transmitido:false};
  }
  // Receita Federal: formato-arquivo e rendimentos, consultados em 25/09/2026.
  // Sem cabeçalho. Exclusões do aluguel por recebimento; deduções mensais não se repetem no CSV.
  function csv(preparado){
    const decimal=v=>(v/100).toFixed(2).replace('.',',');
    const texto=v=>String(v||'').replace(/[;\r\n"]/g,' ').replace(/^[=+@-]/,"'").slice(0,255);
    return preparado.pagamentos.map(p=>[p.data.split('-').reverse().join('/'),'R01.003.001','',decimal(p.bruto),decimal(p.exclusoes),texto('Aluguel '+p.imovel+' - '+p.locatario),'PF',p.cpf,'','','','N',''].join(';')).join('\r\n')+'\r\n';
  }
  return {preparar,csv};
});
