const LAYOUTS_BANCARIOS_PADRAO = [
  { banco: '001', nomeBanco: 'Banco do Brasil', nome: 'Banco do Brasil - Conta Atual', parser: 'parsearPDF_BB_ContaAtual', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO BB - CC 14910-1 - MATRIZ SP', observacao: 'Modelo Cliente - Conta atual com texto extraivel.' },
  { banco: '001', nomeBanco: 'Banco do Brasil', nome: 'Banco do Brasil - BB Cash OCR', parser: 'parsearPDF_BB_CashOCR', formato: 'PDF imagem / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'EXTRATO BANCO DO BRASIL - 08.2025.pdf', observacao: 'Modelo BB Cash digitalizado. Exige conferencia dos totais.' },
  { banco: '237', nomeBanco: 'Bradesco', nome: 'Bradesco Net Empresa - Extrato Mensal por Periodo', parser: 'parsearPDF_Bradesco_NetEmpresa', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'extrato bradesco jan_2025.pdf', observacao: 'Confere totais oficiais de credito/debito e preenche historico pela descricao do lancamento.' },
  { banco: '033', nomeBanco: 'Santander', nome: 'Santander 1 - Internet Banking Empresarial', parser: 'parsearPDF_Santander_InternetBanking', formato: 'PDF textual / OCR', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'DEZEMBRO-SANTANDER-RA.pdf', observacao: 'Le extrato Santander Internet Banking Empresarial textual ou imagem OCR, com datas numericas e linhas CREDITO/DEBITO R$ valor.' },
  { banco: '033', nomeBanco: 'Santander', nome: 'Santander 2 - Extrato Consolidado Inteligente / Conta Corrente', parser: 'parsearPDF_Santander_EmpresasOCR', formato: 'PDF textual / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'MAIO_EXTRATO SANTANDER- RA CARPETES.pdf', observacao: 'Extrai Consolidado Inteligente e Internet Banking Conta Corrente; separa documento, valor e saldo quando as colunas aparecem coladas.' },
  { banco: '352', nomeBanco: 'Santander CTVM', nome: 'Santander 1 - Internet Banking Empresarial', parser: 'parsearPDF_Santander_InternetBanking', formato: 'PDF textual / OCR', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'DEZEMBRO-SANTANDER-RA.pdf', observacao: 'Atende cadastros Santander CTVM que usam o extrato Internet Banking Empresarial textual ou imagem OCR.' },
  { banco: '352', nomeBanco: 'Santander CTVM', nome: 'Santander 2 - Extrato Consolidado Inteligente OCR', parser: 'parsearPDF_Santander_EmpresasOCR', formato: 'PDF imagem / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'EXTRATO SANTANDER.pdf', observacao: 'Atende cadastros que usam codigo 352 para extratos Santander Empresas.' },
  { banco: '341', nomeBanco: 'Itau Unibanco', nome: 'Itau 1 - Extrato Mensal', parser: 'parsearPDF_Itau_ExtratoMensal', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'itau abril 26 1.pdf', observacao: 'Le lancamentos multiline, Redecard/Rede, rendimentos e valida totais quando disponiveis.' },
  { banco: '104', nomeBanco: 'Caixa Economica Federal', nome: 'Caixa - Extrato por Periodo Gerenciador', parser: 'parsearPDF_Caixa_Extrato', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'extrato 003 - 01-2025 B15.pdf', observacao: 'Le PDF textual do Gerenciador CAIXA com data, documento, historico, valor C/D e saldo colados na mesma linha.' },
  { banco: '422', nomeBanco: 'Banco Safra', nome: 'Safra - Extrato de Movimentacao', parser: 'parsearPDF_Safra_Extrato', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO SAFRA - CC 172128-9 (2).pdf', observacao: 'Extrai data, historico, complemento, documento e valor.' },
  { banco: '208', nomeBanco: 'Banco BTG Pactual', nome: 'BTG Pactual - Conta corrente PJ', parser: 'parsearPDF_BTG_Pactual', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'ERF- JANEIRO DE 2026.pdf', observacao: 'Le extrato BTG Conta corrente PJ com descricoes multiline, valor e saldo por colunas.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Stripe / Recebimentos', parser: 'parsearArquivoXLSXCludeStripe', formato: 'XLSX', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO STRIPE ABRIL.xlsx', observacao: 'Le colunas Id, Valor, Tarifas, Valor total, Disponivel em e Descricao; converte data serial e valores decimais.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Itau Movimentacao Financeira', parser: 'parsearArquivoXLSXCludeItau', formato: 'XLSX', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'Bco Itau - Movimentacao Financeira (1).xlsx', observacao: 'Reconhece DATA PAGTO, TIPO DESPESA, DESCRICAO e DESPESAS; ignora linhas de resumo para nao duplicar totais.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CARTAO_ITAU_CLUDE', parser: 'parsearArquivoXLSXCartaoItauClude', formato: 'XLSX', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'fatura cartao clude 1.xlsx', observacao: 'Le fatura analitica Itaucard com DATA, FORNECEDOR, VALOR e DESCRICAO DO SERVICO; grava chaves limpas para historico por descricao.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Servicos Tomados Fiscal', parser: 'parsearPDF_Clude_ServicosTomados', formato: 'PDF fiscal', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: '733 servicos tomados clude.pdf', observacao: 'Le relatorio E-Fiscal de NFs de Servicos Tomados e importa como lancamentos fiscais com historico padrao de servicos.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Demonstrativo Itaucard', parser: 'parsearArquivoXLSX', formato: 'XLSX protegido', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'Demonstrativo da Fatura Cartao Itaucard.xlsx', observacao: 'Regra operacional do parser XLSX generico para bloquear planilhas Office criptografadas e orientar reenvio sem protecao.' }
];

function normalizarBancoLayout(valor) {
  const raw = String(valor || '').trim().toUpperCase();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (/^\d+$/.test(raw)) return raw.padStart(3, '0');
  if (digits && digits.length <= 3 && /^[\d\s.\-/]+$/.test(raw)) return digits.padStart(3, '0');
  return raw.replace(/[^A-Z0-9]/g, '');
}

function layoutBancoId(layout) {
  const banco = normalizarBancoLayout(layout && layout.banco);
  const parser = String((layout && layout.parser) || '').replace(/[^A-Za-z0-9_]/g, '');
  return banco + '_' + parser;
}

module.exports = {
  LAYOUTS_BANCARIOS_PADRAO,
  normalizarBancoLayout,
  layoutBancoId
};
