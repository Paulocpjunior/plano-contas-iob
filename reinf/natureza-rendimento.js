// ============================================================================
// reinf/natureza-rendimento.js  (PURO — sem Express, sem Firebase)
// ----------------------------------------------------------------------------
// Tabela 01 do Anexo I da EFD-Reinf — CÓDIGOS DE NATUREZA DO RENDIMENTO da
// série 15xxx (serviços prestados por PESSOA JURÍDICA → evento R-4020), com o
// código de receita do DARF e a correlação com a lista de serviços da
// LC 116/2003.
//
// POR QUE ISTO EXISTE: o módulo tinha 4 constantes soltas, todas da série de
// PESSOA FÍSICA (13002 aluguel, 12001 dividendos…). Nenhum código de PJ estava
// no app — e a colaboradora digita justamente esse campo, nota a nota, no
// E-Fiscal, antes de gerar o REINF.
//
// ORIGEM (carimbada de propósito): tabela de correlação da IOB, arquivo
// gerado em 07/08/2026, entregue pelo Paulo. 51 naturezas, 98 pares
// natureza × tributo.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA QUE MANDA AQUI ESTÁ NO PRÓPRIO DOCUMENTO DE ORIGEM:
//
//   "não existe na legislação e nas orientações do EFD-Reinf uma 'Correlação
//    Oficial' entre os códigos de serviços da LC 116 (ISS) e os serviços
//    sujeitos à retenção na fonte (...) utilizamos como uma referência para
//    facilitar o enquadramento conforme a descrição do serviço, e em algumas
//    situações, podem não representar as características do 'efetivo serviço
//    prestado', devendo sempre ser observado o caráter interpretativo."
//
// Ou seja: esta tabela SUGERE, NUNCA DECIDE. `sugerirPorLc116` devolve
// candidatos carimbados com a origem e com esse aviso; quem escolhe é a
// pessoa. Natureza errada vai para a declaração e para o DARF.
// ═══════════════════════════════════════════════════════════════════════════
//
// DUAS COISAS QUE O MÓDULO NÃO FAZ, de propósito:
//  1. não escolhe sozinho quando há mais de um candidato — ambiguidade é
//     resposta legítima, e "provavelmente é X" não entra em declaração;
//  2. não aceita natureza fora da tabela: código inventado é recusado, não
//     "passado adiante para o validador do governo reclamar".
// ============================================================================

/** De onde a tabela veio. Vai junto de toda sugestão — sugestão sem origem vira boato. */
const ORIGEM_TABELA = {
    fonte: 'Tabela de correlação EFD-Reinf (IOB)',
    arquivoGeradoEm: '2026-08-07',
    aviso: 'Não existe correlação OFICIAL entre a lista de serviços da LC 116/2003 e a natureza do '
        + 'rendimento da EFD-Reinf: a correlação é referência de enquadramento e tem caráter '
        + 'interpretativo. Confira contra a descrição do serviço efetivamente prestado.',
};

/**
 * Tabela 01 do Anexo I — série 15xxx (PJ).
 *
 * `receitas` traz o código do DARF por tributo:
 *   IR        → 1708 (ou 3280/8045/5944 em casos próprios)
 *   AGREGADO  → 5952, a CSRF: CSLL + PIS/Pasep + Cofins num código só (4,65%)
 *
 * `lc116` são os itens da lista de serviços correlacionados; vazio quando a
 * origem diz "diversos" ou "n/a" — e vazio aqui significa "não há correlação
 * por item", nunca "serve para qualquer serviço".
 */
const TABELA_NATUREZA_RENDIMENTO = [
    {
        natureza: '15001',
        descricao: 'Importâncias pagas ou creditadas a cooperativas de trabalho relativas a serviços pessoais que lhes forem prestados por associados destas ou colocados à disposição',
        receitas: [{ tributo: 'IR', codigoReceita: '3280', frequencia: 'Mensal' }],
        lc116: [],
        lc116Texto: 'diversos',
    },
    {
        natureza: '15002',
        descricao: 'Importâncias pagas ou creditadas a associações de profissionais ou assemelhadas, relativas a serviços pessoais que lhes forem prestados por associados destas ou colocados à disposição',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: [],
        lc116Texto: 'diversos',
    },
    {
        natureza: '15003',
        descricao: 'Remuneração de Serviços de administração de bens ou negócios em geral, exceto consórcios ou fundos mútuos para aquisição de bens',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.12'],
        lc116Texto: '17.12',
    },
    {
        natureza: '15004',
        descricao: 'Remuneração de Serviços de advocacia',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.14'],
        lc116Texto: '17.14',
    },
    {
        natureza: '15005',
        descricao: 'Remuneração de Serviços de análise clínica laboratorial',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['4.02', '5.03'],
        lc116Texto: '4.02 - 5.03',
    },
    {
        natureza: '15006',
        descricao: 'Remuneração de Serviços de análises técnicas',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.01', '17.09'],
        lc116Texto: '17.01 - 17.09',
    },
    {
        natureza: '15007',
        descricao: 'Remuneração de Serviços de arquitetura',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['7.01', '7.19'],
        lc116Texto: '7.01 - 7.19',
    },
    {
        natureza: '15008',
        descricao: 'Remuneração de Serviços de assessoria e consultoria técnica, exceto serviço de assistência técnica prestado a terceiros e concernente a ramo de indústria ou comércio explorado pelo prestador do serviço;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.01', '17.03'],
        lc116Texto: '17.01 - 17.03 ou comércio explorado pelo prestador do serviço;',
    },
    {
        natureza: '15009',
        descricao: 'Remuneração de Serviços de assistência social;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['27.01'],
        lc116Texto: '27.01',
    },
    {
        natureza: '15010',
        descricao: 'Remuneração de Serviços de auditoria;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.16'],
        lc116Texto: '17.16',
    },
    {
        natureza: '15011',
        descricao: 'Remuneração de Serviços de avaliação e perícia;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.09', '28.01'],
        lc116Texto: '17.09-28.01',
    },
    {
        natureza: '15012',
        descricao: 'Remuneração de Serviços de biologia e biomedicina;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['30.01', '4.01'],
        lc116Texto: '30.01 - 4.01',
    },
    {
        natureza: '15013',
        descricao: 'Remuneração de Serviços de cálculo em geral;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.18'],
        lc116Texto: '17.18',
    },
    {
        natureza: '15014',
        descricao: 'Remuneração de Serviços de consultoria;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['1.06', '17.01', '17.20'],
        lc116Texto: '1.06 - 17.01 - 17.20',
    },
    {
        natureza: '15015',
        descricao: 'Remuneração de Serviços de contabilidade;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.19'],
        lc116Texto: '17.19',
    },
    {
        natureza: '15016',
        descricao: 'Remuneração de Serviços de desenho técnico;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['23.01', '31.01', '32.01'],
        lc116Texto: '23.01 - 31.01 - 32.01',
    },
    {
        natureza: '15017',
        descricao: 'Remuneração de Serviços de economia;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.20'],
        lc116Texto: '17.20',
    },
    {
        natureza: '15018',
        descricao: 'Remuneração de Serviços de elaboração de projetos;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['7.03'],
        lc116Texto: '7.03',
    },
    {
        natureza: '15019',
        descricao: 'Remuneração de Serviços de engenharia, exceto construção de estradas, pontes, prédios e obras assemelhadas;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['7.01', '7.19'],
        lc116Texto: '7.01 - 7.19',
    },
    {
        natureza: '15020',
        descricao: 'Remuneração de Serviços de ensino e treinamento;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['8.02', '17.24'],
        lc116Texto: '8.02 - 17.24',
    },
    {
        natureza: '15021',
        descricao: 'Remuneração de Serviços de estatística;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.21'],
        lc116Texto: '17.21',
    },
    {
        natureza: '15022',
        descricao: 'Remuneração de Serviços de fisioterapia;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['4.08'],
        lc116Texto: '4.08',
    },
    {
        natureza: '15023',
        descricao: 'Remuneração de Serviços de fonoaudiologia;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['4.08'],
        lc116Texto: '4.08',
    },
    {
        natureza: '15024',
        descricao: 'Remuneração de Serviços de geologia;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['7.01'],
        lc116Texto: '7.01',
    },
    {
        natureza: '15025',
        descricao: 'Remuneração de Serviços de leilão;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.13'],
        lc116Texto: '17.13',
    },
    {
        natureza: '15026',
        descricao: 'Remuneração de Serviços de medicina, exceto aquela prestada por ambulatório, banco de sangue, casa de saúde, casa de recuperação ou repouso sob orientação médica, hospital e pronto-socorro;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['4.01'],
        lc116Texto: '4.01',
    },
    {
        natureza: '15027',
        descricao: 'Remuneração de Serviços de nutricionismo e dietética;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['4.10'],
        lc116Texto: '4.10',
    },
    {
        natureza: '15028',
        descricao: 'Remuneração de Serviços de odontologia;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['4.12'],
        lc116Texto: '4.12',
    },
    {
        natureza: '15029',
        descricao: 'Remuneração de Serviços de organização de feiras de amostras, congressos, seminários, simpósios e congêneres;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['17.10'],
        lc116Texto: '17.10',
    },
    {
        natureza: '15030',
        descricao: 'Remuneração de Serviços de pesquisa em geral;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['2.01', '17.01'],
        lc116Texto: '2.01 - 17.01',
    },
    {
        natureza: '15031',
        descricao: 'Remuneração de Serviços de planejamento;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['1.08', '17.03'],
        lc116Texto: '1.08 - 17.03',
    },
    {
        natureza: '15032',
        descricao: 'Remuneração de Serviços de programação;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['1.01', '1.02', '1.04', '1.07', '1.08'],
        lc116Texto: '1.01 - 1.02 - 1.04 - 1.07 - 1.08',
    },
    {
        natureza: '15033',
        descricao: 'Remuneração de Serviços de prótese;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['4.14'],
        lc116Texto: '4.14',
    },
    {
        natureza: '15034',
        descricao: 'Remuneração de Serviços de psicologia e psicanálise;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['4.15', '4.16'],
        lc116Texto: '4.15 - 4.16',
    },
    {
        natureza: '15035',
        descricao: 'Remuneração de Serviços de química;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['7.12', '30.01'],
        lc116Texto: '7.12 - 30.01',
    },
    {
        natureza: '15036',
        descricao: 'Remuneração de Serviços de radiologia e radioterapia;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['4.02'],
        lc116Texto: '4.02',
    },
    {
        natureza: '15037',
        descricao: 'Remuneração de Serviços de relações públicas;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['35.01'],
        lc116Texto: '35.01',
    },
    {
        natureza: '15038',
        descricao: 'Remuneração de Serviços de serviço de despachante;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['33.01'],
        lc116Texto: '33.01',
    },
    {
        natureza: '15039',
        descricao: 'Remuneração de Serviços de terapêutica ocupacional;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['4.08'],
        lc116Texto: '4.08',
    },
    {
        natureza: '15040',
        descricao: 'Remuneração de Serviços de tradução ou interpretação comercial;',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.02'],
        lc116Texto: '17.02',
    },
    {
        natureza: '15041',
        descricao: 'Remuneração de Serviços de urbanismo;',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['7.01', '7.19'],
        lc116Texto: '7.01 e 7.19',
    },
    {
        natureza: '15042',
        descricao: 'Remuneração de Serviços de veterinária.',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['5.01'],
        lc116Texto: '5.01',
    },
    {
        natureza: '15043',
        descricao: 'Remuneração de Serviços de Limpeza',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['7.10', '7.11', '14.01'],
        lc116Texto: '7.10 - 7.11 - 14.01',
    },
    {
        natureza: '15044',
        descricao: 'Remuneração de Serviços de Conservação/ Manutenção, exceto reformas e obras assemelhadas',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['7.10', '7.11', '14.01'],
        lc116Texto: '7.10 - 7.11 - 14.01',
    },
    {
        natureza: '15045',
        descricao: 'Remuneração de Serviços de Segurança/Vigilância/Transporte de valores',
        receitas: [{ tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }, { tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: ['11.02', '11.05'],
        lc116Texto: '11.02 - 11.05',
    },
    {
        natureza: '15046',
        descricao: 'Remuneração de Serviços Locação de Mão de obra',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['17.05'],
        lc116Texto: '17.05',
    },
    {
        natureza: '15047',
        descricao: 'Remuneração de Serviços de Assessoria Creditícia, Mercadológica, Gestão de Crédito, Seleção e Riscos e Administração de Contas a Pagar e a Receber',
        receitas: [{ tributo: 'IR', codigoReceita: '5944', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['10.04'],
        lc116Texto: '10.04',
    },
    {
        natureza: '15050',
        descricao: 'Pagamento a título de transporte internacional de valores efetuado por empresas nacionais estaleiros navais brasileiros nas atividades de conservação, modernização, conversão e reparo de embarcações pré-registradas ou registradas no Registro Especial Brasileiro (REB)',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: [],
        lc116Texto: 'n/a',
    },
    {
        natureza: '15051',
        descricao: 'Pagamento efetuado a empresas estrangeiras de transporte de valores',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }],
        lc116: [],
        lc116Texto: 'n/a',
    },
    {
        natureza: '15052',
        descricao: 'Demais comissões, corretagens, ou qualquer outra importância paga/creditada pela representação comercial ou pela mediação na realização de negócios civis e comerciais, que não se enquadrem nas situações listadas nos códigos do grupo 20',
        receitas: [{ tributo: 'IR', codigoReceita: '8045', frequencia: 'Mensal' }],
        lc116: ['10.09'],
        lc116Texto: '10.09',
    },
    {
        natureza: '15099',
        descricao: 'Demais Rendimentos de serviços técnicos, de assistência técnica, de assistência administrativa e semelhantes',
        receitas: [{ tributo: 'IR', codigoReceita: '1708', frequencia: 'Mensal' }, { tributo: 'AGREGADO', codigoReceita: '5952', frequencia: 'Mensal' }],
        lc116: ['14.02', '31.01'],
        lc116Texto: '14.02/31.01/outros',
    },];

const POR_CODIGO = new Map(TABELA_NATUREZA_RENDIMENTO.map((n) => [n.natureza, n]));

/** Só dígitos, para aceitar "15.026" ou " 15026 " sem inventar código. */
function normalizar(codigo) {
  return String(codigo == null ? '' : codigo).replace(/\D/g, '');
}

/**
 * A natureza pelo código. `null` quando não existe na tabela — e não existir
 * é resposta: código inventado não vira evento.
 */
function buscarNatureza(codigo) {
  return POR_CODIGO.get(normalizar(codigo)) || null;
}

/**
 * Valida a natureza informada para um R-4020.
 * Recusa vazio e recusa código fora da tabela, com a AÇÃO na mensagem.
 */
function validarNatureza(codigo) {
  const cod = normalizar(codigo);
  if (!cod) {
    return { valida: false, erro: 'Informe o código de natureza do rendimento (Tabela 01 do Anexo I da EFD-Reinf).' };
  }
  const achada = POR_CODIGO.get(cod);
  if (!achada) {
    return {
      valida: false,
      erro: `Natureza "${cod}" não existe na tabela do R-4020 (série 15xxx, serviços de PJ). `
        + 'Confira o código na tabela — o evento seria recusado na transmissão.',
    };
  }
  return { valida: true, natureza: achada };
}

/**
 * Código de receita do DARF para (natureza, tributo).
 *
 *   'IR'        retenção de IRPJ
 *   'AGREGADO'  a CSRF (CSLL + PIS/Pasep + Cofins), código 5952
 *
 * `null` quando aquela natureza não prevê aquele tributo — e isso é resposta,
 * não motivo para chutar 1708/5952.
 */
function codigoReceitaDe(codigo, tributo) {
  const n = buscarNatureza(codigo);
  if (!n) return null;
  const alvo = String(tributo || '').toUpperCase();
  const r = n.receitas.find((x) => x.tributo === alvo);
  return r ? r.codigoReceita : null;
}

/**
 * SUGERE naturezas a partir do item da lista de serviços da LC 116/2003.
 *
 * Devolve SEMPRE uma lista (0, 1 ou várias) e SEMPRE o aviso da origem. Não
 * escolhe sozinho: ambiguidade é resposta legítima, e a própria tabela de
 * origem diz que a correlação é interpretativa.
 */
function sugerirPorLc116(itemLc) {
  const item = String(itemLc == null ? '' : itemLc).trim();
  const sugestoes = item
    ? TABELA_NATUREZA_RENDIMENTO.filter((n) => n.lc116.includes(item))
    : [];
  return {
    item,
    sugestoes: sugestoes.map((n) => ({
      natureza: n.natureza,
      descricao: n.descricao,
      receitas: n.receitas,
      origem: ORIGEM_TABELA.fonte,
    })),
    ambigua: sugestoes.length > 1,
    aviso: ORIGEM_TABELA.aviso,
    // Sem candidato NÃO quer dizer "não há retenção": quer dizer que a
    // correlação por item não resolve, e alguém precisa enquadrar pela
    // descrição do serviço.
    acao: sugestoes.length === 0
      ? `Nenhuma natureza correlacionada ao item ${item || '(vazio)'} da LC 116. Enquadre pela DESCRIÇÃO do serviço prestado.`
      : sugestoes.length > 1
        ? 'Mais de uma natureza possível — escolha pela descrição do serviço efetivamente prestado.'
        : null,
  };
}

/** Busca por texto na descrição (o enquadramento que a origem manda fazer). */
function buscarPorDescricao(termo) {
  const t = String(termo || '').trim().toLowerCase();
  if (t.length < 3) return [];
  return TABELA_NATUREZA_RENDIMENTO
    .filter((n) => n.descricao.toLowerCase().includes(t))
    .map((n) => ({ natureza: n.natureza, descricao: n.descricao, receitas: n.receitas }));
}

module.exports = {
  ORIGEM_TABELA,
  TABELA_NATUREZA_RENDIMENTO,
  buscarNatureza,
  validarNatureza,
  codigoReceitaDe,
  sugerirPorLc116,
  buscarPorDescricao,
};
