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
    id: 'bb-conta-atual-waldesa-2026-02',
    banco: '001',
    nomeBanco: 'Banco do Brasil',
    layout: 'Banco do Brasil - Conta Atual',
    parser: 'parsearPDF_BB_ContaAtual',
    arquivo: 'EXTRATO BB - CC 14910-1 - MATRIZ SP (3) 1.pdf',
    empresa: 'WALDESA MOTOMERCANTIL LTDA.',
    periodo_inicio: '2026-02-01',
    periodo_fim: '2026-02-28',
    esperado: {
      total_lancamentos: 1009,
      total_credito: 1431086.20,
      total_debito: 1348067.52
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T05:05:00-03:00',
    observacao: 'Layout Banco do Brasil Conta Atual textual com valores e sinal D/C lidos pela direita. A regressao confere que credito menos debito fecha no saldo final de R$ 83.018,68.'
  },
  {
    id: 'bb-cash-reality-2025-08',
    banco: '001',
    nomeBanco: 'Banco do Brasil',
    layout: 'Banco do Brasil - BB Cash OCR',
    parser: 'parsearPDF_BB_CashOCR',
    arquivo: 'EXTRATO BANCO DO BRASIL - 08.2025.pdf',
    empresa: 'REALITY COMERCIO IMPORTACAO E EXPORTACAO LTDA',
    periodo_inicio: '2025-08-01',
    periodo_fim: '2025-08-31',
    esperado: {
      total_lancamentos: 5,
      total_credito: 16900.00,
      total_debito: 86998.77
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T06:10:00-03:00',
    observacao: 'Fixture OCR do BB Cash valida banco, periodo, valores colados e sinal C/D, incluindo OCR que troca C por euro.'
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
    id: 'bradesco-comunidade-2025-12',
    banco: '237',
    nomeBanco: 'Bradesco',
    layout: 'Bradesco Net Empresa - Extrato Mensal por Periodo',
    parser: 'parsearPDF_Bradesco_NetEmpresa',
    arquivo: 'extrato 12 sep-part-1 1.pdf',
    empresa: 'COMUNIDADE EVANGELICA SARA NOSSA TERRA EM JOAO PESSOA',
    periodo_inicio: '2025-12-01',
    periodo_fim: '2025-12-31',
    esperado: {
      total_lancamentos: 719,
      total_credito: 106681.40,
      total_debito: 109971.61
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T04:45:00-03:00',
    observacao: 'Layout Bradesco Net Empresa textual com documento, valor e saldo colados. A regressao confere totais oficiais pelo saldo anterior versus saldo atual.'
  },
  {
    id: 'bradesco-simples-conferencia-2045-2025-03',
    banco: '237',
    nomeBanco: 'Bradesco',
    layout: 'Bradesco - Simples Conferencia',
    parser: 'parsearPDF_Bradesco_SimplesConferencia',
    arquivo: 'extrato_2968_ref_32025_03062026112729 2.pdf',
    empresa: 'Empresa 2045 - 20.069.635/0001-52',
    periodo_inicio: '2025-03-05',
    periodo_fim: '2025-04-01',
    esperado: {
      total_lancamentos: 2179,
      total_credito: 0,
      total_debito: 0
    },
    status: 'Aprovado',
    validado_em: '2026-06-04T00:00:00-03:00',
    observacao: 'Layout OCR Bradesco Simples Conferencia. O PDF tem duas vias por pagina; a regressao exige OCR em metades, ignora saldo/transporte e preserva complementos REM. Totais ficam calculados pelos movimentos extraidos.'
  },
  {
    id: 'itau-clude-pdf-2026-04',
    banco: '341',
    nomeBanco: 'Itau Unibanco',
    layout: 'Itau 1 - Extrato Mensal',
    parser: 'parsearPDF_Itau_ExtratoMensal',
    arquivo: 'itau abril 26 3.pdf',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 250,
      total_credito: 76806.19,
      total_debito: 54678.27
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T06:10:00-03:00',
    observacao: 'Layout Itau PDF por periodo com descricao em linhas vizinhas; cobre Redecard/Rede e rendimentos que ficavam fora da importacao.'
  },
  {
    id: 'itau-fatura-cartao-comum-2026-05',
    banco: '341',
    nomeBanco: 'Itau Unibanco',
    layout: 'FATURA CARTAO ITAU',
    parser: 'parsearPDF_Itau_FaturaCartao',
    arquivo: '05_FATURA MAIO.pdf',
    empresa: 'Uso comum - fatura Itau Empresas Mastercard',
    periodo_inicio: '2026-01-25',
    periodo_fim: '2026-05-07',
    esperado: {
      total_lancamentos: 118,
      total_credito: 4514.60,
      total_debito: 64038.99
    },
    status: 'Aprovado',
    validado_em: '2026-06-30T00:00:00-03:00',
    observacao: 'Layout comum de fatura Itau Empresas Mastercard. Compras entram como debito e creditos/estornos como credito; valida fechamento liquido contra Total da fatura de R$ 59.524,39.'
  },
  {
    id: 'itau-casa-betinho-ocr-scan-2026-04',
    banco: '341',
    nomeBanco: 'Itau Unibanco',
    layout: 'Itau 1 - Extrato Mensal',
    parser: 'parsearPDF_Itau_ExtratoMensal',
    arquivo: '58208-8abr26CasaBetinho.pdf',
    empresa: '606 - CASA DA CRIANCA BETINHO',
    cnpj: '62.827.860/0001-50',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 489,
      total_credito: 1020977.17,
      total_debito: 939901.17,
      total_credito_oficial_resumo: 1025764.82,
      total_debito_oficial_resumo: 1019074.26
    },
    status: 'Aprovado',
    validado_em: '2026-06-18T00:00:00-03:00',
    observacao: 'PDF Adobe Scan/OCR do Itau Extrato Mensal. A regressao valida cabecalhos OCR distorcidos, totais oficiais e evita importar saldo/aplicacao automatica como movimento.'
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
  },
  {
    id: 'clude-stripe-2026-04',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CLUDE - Stripe / Recebimentos',
    parser: 'parsearArquivoXLSXCludeStripe',
    arquivo: 'EXTRATO STRIPE ABRIL.xlsx',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 944,
      total_credito: 82243.38,
      total_debito: 84998.30
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T06:10:00-03:00',
    observacao: 'Layout Stripe CLUDE validado pelo Valor total da planilha e usado como regressao da memoria de classificacao.'
  },
  {
    id: 'clude-cartao-itau-2026-04',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CARTAO_ITAU_CLUDE',
    parser: 'parsearArquivoXLSXCartaoItauClude',
    arquivo: 'fatura cartao clude 1.xlsx',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 97,
      total_credito: 48542.10,
      total_debito: 90.02
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T06:10:00-03:00',
    observacao: 'Layout CARTAO_ITAU_CLUDE valida fatura analitica com DATA, FORNECEDOR, VALOR e DESCRICAO DO SERVICO para historico por descricao.'
  },
  {
    id: 'clude-demonstrativo-itaucard-2026',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CLUDE - Demonstrativo Itaucard',
    parser: 'parsearArquivoXLSX',
    arquivo: 'Demonstrativo da Fatura Cartao Itaucard.xlsx',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-03-03',
    periodo_fim: '2026-03-31',
    esperado: {
      total_lancamentos: 44,
      total_credito: 40408.60,
      total_debito: 0
    },
    status: 'Aprovado',
    validado_em: '2026-05-17T06:10:00-03:00',
    observacao: 'Regressao do demonstrativo Itaucard CLUDE para evitar perda de historico quando a fatura vem em formato analitico.'
  },
  {
    id: 'clude-servicos-tomados-2026-04',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CLUDE - Servicos Tomados Fiscal',
    parser: 'parsearPDF_Clude_ServicosTomados',
    arquivo: '733 servicos tomados clude.pdf',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 147,
      total_credito: 0,
      total_debito: 597231.75
    },
    status: 'Aprovado',
    validado_em: '2026-05-18T11:05:00-03:00',
    observacao: 'Relatorio E-Fiscal de NFs de Servicos Tomados. Importa somente notas com valor e preenche historico padrao de servicos automaticamente.'
  },
  {
    id: 'clude-analise-creditos-pis-cofins-2026-04',
    banco: 'CLU',
    nomeBanco: 'CLUDE - Club de Beneficios',
    layout: 'CLUDE - Analise Creditos PIS COFINS',
    parser: 'parsearPDF_Clude_AnaliseCreditos',
    arquivo: '733  CLUDE SERV. TOMADOS ABRIL.pdf',
    empresa: 'CLUDE - CARTAO DE SAUDE 360 LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 189,
      total_credito: 0,
      total_debito: 630918.28
    },
    status: 'Aprovado',
    validado_em: '2026-05-25T14:35:00-03:00',
    observacao: 'PDF gerado pelo Consultor Fiscal com Analise de Creditos PIS/COFINS. Usa Valor da Nota como base de importacao e historico padrao de servicos.'
  },
  {
    id: 'daxx-analise-creditos-pis-cofins-2026-04',
    banco: '1183',
    nomeBanco: 'DAXX MIDIA LTDA',
    layout: 'DAXX - Analise Creditos PIS COFINS',
    parser: 'parsearPDF_Fiscal_AnaliseCreditosPISCOFINS',
    arquivo: '1183 - SERVICOS TOMADOS 042026.pdf',
    empresa: 'DAXX MIDIA LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 30,
      total_credito: 0,
      total_debito: 300146.11
    },
    status: 'Aprovado',
    validado_em: '2026-05-26T12:20:00-03:00',
    observacao: 'PDF gerado pelo Consultor Fiscal para DAXX. Usa Valor da Nota como base, ignora notas zeradas e evita queda indevida no layout Itau herdado da empresa.'
  },
  {
    id: 'daxx-servicos-prestados-iob-sage-2026-04',
    banco: '1183',
    nomeBanco: 'DAXX MIDIA LTDA',
    layout: 'DAXX - Servicos Prestados Fiscal',
    parser: 'parsearPDF_IOB_Sage_ServicosPrestados',
    arquivo: '1183 - SERV. PRESTADOS 04.2026 FISCAL 1.pdf',
    empresa: 'DAXX MIDIA LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 36,
      total_credito: 2208848.23,
      total_debito: 0
    },
    status: 'Aprovado',
    validado_em: '2026-05-27T14:10:00-03:00',
    observacao: 'Relatorio fixo Office Fiscal/IOB SAGE de NFs de Servicos Prestados. Usa Valor da NF como credito e preserva tomador, NF e codigo de servico para parametrizacao.'
  },
  {
    id: 'caixa-monaco-2025-01',
    banco: '104',
    nomeBanco: 'Caixa Economica Federal',
    layout: 'Caixa - Extrato por Periodo Gerenciador',
    parser: 'parsearPDF_Caixa_Extrato',
    arquivo: 'extrato 003 - 01-2025 B15.pdf',
    empresa: 'MONACO MONACO LOTERIAS LTDA',
    periodo_inicio: '2025-01-01',
    periodo_fim: '2025-01-31',
    esperado: {
      total_lancamentos: 209,
      total_credito: 306333.60,
      total_debito: 396809.12
    },
    status: 'Aprovado',
    validado_em: '2026-05-21T10:45:00-03:00',
    observacao: 'Layout textual do Gerenciador CAIXA com linhas compactadas. Regressao confere que saldo anterior de R$ 92.031,17 fecha no saldo final de R$ 1.555,65.'
  },
  {
    id: 'abc-flanacar-2026-04',
    banco: '246',
    nomeBanco: 'Banco ABC Brasil',
    layout: 'Banco ABC - Extrato Consolidado',
    parser: 'parsearPDF_ABC_Extrato',
    arquivo: 'EXTRATO ABC 2244444-2.pdf',
    empresa: 'FLANACAR COM DE AUTO-PECAS LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 72,
      total_credito: 3050693.59,
      total_debito: 3050389.94
    },
    status: 'Aprovado',
    validado_em: '2026-05-29T14:15:00-03:00',
    observacao: 'Layout Banco ABC Extrato consolidado. Ignora saldo anterior e captura apenas o valor do movimento quando o saldo diario vem colado na mesma linha.'
  },
  {
    id: 'abc-flanacar-2026-04-xlsx',
    banco: '246',
    nomeBanco: 'Banco ABC Brasil',
    layout: 'Banco ABC - Extrato XLSX',
    parser: 'parsearArquivoXLSXBancoABC',
    arquivo: 'EXTRATO ABC -FLANACAR 042026.xlsx',
    empresa: 'FLANACAR COM DE AUTO-PECAS LTDA',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 193,
      total_credito: 4501831.14,
      total_debito: 4501527.49
    },
    status: 'Aprovado',
    validado_em: '2026-05-29T14:45:00-03:00',
    observacao: 'Layout Banco ABC XLSX com colunas ENTRADAS e SAIDAS separadas. Nao soma SALDO ATUAL ao total importado.'
  },
  {
    id: 'extrato-conciliado-flanacar-itau-2026-04-xlsx',
    banco: 'GEN',
    nomeBanco: 'Todos os bancos',
    layout: 'Extrato Conciliado',
    parser: 'parsearArquivoXLSXExtratoConciliado',
    arquivo: 'EXTRATO ITAU-FLANACAR 042026.xlsx',
    empresa: 'FLANACAR COMERCIO DE PECAS 2026',
    periodo_inicio: '2026-04-01',
    periodo_fim: '2026-04-30',
    esperado: {
      total_lancamentos: 450,
      total_credito: 4044803.01,
      total_debito: 4044803.01
    },
    status: 'Aprovado',
    validado_em: '2026-06-02T00:00:00-03:00',
    observacao: 'Layout generico XLSX para extratos conciliados. Deve funcionar com qualquer banco selecionado e nao pode herdar conta/layout Banco ABC.'
  }
];

module.exports = { LAYOUT_QUALITY_CASES };
