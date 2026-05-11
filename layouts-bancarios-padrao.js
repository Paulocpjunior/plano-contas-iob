const LAYOUTS_BANCARIOS_PADRAO = [
  { banco: '001', nomeBanco: 'Banco do Brasil', nome: 'Banco do Brasil - Conta Atual', parser: 'parsearPDF_BB_ContaAtual', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO BB - CC 14910-1 - MATRIZ SP', observacao: 'Modelo Cliente - Conta atual com texto extraivel.' },
  { banco: '001', nomeBanco: 'Banco do Brasil', nome: 'Banco do Brasil - BB Cash OCR', parser: 'parsearPDF_BB_CashOCR', formato: 'PDF imagem / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'EXTRATO BANCO DO BRASIL - 08.2025.pdf', observacao: 'Modelo BB Cash digitalizado. Exige conferencia dos totais.' },
  { banco: '237', nomeBanco: 'Bradesco', nome: 'Bradesco Net Empresa - Extrato Mensal por Periodo', parser: 'parsearPDF_Bradesco_NetEmpresa', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'extrato 12 sep-part-1 1.pdf', observacao: 'Confere totais oficiais de credito e debito quando disponiveis.' },
  { banco: '033', nomeBanco: 'Santander', nome: 'Santander Empresas - Extrato Consolidado Inteligente OCR', parser: 'parsearPDF_Santander_EmpresasOCR', formato: 'PDF imagem / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'EXTRATO SANTANDER.pdf', observacao: 'Extrai a secao Conta Corrente / Movimentacao e ignora quadros auxiliares.' },
  { banco: '352', nomeBanco: 'Santander CTVM', nome: 'Santander Empresas - Extrato Consolidado Inteligente OCR', parser: 'parsearPDF_Santander_EmpresasOCR', formato: 'PDF imagem / OCR', confiabilidade: 'Media', status: 'Ativo', ultimoTeste: 'EXTRATO SANTANDER.pdf', observacao: 'Atende cadastros que usam codigo 352 para extratos Santander Empresas.' },
  { banco: '341', nomeBanco: 'Itau Unibanco', nome: 'Itau - Extrato Mensal', parser: 'parsearPDF_Itau_ExtratoMensal', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'itau abril 26 1.pdf', observacao: 'Le lancamentos multiline, Redecard/Rede, rendimentos e valida totais quando disponiveis.' },
  { banco: '422', nomeBanco: 'Banco Safra', nome: 'Safra - Extrato de Movimentacao', parser: 'parsearPDF_Safra_Extrato', formato: 'PDF textual', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO SAFRA - CC 172128-9 (2).pdf', observacao: 'Extrai data, historico, complemento, documento e valor.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Stripe / Recebimentos', parser: 'parsearArquivoXLSXCludeStripe', formato: 'XLSX', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'EXTRATO STRIPE ABRIL.xlsx', observacao: 'Le colunas Id, Valor, Tarifas, Valor total, Disponivel em e Descricao; converte data serial e valores decimais.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Itau Movimentacao Financeira', parser: 'parsearArquivoXLSXCludeItau', formato: 'XLSX', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'Bco Itau - Movimentacao Financeira (1).xlsx', observacao: 'Reconhece DATA PAGTO, TIPO DESPESA, DESCRICAO e DESPESAS; ignora linhas de resumo para nao duplicar totais.' },
  { banco: 'CLU', nomeBanco: 'CLUDE - Club de Beneficios', nome: 'CLUDE - Demonstrativo Itaucard', parser: 'detectarExcelCriptografado', formato: 'XLSX protegido', confiabilidade: 'Alta', status: 'Ativo', ultimoTeste: 'Demonstrativo da Fatura Cartao Itaucard.xlsx', observacao: 'Regra operacional para bloquear planilhas Office criptografadas e orientar reenvio sem protecao.' }
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
