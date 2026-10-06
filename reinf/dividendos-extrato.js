'use strict';
const { calcularDividendos, moneyBR, toCents, fromCents } = require('./reinf-dividendos-utils');
const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function montarExtrato(empresa, dados, contexto = {}) {
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
    'Origem: '+(dados.origemDividendos==='mista'?'com e sem ATA, conforme parcelas informadas por sócio':dados.origemDividendos==='lucros_posteriores'?'lucros posteriores, sem consumo da ATA':'lucros previstos na ATA de 2025'),
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
  const pagamentos=socios.map(s=>[s.nome,s.cpf,pct(s.percentual),moeda(s.valorBruto),moeda(s.valorAtaIsento),moeda(s.valorBruto-s.valorAtaIsento),moeda(s.valorTributavel),moeda(s.irrf),moeda(s.liquido)]);
  const saldos=socios.map(s=>[s.nome,moeda(s.saldoAnterior),moeda(s.ataUsada),moeda(s.saldoApos),pct(s.percentualSaldo)]);
  const texto=linhas.join('\n')+'\n\nPor sócio — Nome | CPF | Participação | Bruto | ATA | Sem ATA | Base | IRRF | Líquido\n'+pagamentos.map(r=>r.join(' | ')).join('\n')+'\n\nSaldo ATA — Nome | Anterior | Utilizado | Projetado | % do saldo\n'+saldos.map(r=>r.join(' | ')).join('\n');
  const visual=require('./dividendos-relatorio-layout').render({resultado:r,empresa:nome,totalLiquido},dados,contexto);
  return {assunto:'Extrato de lucros e dividendos — '+nome+' — '+r.competencia,html:visual.html,htmlEmail:'<h2 style="color:#091D8D">Extrato mensal de lucros e dividendos</h2><p><b>'+escape(nome)+'</b> · '+escape(r.competencia)+'</p><table style="width:100%;background:#f2f5fa;padding:18px"><tr><td>Distribuição<br><b>'+moeda(r.valorDistribuido)+'</b></td><td>IRRF<br><b>'+moeda(r.totalIrrf)+'</b></td><td>Líquido<br><b>'+moeda(totalLiquido)+'</b></td></tr></table><p>'+escape(visual.status)+'</p><p>O relatório completo está anexado em HTML, com gráficos e detalhamento por sócio. Abra no navegador para conferir ou imprimir/salvar como PDF.</p><p>'+visual.alertas.map(escape).join('<br>')+'</p><p>Emitir ou enviar este extrato não baixa a ATA.</p>',texto:texto+visual.textoHistorico,alertas:visual.alertas,status:visual.status,resultado:r,empresa:nome,cnpj:r.cnpj,competencia:r.competencia,totalLiquido};
}
module.exports={montarExtrato};
