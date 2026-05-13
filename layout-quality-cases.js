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
  }
];

module.exports = { LAYOUT_QUALITY_CASES };
