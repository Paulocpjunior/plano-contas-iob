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
  }
];

module.exports = { LAYOUT_QUALITY_CASES };
