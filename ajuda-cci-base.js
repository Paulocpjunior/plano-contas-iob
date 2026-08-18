'use strict';

const { textoManualCCI } = require('./manual-cci-base');

const BASE_AJUDA_CCI = [
  {
    modulo: 'Começar o trabalho',
    termos: ['começar', 'iniciar', 'ativar empresa', 'empresa ativa'],
    orientacao: 'Localize a empresa em Ativar empresa e clique em Ativar empresa no cartão. O CCI só libera os demais módulos depois que uma empresa estiver ativa, evitando misturar dados entre CNPJs.'
  },
  {
    modulo: 'Importação bancária',
    termos: ['extrato', 'ofx', 'pdf', 'importar banco', 'extrator'],
    orientacao: 'Na empresa ativa, abra Operação > Extrator, informe banco, conta e período, selecione o arquivo e confira a prévia. O CCI valida duplicidade, versão do importador, layout e vínculo com a empresa antes de persistir. Não importe novamente um arquivo já contabilizado sem primeiro revisar a importação anterior.'
  },
  {
    modulo: 'Conciliação e memória',
    termos: ['conciliar', 'memorizar', 'memória', 'classificar', 'lançamento'],
    orientacao: 'Revise descrição, débito, crédito, código IOB e histórico dos lançamentos. Memorize somente descrições específicas o bastante para identificar a operação. Padrões genéricos, como apenas Cobrança, devem conservar o identificador ou fornecedor antes de virar regra.'
  },
  {
    modulo: 'Relatórios contábeis',
    termos: ['balancete', 'razão', 'diário', 'dre', 'balanço', 'relatório'],
    orientacao: 'Abra Contábil > Relatórios Contábeis, selecione o período e o relatório. O balancete usa a hierarquia do plano de contas; o razão detalha os lançamentos das contas. DRE, balanço e análise dependem de plano estruturado, saldos e lançamentos conciliados.'
  },
  {
    modulo: 'Implantação exclusiva no CCI',
    termos: ['saldos anteriores', 'saldo de abertura', 'substituir sage', 'modo exclusivo', 'implantação'],
    orientacao: 'Empresas que começam a escrituração diretamente no CCI devem ter modo contábil exclusivo, início de escrituração e saldos de abertura cadastrados e aprovados. O painel de prontidão mostra pendências e a próxima ação antes do fechamento.'
  },
  {
    modulo: 'Regime tributário',
    termos: ['regime', 'simples nacional', 'lucro presumido', 'lucro real', 'cfi'],
    orientacao: 'O regime tributário é sincronizado do cadastro central do CFI ao abrir a empresa no CCI. Se estiver ausente ou divergente, corrija primeiro o cadastro oficial no CFI e sincronize novamente; não invente o regime no lançamento.'
  },
  {
    modulo: 'Parametrização tributária',
    termos: ['parametrizar regime', 'regras do regime', 'simples nacional', 'lucro presumido', 'lucro real'],
    orientacao: 'No Cadastro da empresa, clique em Parametrizar regras. O Simples exige critério de receita, anexos e segregações revisadas; o Lucro Presumido exige tratamento de PIS/COFINS e revisão das atividades e receitas adicionais; o Lucro Real exige forma de apuração, tratamento de PIS/COFINS, e-Lalur/e-Lacs e critérios de créditos revisados. Somente administrador confirma. Em empresa exclusiva no CCI, pendências bloqueiam o fechamento.'
  },
  {
    modulo: 'Ativo e depreciação',
    termos: ['ativo', 'bem', 'depreciação', 'baixa de bem'],
    orientacao: 'Use Contábil > Ativo e Depreciação para cadastrar bens, vida útil, data de entrada, valor e conta contábil. Revise a política contábil e fiscal aplicável antes de confirmar taxas ou baixas; a Ajuda CCI não substitui decisão técnica do contador responsável.'
  },
  {
    modulo: 'Fechamento mensal',
    termos: ['fechar mês', 'encerrar período', 'fechamento', 'reabrir'],
    orientacao: 'Antes de fechar, confira prontidão, saldos, conciliação, débitos e créditos, pendências e relatórios. A reabertura de período é exclusiva de administrador e deve ser usada com justificativa e nova conferência.'
  },
  {
    modulo: 'ECD e ECF',
    termos: ['ecd', 'ecf', 'sped contábil'],
    orientacao: 'Abra Obrigações > ECD/ECF para validar e consolidar arquivos da matriz e filiais. Faça a conferência dos registros e das demonstrações antes da geração definitiva. Divergências técnicas devem ser encaminhadas ao contador responsável.'
  },
  {
    modulo: 'Migração e exportação SAGE',
    termos: ['sage', 'exportar', 'migração'],
    orientacao: 'Empresas em modo ponte podem usar Migração SAGE e Exportar. Empresas definidas como exclusivas no CCI têm a exportação para a SAGE bloqueada para evitar dupla escrituração.'
  },
  {
    modulo: 'Permissões administrativas',
    termos: ['admin', 'administrador', 'permissão', 'acesso', 'excluir', 'usuário'],
    orientacao: 'Ações sensíveis são exclusivas de administrador, incluindo gerenciar usuários e responsáveis, excluir empresa ou plano, excluir lançamentos em massa, homologar layouts, trocar plano e reabrir período. Quando aparecer o aviso de acesso restrito, procure um administrador e informe empresa, tela e ação desejada.'
  }
];

const ACOES_ADMIN_CCI = [
  'gerenciar usuários e permissões',
  'definir responsáveis pelas empresas',
  'excluir empresa ou plano de contas',
  'trocar o plano vinculado à empresa',
  'excluir lançamentos em massa',
  'homologar ou bloquear layouts bancários',
  'reabrir período contábil',
  'alterar memórias de classificação já gravadas'
];

function textoBaseAjuda() {
  const baseRapida = BASE_AJUDA_CCI.map((item) => `${item.modulo}: ${item.orientacao}`).join('\n');
  return `${baseRapida}\n\nMANUAL OPERACIONAL OFICIAL:\n${textoManualCCI()}`;
}

function parecePerguntaAdministrativa(pergunta) {
  const texto = String(pergunta || '').toLocaleLowerCase('pt-BR');
  return /(reabrir|excluir (empresa|plano|lan[cç]amentos)|trocar plano|homologar|bloquear layout|promover.*admin|permiss[aã]o|gerenciar usu[aá]rios|respons[aá]ve(is|l))/i.test(texto);
}

module.exports = { BASE_AJUDA_CCI, ACOES_ADMIN_CCI, textoBaseAjuda, parecePerguntaAdministrativa };
