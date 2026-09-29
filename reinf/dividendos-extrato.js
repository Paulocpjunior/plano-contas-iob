'use strict';
const { calcularDividendos, moneyBR, toCents, fromCents } = require('./reinf-dividendos-utils');
const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function montarExtrato(empresa, dados) {
  const r = calcularDividendos(dados);
  const data = String(dados.dtPagamento || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data.slice(0,7) !== r.competencia || new Date(data+'T12:00:00Z').toISOString().slice(0,10)!==data) throw Error('Informe uma data de pagamento válida dentro da competência do extrato.');
  const nome = empresa.razao_social || empresa.empresa || empresa.nome || r.cnpj;
  const liquido = (bruto, irrf) => fromCents(toCents(bruto)-toCents(irrf));
  const socios = r.saldosAta.map(s => {
    const pago=r.socios.find(p=>p.cpf===s.cpf)||{valorBruto:0,valorAtaIsento:0,valorTributavel:0,irrf:0};
    return {...s,...pago,liquido:liquido(pago.valorBruto,pago.irrf)};
  });
  const moeda = n => n == null ? 'Não informado' : moneyBR(n);
  const pct = n => n == null ? 'Não informado' : Number(n).toLocaleString('pt-BR')+'%';
  const totalLiquido=liquido(r.valorDistribuido,r.totalIrrf);
  const linhas = [
    'SP Assessoria Contábil — Extrato mensal de lucros e dividendos',
    'Empresa: '+nome+' | CNPJ: '+r.cnpj,
    'Competência: '+r.competencia+' | Data do pagamento informada: '+data.split('-').reverse().join('/'),
    'Responsável: '+(dados.responsavel||empresa.reinfDividendos?.responsavelDividendos||'Não informado'),
    'Situação: demonstrativo do cálculo informado. Não comprova pagamento, transmissão ou aceite da Receita.',
    'Distribuição: '+(dados.modoDistribuicao==='valores'?'valores informados por sócio':'rateio pela participação societária'),
    'Bruto: '+moeda(r.valorDistribuido)+' | IRRF: '+moeda(r.totalIrrf)+' | Líquido calculado: '+moeda(totalLiquido),
    'ATA registrada: '+moeda(r.ataValorTotal)+' | Saldo anterior informado: '+moeda(r.ataSaldoAnterior),
    'ATA utilizada neste cálculo: '+moeda(r.ataUsado)+' | Saldo restante projetado: '+moeda(r.ataSaldoApos),
    'ATA aprovada até 31/12/2025: '+(dados.ataAprovadaAte2025===true||dados.ataAprovadaAte2025==='sim'?'Sim':'Não')+' | Pagamento dentro da condição até 2028: '+(dados.ataValidaAte2028!==false&&dados.ataValidaAte2028!=='nao'?'Sim':'Não'),
    'ATA aplicada pelo cálculo: '+(r.ataAplicavel?'Sim':'Não'),
    'Memória: parcela após ATA = bruto menos ATA utilizada. O cálculo atual aplica '+pct(r.aliquotaIrrf*100)+' quando essa parcela por sócio excede '+moeda(r.limiteMensal)+' no mês; a base é a parcela integral após ATA. Base total: '+moeda(r.totalBaseTributavel)+'.',
    'Conferir se os valores informados abrangem todos os pagamentos do mês da mesma empresa ao mesmo CPF.',
    'Natureza de rendimento: '+r.natRend+' | Parcela da ATA: rendimento isento tipo 12, quando aplicável.',
    'Emitir ou enviar este extrato não baixa a ATA. Os saldos abaixo são projeções; a atualização do controle depende do R-4010 aceito em produção.',
    r.alertaAta?.mensagem||''
  ];
  const tabela=(titulos,rows)=>'<table><thead><tr>'+titulos.map(t=>'<th>'+escape(t)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const pagamentos=socios.map(s=>[s.nome,s.cpf,pct(s.percentual),moeda(s.valorBruto),moeda(s.valorAtaIsento),moeda(s.valorTributavel),moeda(s.irrf),moeda(s.liquido)]);
  const saldos=socios.map(s=>[s.nome,moeda(s.saldoAnterior),moeda(s.ataUsada),moeda(s.saldoApos),pct(s.percentualSaldo)]);
  const texto=linhas.join('\n')+'\n\nPor sócio — Nome | CPF | Participação | Bruto | ATA | Base | IRRF | Líquido\n'+pagamentos.map(r=>r.join(' | ')).join('\n')+'\n\nSaldo ATA — Nome | Anterior | Utilizado | Projetado | % do saldo\n'+saldos.map(r=>r.join(' | ')).join('\n');
  const corpo='<h1>Extrato mensal de lucros e dividendos</h1>'+linhas.slice(1).map(l=>'<p>'+escape(l)+'</p>').join('')+'<h2>Distribuição por sócio</h2>'+tabela(['Sócio','CPF','Participação','Bruto','ATA utilizada','Base IRRF','IRRF','Líquido'],pagamentos)+'<h2>Controle da ATA por sócio</h2>'+tabela(['Sócio','Saldo anterior','Utilizado','Saldo projetado','% do saldo'],saldos)+'<p>SP Assessoria Contábil</p>';
  const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Extrato de dividendos '+escape(r.competencia)+'</title><style>body{font:13px Arial,sans-serif;color:#17314c;margin:28px}h1{font-size:23px;color:#173b71}h2{font-size:16px;margin-top:24px}p{line-height:1.45;margin:7px 0}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#eaf0f8;text-align:left}td,th{padding:7px;border:1px solid #d8e1eb}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style><body>'+corpo+'</body></html>';
  const htmlEmail='<div style="font-family:Arial,sans-serif;color:#17314c">'+corpo.replace(/<table>/g,'<table style="border-collapse:collapse;width:100%;font-size:12px">').replace(/<th>/g,'<th style="background:#eaf0f8;text-align:left;padding:7px;border:1px solid #d8e1eb">').replace(/<td>/g,'<td style="padding:7px;border:1px solid #d8e1eb">')+'</div>';
  return {assunto:'Extrato de lucros e dividendos — '+nome+' — '+r.competencia,html,htmlEmail,texto,resultado:r,empresa:nome,cnpj:r.cnpj,competencia:r.competencia,totalLiquido};
}
module.exports={montarExtrato};
