(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReinfAlugueisPlanilha = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = v => String(v ?? '').replace(/\D/g, '');
  const cents = v => {
    if (v === '' || v == null || typeof v === 'boolean') return null;
    if (typeof v === 'string' && !/^\s*(?:R\$\s*)?-?[\d.,]+\s*$/.test(v)) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/R\$|\s/g, '').replace(/\.(?=.*[,])/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : null;
  };
  function date(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{2}|\d{4})$/);
    const iso = m ? (m[3].length === 2 ? '20'+m[3] : m[3]) + '-' + m[2] + '-' + m[1] : s;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(Date.parse(iso)) && new Date(iso+'T00:00:00Z').toISOString().slice(0,10) === iso ? iso : '';
  }
  function documentoValido(v, tamanho) {
    const d = digits(v);
    if (d.length !== tamanho || /^(\d)\1+$/.test(d)) return false;
    const calcular = base => {
      let soma=0;
      for (let i=base.length-1,peso=2;i>=0;i--,peso++) { if(tamanho===14 && peso>9) peso=2; soma+=Number(base[i])*peso; }
      const mod=soma%11; return mod<2?0:11-mod;
    };
    return calcular(d.slice(0,-2))===Number(d.at(-2)) && calcular(d.slice(0,-1))===Number(d.at(-1));
  }
  function analisar(abas) {
    const igrejas=analisarIgrejas(abas);
    if(igrejas) return igrejas;
    const registros=[], proprietarios=[], avisos=[], competencias=new Set();
    const tipos={IRPFXPJ:'reinf',IRPFXPF:'carne_leao',IRPJXPJ:'locador_pj'};
    const meses=['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
    for(const aba of abas) {
      const tipo=tipos[norm(aba.nome)];
      if(!tipo) continue;
      const rows=aba.rows;
      const h=rows.findIndex(r=>r.some(c=>norm(c)==='ENDERECO')&&r.some(c=>norm(c)==='DATARECEBIMENTO'));
      if(h<0) throw Error('Cabeçalho não reconhecido na aba '+aba.nome+'.');
      const taxas=(rows[h+1]||[]).flatMap((v,c)=>norm(v)==='TAXA'?rows.slice(0,h).map(row=>row[c]).filter(v=>typeof v==='number'&&v>0&&v<=1):[]);
      const taxaAdministracaoPercentual=tipo==='carne_leao'&&new Set(taxas).size===1?taxas[0]*100:null;
      const headers=rows[h].map(norm);
      const col=aliases=>headers.findIndex(c=>aliases.includes(c));
      const ix={endereco:col(['ENDERECO']),nome:col(['LOCATARIOA','LOCATARIO']),aluguel:col(['VALORALUGUEL']),iptu:col(['VALORIPTU','IPTU']),irrf:col(['IRRETIDOFONTE','IRRETIDONAFONTE']),previsto:col(['TOTALARECEBER']),recebido:col(['VALORRECEBIDO']),data:col(['DATARECEBIMENTO']),liquido:col(['ALUGUELLIQUIDORECEBIDO','VALORALUGUELLIQUIDO']),iptuRecebido:col(['IPTURECEBIDO']),documento:col(['CPFCNPJLOCATARIOS','CPFCNPJLOCATARIO']),obs:col(['OBSERVACOES'])};
      if(Object.entries(ix).some(([k,v])=>k!=='obs'&&v<0)) throw Error('Faltam colunas obrigatórias na aba '+aba.nome+'.');
      const cab=norm(rows.slice(0,h).flat().join(' '));
      const cp=cab.match(/PAGOEM([A-Z]+)(20\d{2})/);
      if(cp && meses.includes(cp[1])) competencias.add(cp[2]+'-'+String(meses.indexOf(cp[1])+1).padStart(2,'0'));
      rows.slice(h+1).forEach((r,i)=>{
        const linha=h+i+2;
        if(tipo==='reinf' && typeof r[1]==='number' && r[1]>0 && r[1]<=1 && /^[A-Za-zÀ-ÿ ]+$/.test(String(r[0]||''))) {
          proprietarios.push({nome:String(r[0]).trim(),percentual:Math.round(r[1]*10000)/100,cpf:''}); return;
        }
        if(typeof r[ix.nome] !== 'string' || !String(r[ix.nome]).trim() || typeof r[ix.endereco] !== 'string' || !String(r[ix.endereco]).trim()) return;
        const recebido=cents(r[ix.recebido]), irrf=cents(r[ix.irrf]);
        const naoPago=norm(r[ix.recebido])==='NAOPAGOU';
        const registro={id:aba.nome.trim()+':'+linha,aba:aba.nome,linha,tipo,endereco:String(r[ix.endereco]).trim(),locatario:String(r[ix.nome]).trim(),documento:digits(r[ix.documento]),
          aluguel:cents(r[ix.aluguel]),iptu:cents(r[ix.iptu]),irrf:irrf===null && (r[ix.irrf]==null||r[ix.irrf]==='')?(tipo==='reinf'?null:0):irrf,
          previsto:cents(r[ix.previsto]),recebido,liquido:cents(r[ix.liquido]),iptuRecebido:cents(r[ix.iptuRecebido]),data:date(r[ix.data]),dataOriginal:String(r[ix.data]||''),observacao:String(r[ix.obs]||''),naoPago,pendencias:[]};
        if(tipo==='carne_leao')registro.taxaAdministracaoPercentual=taxaAdministracaoPercentual;
        if(!documentoValido(registro.documento,tipo==='carne_leao'?11:14)) registro.pendencias.push('CPF/CNPJ do locatário inválido');
        if(!naoPago) {
          if(!registro.data) registro.pendencias.push('Data de recebimento ausente ou múltipla: '+registro.dataOriginal);
          if([registro.aluguel,registro.irrf,registro.recebido,registro.liquido,registro.iptuRecebido].some(v=>v===null||v<0)) registro.pendencias.push('Valor ausente, inválido ou erro de fórmula');
          if(recebido!==null && registro.liquido!==null && registro.iptuRecebido!==null && recebido!==registro.liquido+registro.iptuRecebido) registro.pendencias.push('Recebido difere de aluguel líquido + IPTU recebido');
          if(registro.aluguel!==null && registro.liquido!==null && registro.irrf!==null && registro.aluguel!==registro.liquido+registro.irrf) registro.pendencias.push('Recebimento diferente do aluguel previsto: conferir compensação, acréscimo ou mais de um pagamento');
        }
        registros.push(registro);
      });
    }
    if(!registros.length) throw Error('Planilha de aluguéis não reconhecida. Use as abas IR PF x PJ, IR PF x PF e/ou IR PJ x PJ.');
    if(competencias.size!==1) avisos.push('Competência de pagamento ausente ou divergente entre abas.');
    const competencia=competencias.size===1?[...competencias][0]:'';
    for(const r of registros) if(r.data && competencia && r.data.slice(0,7)!==competencia) r.pendencias.push('Recebimento fora da competência de pagamento');
    return {versao:1,competencia,proprietarios,registros,avisos};
  }
  // Church workbooks identify each beneficiary directly; no shared ownership rateio.
  function analisarIgrejas(abas) {
    const registros=[], competencias=new Set();
    for(const aba of abas) {
      let ix=null;
      aba.rows.forEach((row,index)=>{
        const h=row.map(norm);
        if(h.includes('NOMEPROPRIETARIO')&&h.includes('CNPJPROPRIETARIO')&&h.includes('BRUTO')) {
          ix={nome:h.indexOf('NOMEPROPRIETARIO'),doc:h.indexOf('CNPJPROPRIETARIO'),fonte:h.indexOf('CNPJ'),local:h.indexOf('LOCALIDADE'),codigo:h.indexOf('CODIGOCDG'),mes:h.indexOf('APURACAO'),bruto:h.indexOf('BRUTO'),irrf:h.indexOf('IRRF'),liquido:h.indexOf('LIQUIDO')};
          if(Object.values(ix).some(i=>i<0)) throw Error('Faltam colunas do modelo de igrejas na aba '+aba.nome+'.');
          return;
        }
        if(!ix)return;
        if(![ix.nome,ix.doc,ix.fonte,ix.local,ix.codigo,ix.mes].some(i=>String(row[i]??'').trim()))return;
        const documento=digits(row[ix.fonte]), beneficiario=digits(row[ix.doc]);
        const apuracao=date(row[ix.mes]);
        const competencia=apuracao?apuracao.slice(0,7):String(row[ix.mes]??'').match(/^(\d{4}-\d{2})$/)?.[1]||'';
        if(competencia)competencias.add(competencia);
        const r={id:aba.nome+':'+(index+1),aba:aba.nome,linha:index+1,tipo:beneficiario.length===14?'locador_pj':'reinf',endereco:String(row[ix.local]||''),locatario:aba.nome,documento,beneficiario,nomeBenef:String(row[ix.nome]||'').trim(),competencia,codigo:digits(row[ix.codigo]),aluguel:cents(row[ix.bruto]),irrf:cents(row[ix.irrf]),liquido:cents(row[ix.liquido]),recebido:cents(row[ix.liquido]),iptuRecebido:null,data:'',dataOriginal:'',observacao:'Apuração: '+competencia,naoPago:false,pendencias:[]};
        if(!documentoValido(documento,14))r.pendencias.push('CNPJ da fonte inválido');
        if(!documentoValido(beneficiario,r.tipo==='reinf'?11:14))r.pendencias.push('CPF/CNPJ do proprietário inválido');
        if(!r.nomeBenef)r.pendencias.push('Nome do proprietário ausente');
        if(!competencia)r.pendencias.push('Apuração ausente ou inválida');
        if(r.tipo==='reinf'&&r.codigo!=='3208')r.pendencias.push('Código de receita diferente de 3208');
        if([r.aluguel,r.irrf,r.liquido].some(v=>v===null||v<0))r.pendencias.push('Valor ausente, inválido ou erro de fórmula');
        if([r.aluguel,r.irrf,r.liquido].every(v=>v!==null)&&r.aluguel-r.irrf!==r.liquido)r.pendencias.push('Bruto menos IRRF difere do líquido');
        registros.push(r);
      });
    }
    if(!registros.length)return null;
    if(abas.some(a=>['IRPFXPJ','IRPFXPF','IRPJXPJ'].includes(norm(a.nome))))throw Error('Separe os modelos PEC e igrejas em arquivos diferentes para conferir todas as linhas.');
    return {versao:1,modelo:'igrejas',competencia:competencias.size===1?[...competencias][0]:'',proprietarios:[],registros,avisos:['A coluna Apuração não informa a data efetiva do pagamento. Informe a data na conferência. O IRRF informado será preservado.']};
  }
  const TIPOS_DEDUCAO_ALUGUEL={1:'Previdência oficial',5:'Pensão alimentícia',7:'Dependentes',8:'Desconto simplificado mensal'};
  function conferirDeducoes(deducoes,rendimentoTrib,baseIrrf) {
    if(!Array.isArray(deducoes)||deducoes.length>4)throw Error('Informe as deduções por tipo (1, 5, 7 ou 8).');
    const vistos=new Set();let legais=0,simplificado=0;
    const lista=deducoes.map(d=>{
      const tipo=Number(d.indTpDeducao),valor=cents(d.vlrDeducao);
      if(!TIPOS_DEDUCAO_ALUGUEL[tipo]||vistos.has(tipo))throw Error('Tipo de dedução inválido ou repetido para aluguel.');
      if(!Number.isSafeInteger(valor)||valor<=0)throw Error('O valor da dedução deve ser maior que zero.');
      if([5,7].includes(tipo)&&d.semDetalhamento!==true)throw Error('Confirme a ausência de detalhamento de dependentes/alimentandos; este fluxo informa o total.');
      vistos.add(tipo);if(tipo===8)simplificado=valor;else legais+=valor;
      return {indTpDeducao:tipo,vlrDeducao:valor/100,...([5,7].includes(tipo)?{semDetalhamento:true}:{})};
    });
    if(simplificado&&legais>simplificado)throw Error('As deduções legais superam o desconto simplificado. Revise a opção pelo tipo 8.');
    const tributavel=cents(rendimentoTrib),base=cents(baseIrrf),aplicada=simplificado||legais;
    if(tributavel===null||tributavel<0||base===null||base<0||base!==Math.max(0,tributavel-aplicada))throw Error('A base após deduções deve corresponder ao rendimento tributável menos a dedução aplicada.');
    return {deducoes:lista,rendimentoTrib:tributavel/100,baseIrrf:base/100,deducaoAplicada:aplicada/100};
  }
  function prepararIgrejas(analise,revisoes,cnpjFonte,competencia) {
    const fonte=digits(cnpjFonte);
    if(!documentoValido(fonte,14))throw Error('Selecione uma fonte pagadora com CNPJ válido.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)||competencia!==analise.competencia)throw Error('Confira a competência da planilha.');
    const rs=analise.registros.filter(r=>r.tipo==='reinf'&&r.documento===fonte);
    if(!rs.length)throw Error('Nenhum proprietário PF desta fonte.');
    const out=rs.map(r=>{
      const rev=revisoes[r.id];
      if(!rev?.conferido)throw Error('Confira o pagamento de '+r.nomeBenef+' (linha '+r.linha+').');
      if(!documentoValido(r.beneficiario,11)||!r.nomeBenef||r.codigo!=='3208'||r.competencia!==competencia)throw Error('Corrija a identificação na linha '+r.linha+'.');
      const data=date(rev.data);
      if(!data||data.slice(0,7)!==competencia)throw Error('Informe a data real do pagamento na competência: linha '+r.linha+'.');
      const ded=rev.rendimentoTrib!=null||rev.deducoes?.length?conferirDeducoes((rev.deducoes||[]).map(d=>({indTpDeducao:d.indTpDeducao,vlrDeducao:d.valor==null?null:d.valor/100,semDetalhamento:d.semDetalhamento})),rev.rendimentoTrib==null?null:rev.rendimentoTrib/100,rev.base==null?null:rev.base/100):null;
      if(ded&&cents(ded.rendimentoTrib)>r.aluguel)throw Error('Rendimento tributável maior que o bruto na linha '+r.linha+'.');
      if([r.aluguel,r.irrf,r.liquido,rev.base].some(v=>!Number.isSafeInteger(v)||v<0)||r.aluguel<=0||rev.base>r.aluguel||r.irrf>rev.base)throw Error('Confira bruto, base e IRRF na linha '+r.linha+'.');
      if(r.pendencias.length&&!String(rev.justificativa||'').trim())throw Error('Registre a conferência da divergência na linha '+r.linha+'.');
      return {...(ded?{deducoes:ded.deducoes,rendimentoTrib:ded.rendimentoTrib}:{}),cpfBenef:r.beneficiario,nomeBenef:r.nomeBenef,valorBruto:r.aluguel/100,baseIrrf:rev.base/100,valorIrrf:r.irrf/100,cnpjFonte:fonte,cnpjEstab:fonte,competencia,dtPagamento:data,codigoReceita:'3208',origemIrrf:'informado',origemAluguelPlanilha:[fonte,competencia,norm(r.endereco),data,r.beneficiario].join('|'),observacao:'Igrejas: '+r.aba+' linha '+r.linha+'; '+r.endereco+(rev.justificativa?' | '+rev.justificativa:'')};
    });
    if(new Set(out.map(b=>b.origemAluguelPlanilha)).size!==out.length)throw Error('Pagamentos repetidos: confira localidade, data e proprietário.');
    return out;
  }
  function validarProprietarios(lista, completo=true) {
    if(!Array.isArray(lista)||!lista.length||lista.length>50) throw Error('Informe os proprietários e suas participações.');
    const seen=new Set();let soma=0;
    for(const p of lista) {
      if(!String(p.nome||'').trim()||!Number.isFinite(Number(p.percentual))||Number(p.percentual)<=0) throw Error('Nome e participação do proprietário obrigatórios.');
      if(completo&&!documentoValido(p.cpf,11)) throw Error('Informe CPF válido de '+p.nome+'.');
      const chave=digits(p.cpf)||norm(p.nome);
      if(seen.has(chave)) throw Error('Proprietário repetido.');seen.add(chave);soma+=Math.round(Number(p.percentual)*100);
    }
    if(soma!==10000) throw Error('As participações devem somar 100%.');
    return true;
  }
  function ratear(total,proprietarios) {
    validarProprietarios(proprietarios,false);
    if(!Number.isSafeInteger(total)||total<0) throw Error('Valor inválido para rateio.');
    const partes=proprietarios.map((p,i)=>({i,valor:Math.floor(total*Number(p.percentual)/100),resto:total*Number(p.percentual)/100%1}));
    let faltam=total-partes.reduce((s,p)=>s+p.valor,0);
    for(const p of [...partes].sort((a,b)=>b.resto-a.resto||a.i-b.i)) if(faltam-->0) p.valor++;
    return partes.map(p=>p.valor);
  }
  function preparar(analise, proprietarios, revisoes, cnpjFonte, competencia) {
    if(analise.modelo==='igrejas')return prepararIgrejas(analise,revisoes,cnpjFonte,competencia);
    validarProprietarios(proprietarios);
    const fonte=digits(cnpjFonte);
    if(!documentoValido(fonte,14)) throw Error('Selecione uma fonte pagadora com CNPJ válido.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)||competencia!==analise.competencia) throw Error('Confira a competência de pagamento da planilha.');
    const registros=analise.registros.filter(r=>r.tipo==='reinf'&&r.documento===fonte&&!r.naoPago);
    if(!registros.length) throw Error('Nenhum pagamento PJ para PF desta fonte pagadora.');
    const out=[];
    for(const r of registros) {
      const rev=revisoes[r.id];
      if(!rev||rev.conferido!==true) throw Error('Confira o pagamento de '+r.locatario+' (linha '+r.linha+').');
      if(!r.data||r.data.slice(0,7)!==competencia) throw Error('Corrija a data de recebimento na planilha: linha '+r.linha+'.');
      if([r.aluguel,r.irrf,r.recebido,r.liquido,r.iptuRecebido].some(v=>!Number.isSafeInteger(v)||v<0)) throw Error('Corrija os valores da planilha na linha '+r.linha+'.');
      if(r.recebido!==r.liquido+r.iptuRecebido) throw Error('Recebimento sem conciliação na linha '+r.linha+'.');
      if(r.pendencias.length && !String(rev.justificativa||'').trim()) throw Error('Registre a conferência da divergência na linha '+r.linha+'.');
      if(!Array.isArray(rev.partes)||rev.partes.length!==proprietarios.length) throw Error('Confira os valores por proprietário.');
      let somaBruto=0,somaIrrf=0;
      rev.partes.forEach((v,i)=>{
        if([v.bruto,v.base,v.irrf].some(n=>!Number.isSafeInteger(n)||n<0)||v.base>v.bruto||v.irrf>v.base) throw Error('Bruto, base tributável e IRRF devem ser conferidos por proprietário.');
        somaBruto+=v.bruto;somaIrrf+=v.irrf;
        const p=proprietarios[i];
        out.push({cpfBenef:digits(p.cpf),nomeBenef:p.nome,valorBruto:v.bruto/100,baseIrrf:v.base/100,valorIrrf:v.irrf/100,cnpjFonte:fonte,cnpjEstab:fonte,competencia,dtPagamento:r.data,codigoReceita:'3208',origemIrrf:'informado',
          origemAluguelPlanilha:[fonte,competencia,norm(r.endereco),r.data,digits(p.cpf)].join('|'),observacao:'Planilha de aluguéis: '+r.aba+' linha '+r.linha+'; '+r.endereco+(rev.justificativa?' | '+rev.justificativa:'')});
      });
      if(somaBruto!==r.aluguel) throw Error('O bruto distribuído difere do aluguel da planilha na linha '+r.linha+'. Corrija a origem se o bruto efetivo for outro.');
      if(somaIrrf!==r.irrf) throw Error('O IRRF individual não soma o IRRF informado na linha '+r.linha+'. Não rateie automaticamente a retenção.');
    }
    if(new Set(out.map(b=>b.origemAluguelPlanilha)).size!==out.length) throw Error('Pagamentos repetidos: confira imóvel, data e proprietário.');
    return out;
  }
  return {TIPOS_DEDUCAO_ALUGUEL,conferirDeducoes,analisar,preparar,ratear,validarProprietarios,documentoValido,cents,date,norm,digits};
});
