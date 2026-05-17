const LAYOUT_QUALITY_CASES = [
  {
    id: 'santander-ra-carpetes-2025-05',
    banco: '033',
    nomeBanco: 'Santander',
    layout: 'Santander Empresas - Internet Banking Conta Corrente',
    parser: 'parsearPDF_Santander_EmpresasOCR',
    arquivo: 'MAIO_EXTRATO SANTANDER- RA CARPETES.pdf',
    empresa: 'R A CARPETES PISOS E PERSIANAS EIRELI',
    periodo_inicio: '2025-05-01',
    periodo_fim: '2025-05-31',
    esperado: {
      total_lancamentos: 106,
      total_credito: 126535.73,
      total_debito: 82371.83
    },
    status: 'Aprovado',
    validado_em: '2026-05-12T11:45:00-03:00',
    observacao: 'Layout textual Santander Internet Banking Empresarial com colunas Data, Historico, Documento, Valor e Saldo. Valida separacao de valor quando documento, valor e saldo aparecem colados.'
  },
  {
    id: 'santander-internet-banking-armazem-bichos-2026-04',
    banco: '033',
    nomeBanco: 'Santander',
    layout: 'Santander 1 - Internet Banking Empresarial',
    parser: 'parsearPDF_Santander_InternetBanking',
    arquivo: 'santander abril 26 1.pdf',
    empresa: 'ARMAZEM DE BICHOS VET E PETCETERA COMERC',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 30,
      total_credito: 6426.15,
      total_debito: 6326.39
    },
    status: 'Aprovado',
    validado_em: '2026-05-13T10:35:00-03:00',
    observacao: 'Layout Santander Internet Banking Empresarial agrupado por data em extenso, com linhas CREDITO/DEBITO R$ valor.'
  },
  {
    id: 'santander-ctvm-internet-banking-armazem-bichos-2026-04',
    banco: '352',
    nomeBanco: 'Santander CTVM',
    layout: 'Santander 1 - Internet Banking Empresarial',
    parser: 'parsearPDF_Santander_InternetBanking',
    arquivo: 'santander abril 26 1.pdf',
    empresa: 'ARMAZEM DE BICHOS VET E PETCETERA COMERC',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 30,
      total_credito: 6426.15,
      total_debito: 6326.39
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T04:05:00-03:00',
    observacao: 'Mesmo layout aprovado para empresas cadastradas com banco 352, usando equivalencia operacional Santander.'
  },
  {
    id: 'santander-ctvm-ra-carpetes-2025-05',
    banco: '352',
    nomeBanco: 'Santander CTVM',
    layout: 'Santander 2 - Extrato Consolidado Inteligente OCR',
    parser: 'parsearPDF_Santander_EmpresasOCR',
    arquivo: 'MAIO_EXTRATO SANTANDER- RA CARPETES.pdf',
    empresa: 'R A CARPETES PISOS E PERSIANAS EIRELI',
    periodo_inicio: '2025-05-01',
    periodo_fim: '2025-05-31',
    esperado: {
      total_lancamentos: 106,
      total_credito: 126535.73,
      total_debito: 82371.83
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T04:05:00-03:00',
    observacao: 'Mesmo parser aprovado para banco 352 quando o cadastro usa Santander CTVM.'
  },
  {
    id: 'btg-erf-holding-2026-01',
    banco: '208',
    nomeBanco: 'Banco BTG Pactual',
    layout: 'BTG Pactual - Conta corrente PJ',
    parser: 'parsearPDF_BTG_Pactual',
    arquivo: 'ERF- JANEIRO DE 2026.pdf',
    empresa: 'ERF HOLDING PATRIMONIAL LTDA',
    periodo_inicio: '2026-01-01',
    periodo_fim: '2026-01-31',
    esperado: {
      total_lancamentos: 43,
      total_credito: 18754.38,
      total_debito: 17209.38
    },
    status: 'Aprovado',
    validado_em: '2026-05-14T16:49:39-03:00',
    observacao: 'Layout BTG textual com data, descricao multiline, valor e saldo em colunas fixas.'
  },
  {
    id: 'safra-waldesa-2026-01',
    banco: '422',
    nomeBanco: 'Banco Safra',
    layout: 'Safra - Extrato de Movimentacao',
    parser: 'parsearPDF_Safra_Extrato',
    arquivo: 'EXTRATO SAFRA - CC 172128-9 (2) 2.pdf',
    empresa: 'WALDESA MOTOMERCANTIL LTDA.',
    periodo_inicio: '2026-01-02',
    periodo_fim: '2026-02-02',
    esperado: {
      total_lancamentos: 63,
      total_credito: 165475.13,
      total_debito: 165478.00
    },
    status: 'Aprovado',
    validado_em: '2026-05-16T03:20:00-03:00',
    observacao: 'Layout Safra textual com valores colados ao documento e linhas quebradas em operacoes Safrapay, Pix e CDB.'
  },
  {
    id: 'clude-itau-xlsx-2026-04',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CLUDE - Itau Movimentacao Financeira',
    parser: 'parsearArquivoXLSXCludeItau',
    arquivo: 'Bco Itau - Movimentacao Financeira - Original 2.xlsx',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 229,
      total_credito: 831246.49,
      total_debito: 868786.74
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T03:35:00-03:00',
    observacao: 'Layout CLUDE Itau XLSX com reforco de historicos por descricao para recebimentos NF, fornecedores, seguros, servicos e cartao.'
  }
];

module.exports = { LAYOUT_QUALITY_CASES };
