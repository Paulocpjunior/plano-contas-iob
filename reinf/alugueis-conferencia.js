(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./reinf-alugueis-planilha'));else root.AlugueisConferencia=factory(root.ReinfAlugueisPlanilha);})(typeof globalThis!=='undefined'?globalThis:this,function(U){
  'use strict';
  const arred=v=>Math.round((v+Number.EPSILON)*100)/100;
  function calcular(tabela,competencia,rendimento,deducoes=0,simplificado=true){
    if(!tabela||competencia<tabela.inicio||competencia>tabela.fim)throw Error('Tabela sem vigência para a competência.');
    if([rendimento,deducoes].some(v=>!Number.isSafeInteger(v)||v<0)||deducoes>rendimento)throw Error('Informe valores mensais válidos; deduções não podem superar o rendimento.');
    const renda=rendimento/100;
    const deducao=Math.max(deducoes/100,simplificado?tabela.descontoSimplificado:0);
    const base=arred(Math.max(0,renda-deducao));
    const faixa=tabela.faixas.find(f=>f.ate===null||base<=f.ate);if(!faixa)throw Error('Faixa indisponível.');
    const antes=arred(Math.max(0,base*faixa.aliquota-faixa.deducao));
    const r=tabela.reducao;
    const reducao=arred(Math.min(antes,Math.max(0,renda<=r.ate?r.maximo:renda<=r.limite?r.constante-r.fator*renda:0)));
    return {base,imposto:arred(Math.max(0,antes-reducao)),antes,reducao,deducao,versao:tabela.versao,competencia};
  }
  // Only spreadsheet arithmetic, direct references and SUM are evaluated. Never execute formula text.
  function aritmetica(s){
    const ts=s.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/%\-]/g)||[];if(ts.join('')!==s.replace(/\s/g,''))throw Error('Fórmula não suportada');let pos=0;
    function fator(){let x;if(ts[pos]==='-'){pos++;x=-fator();}else if(ts[pos]==='+'){pos++;x=fator();}else if(ts[pos]==='('){pos++;x=soma();if(ts[pos++]!==')')throw Error('Parênteses');}else{if(!/^(?:\d|\.)/.test(ts[pos]||''))throw Error('Número');x=Number(ts[pos++]);}if(ts[pos]==='%'){pos++;x/=100;}return x;}
    function produto(){let v=fator();while(ts[pos]==='*'||ts[pos]==='/'){const op=ts[pos++],n=fator();v=op==='*'?v*n:v/n;}return v;}
    function soma(){let v=produto();while(ts[pos]==='+'||ts[pos]==='-'){const op=ts[pos++],n=produto();v=op==='+'?v+n:v-n;}return v;}
    const v=soma();if(pos!==ts.length||!Number.isFinite(v))throw Error('Resultado inválido');return v;
  }
  function auditar(arquivos){
    const achados=[],repasses=[],fechamentos=[],naoConferidas=[];let formulasConferidas=0,formulasNaoConferidas=0;
    const add=(arquivo,aba,celula,mensagem)=>achados.push({arquivo,aba,celula,mensagem});
    for(const file of arquivos){
      const porNome=new Map(file.abas.map(a=>[a.nome,a]));
      function valor(aba,celula,stack=new Set()){
        const chave=aba.nome+'!'+celula;if(stack.size>100||stack.has(chave))throw Error('Dependência circular');
        const c=aba.cells[celula];if(!c||c.v==null||c.v==='')return 0;
        if(!c.f){if(typeof c.v!=='number')throw Error('Célula não numérica');return c.v;}
        const next=new Set(stack).add(chave);
        const ref=(sheet,addr)=>{const a=sheet?porNome.get(sheet):aba;if(!a)throw Error('Referência externa');return valor(a,addr.replace(/\$/g,''),next);};
        let f=c.f.replace(/^=/,'');
        f=f.replace(/SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)/gi,(_,col,a,col2,b)=>{if(col!==col2||Number(b)-Number(a)>10000)throw Error('Intervalo não suportado');let total=0;for(let i=Number(a);i<=Number(b);i++){const cell=aba.cells[col+i];if(cell&&!cell.f&&typeof cell.v==='string'&&cell.t!=='e')continue;total+=ref(null,col+i);}return String(total);});
        f=f.replace(/(?:'([^']+)'!)?(\$?[A-Z]+\$?\d+)/g,(_,sheet,addr)=>'('+ref(sheet,addr)+')');
        return aritmetica(f);
      }
      for(const aba of file.abas){
        const locadores=U.norm(aba.rows[0]?.[1]).includes('ADMINISTRACAODEBENSIMOVEIS');
        if(locadores){
          const ler=prefix=>{const row=aba.rows.find(r=>U.norm(r[1]).startsWith(prefix));return row?U.cents(row[2]):null;};
          const aluguel=ler('RECEITAALUGUEL'),taxa=ler('TAXADEADMINISTRACAOPEC20'),iptu=ler('IPTURECEBIDO'),despesas=(()=>{const r=aba.rows.find(r=>/^DESPESAS[A-Z]+\d/.test(U.norm(r[1])));return r?U.cents(r[2]):null;})(),reserva=ler('RESERVA');
          if(aluguel!==null&&taxa!==null&&Math.abs(Math.round(aluguel*0.2)-taxa)>1)add(file.nome,aba.nome,'Taxa de administração','Taxa informada diverge de 20% do aluguel recebido, sem IPTU');
          const resultado=aba.rows.find(r=>U.norm(r[2])==='RESULTADODOMES');
          if(resultado&&[aluguel,taxa,iptu,despesas,reserva].every(v=>v!==null)&&Math.abs(U.cents(resultado[3])-(aluguel+iptu-taxa-despesas-reserva))>1)add(file.nome,aba.nome,'Resultado do mês','Resultado não concilia com recebimentos, taxa, despesas e reserva');
        }
        const titulo=U.norm(aba.rows.slice(0,3).flat().join(' '));
        const mes=titulo.match(/(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)(?:20)?(\d{2})/);
        if(mes){
          const linhas=aba.rows;
          const resultado=locadores?linhas.find(r=>U.norm(r[2])==='RESULTADODOMES'):titulo.includes('RESULTADOGERAL')?linhas.find(r=>U.norm(r[1])==='VALORARECEBER'):null;
          if(resultado){const n=U.cents(resultado[locadores?3:2]);if(n!==null)fechamentos.push({arquivo:file.nome,aba:aba.nome,periodo:mes[1]+mes[2],valor:n});}
        }
        for(const [addr,c] of Object.entries(aba.cells)){
          const soma=String(c.f||'').match(/^SUM\(([A-Z]+)(\d+):\1(\d+)\)$/i);
          if(soma&&typeof c.v==='number'){
            const partes=[];for(let row=Number(soma[2]);row<=Number(soma[3])&&row-Number(soma[2])<10000;row++){const v=aba.cells[soma[1]+row]?.v;if(typeof v==='number')partes.push(v);}
            const somaCentavos=partes.reduce((total,v)=>total+U.cents(v),0),totalCentavos=U.cents(c.v);
            if(partes.some(v=>Math.abs(v*100-Math.round(v*100))>0.00001)&&somaCentavos!==totalCentavos)add(file.nome,aba.nome,addr,'Arredondamento: parcelas em centavos somam '+arred(somaCentavos/100)+'; total informado '+arred(totalCentavos/100)+'. Ajustar o rateio antes do pagamento.');
          }
          if(c.t==='e'||/^#(?:VALUE!|REF!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!)/.test(String(c.v)))add(file.nome,aba.nome,addr,'Erro de fórmula na origem: '+c.v);
          if(c.f){try{const esperado=valor(aba,addr);formulasConferidas++;if(typeof c.v!=='number')add(file.nome,aba.nome,addr,'Fórmula sem resultado numérico salvo');else if(Math.abs(esperado-c.v)>0.010001)add(file.nome,aba.nome,addr,'Resultado salvo diverge do recálculo: '+arred(c.v)+'; calculado '+arred(esperado));}catch(e){formulasNaoConferidas++;naoConferidas.push({arquivo:file.nome,aba:aba.nome,celula:addr,motivo:e.message});}}
        }
        const h=aba.rows.findIndex(r=>r.some(c=>U.norm(c)==='DATARECEBIMENTO')&&r.some(c=>U.norm(c)==='VALORRECEBIDO'));
        if(h>=0){const hs=aba.rows[h].map(U.norm),ix=n=>hs.indexOf(n);const vistos=new Set();
          aba.rows.slice(h+1).forEach((r,k)=>{const doc=U.digits(r[ix('CPFCNPJLOCATARIOS')]);if(![11,14].includes(doc.length))return;const linha=h+k+2;
            const rec=U.cents(r[ix('VALORRECEBIDO')]),liq=U.cents(r[ix('ALUGUELLIQUIDORECEBIDO')]),iptu=U.cents(r[ix('IPTURECEBIDO')]);
            if([r[ix('VALORRECEBIDO')],r[ix('ALUGUELLIQUIDORECEBIDO')]].some(v=>U.norm(v)==='NAOPAGOU'))return;
            if(!U.documentoValido(doc,doc.length))add(file.nome,aba.nome,'linha '+linha,'CPF/CNPJ inválido');
            const data=U.date(r[ix('DATARECEBIMENTO')]);if(!data)add(file.nome,aba.nome,'linha '+linha,'Data de recebimento ausente, inválida ou múltipla; discrimine os pagamentos');
            if([rec,liq,iptu].some(v=>v===null))add(file.nome,aba.nome,'linha '+linha,'Recebimento, aluguel líquido ou IPTU ausente/inválido');
            else if(rec!==liq+iptu)add(file.nome,aba.nome,'linha '+linha,'Total recebido diverge de aluguel líquido + IPTU');
            const chave=[doc,U.norm(r[0]),data,rec].join('|');if(vistos.has(chave))add(file.nome,aba.nome,'linha '+linha,'Possível pagamento duplicado');vistos.add(chave);
          });
        }
        aba.rows.forEach((r,k)=>{
          const desc=U.norm(r[1]);
          if(desc.startsWith('REPASSEDOSALUGUEISRECEBIDOS')&&U.cents(r[4])!==null){const data=U.date(r[0]);repasses.push({arquivo:file.nome,aba:aba.nome,linha:k+1,descricao:String(r[1]),data,valor:U.cents(r[4])});if(!data)add(file.nome,aba.nome,'A'+(k+1),'Repasse sem data real: não usar início do mês nem data do fechamento');}
        });
      }
    }
    for(let i=0;i<fechamentos.length;i++)for(let j=i+1;j<fechamentos.length;j++)if(fechamentos[i].periodo===fechamentos[j].periodo&&Math.abs(fechamentos[i].valor-fechamentos[j].valor)>1)add(fechamentos[j].arquivo,fechamentos[j].aba,'Resultado dos aluguéis','Resultado diverge da prestação dos locadores em '+fechamentos[i].arquivo);
    return {achados,repasses,formulasConferidas,formulasNaoConferidas,naoConferidas};
  }
  return {calcular,auditar};
});
