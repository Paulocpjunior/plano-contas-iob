// ============================================================================
// departamento-gate.js — o gate do SaaS neste módulo, em MODO AVISO.
// ----------------------------------------------------------------------------
// Desenho do Paulo (08/08): usuário unificado com DEPARTAMENTO obrigatório;
// vinculado ao departamento, a pessoa abre o módulo. O vínculo mora no
// cadastro central (CFI, users.departamentos) e este app PERGUNTA no login.
//
// ═══ POR QUE AVISO, E NÃO BLOQUEIO (por enquanto) ═══════════════════════════
//
// No dia em que isto subiu, NINGUÉM tinha departamento preenchido — as caixas
// de seleção nasceram no mesmo dia, no Gerenciar Usuários do CFI. Bloquear já
// trancaria a equipe inteira para fora na segunda de manhã, com o cadastro
// certo e o vínculo apenas pendente.
//
// Então o gate nasce dizendo a verdade sem morder: quem está sem vínculo vê o
// aviso com a AÇÃO (peça ao admin), e continua trabalhando. A chave
// DEPARTAMENTO_GATE_MODO=bloqueio vira o comportamento quando o Paulo terminar
// de vincular — sem novo deploy de código, só env.
//
// ═══ FALHA DO TÚNEL NUNCA TRANCA NINGUÉM ════════════════════════════════════
//
// CFI fora do ar ⇒ resposta indeterminada ⇒ acesso segue (mesmo em modo
// bloqueio). Regra de emissão de guia ao contrário: lá, indeterminado PARA
// (reenviar duplica cobrança); aqui, indeterminado LIBERA — trancar o
// escritório porque um serviço piscou é o dano maior, e o vínculo se confere
// na próxima passada.
// ============================================================================
const { buscarAcessoModuloNoCfi } = require('./reinf/cfi-notas-client');

const MODULO_DESTE_APP = 'contabil';

function modoAtual(env = process.env) {
  return String(env.DEPARTAMENTO_GATE_MODO || 'aviso').trim().toLowerCase() === 'bloqueio'
    ? 'bloqueio' : 'aviso';
}

/**
 * A trava de HORÁRIO (Paulo, 10/08) chega no MESMO corpo do túnel, no campo
 * `horario`, JÁ decidida pelo CFI: ele só devolve `permitido:false` quando a
 * chave-mestra dele (HORARIO_ACESSO_ATIVO=bloqueio) está armada — por isso o
 * arme é ÚNICO e central ("os 5 módulos de uma vez"), e cabear este app agora
 * é inócuo até o Paulo virar a env lá. Admin já vem liberado de lá.
 *
 * Ela é INDEPENDENTE do DEPARTAMENTO_GATE_MODO: o horário pode barrar mesmo com
 * o gate de departamento em aviso, porque quem arma o horário é o CFI, não este
 * env. Túnel fora do ar ⇒ sem `horario` ⇒ não barra (mesma regra do resto).
 * @returns {{ bloqueia: boolean, mensagem: string|null }}
 */
function avaliarHorario(acesso) {
  const h = acesso && acesso.horario;
  if (!h || h.permitido !== false) return { bloqueia: false, mensagem: null };
  return {
    bloqueia: true,
    mensagem: h.mensagem
      || `Acesso fora do horário permitido${h.janela ? ` — seu acesso é ${h.janela}` : ''}. `
        + 'Se precisar de exceção, fale com um administrador.',
  };
}

/**
 * A decisão, pura: resposta do túnel (ou erro) + modo → o que a tela faz.
 * Dobra as DUAS travas (departamento + horário) na mesma forma que o front já
 * consome; `titulo` diz qual delas fechou a porta, senão o cadeado mentiria
 * "sem vínculo" para quem só está fora do horário.
 * @returns {{permitido, modo, aviso: string|null, motivo: string|null, titulo?: string, bloqueio?: string}}
 */
function decidirGate({ acesso, erro, modo }) {
  if (erro || !acesso) {
    return {
      permitido: true, modo,
      indeterminado: true,
      aviso: null, // túnel fora do ar não vira faixa amarela pra todo mundo
      motivo: erro ? String(erro.message || erro) : 'sem resposta do cadastro central',
    };
  }
  // Horário barra ANTES: é trava armada no CFI e vale mesmo com departamento OK.
  const horario = avaliarHorario(acesso);
  if (horario.bloqueia) {
    return {
      permitido: false, modo, indeterminado: false,
      bloqueio: 'horario',
      titulo: 'Fora do horário de acesso',
      aviso: null, motivo: horario.mensagem,
    };
  }
  if (acesso.temAcesso) {
    return { permitido: true, modo, indeterminado: false, aviso: null, motivo: acesso.motivo || null };
  }
  if (modo === 'bloqueio') {
    return {
      permitido: false, modo, indeterminado: false,
      bloqueio: 'departamento',
      titulo: 'Sem vínculo com o módulo Contábil',
      aviso: null, motivo: acesso.motivo || 'Sem vínculo com este módulo.',
    };
  }
  return {
    permitido: true, modo, indeterminado: false,
    aviso: (acesso.motivo || 'Você está sem vínculo de departamento.')
      + ' Por enquanto o acesso continua liberado; em breve o vínculo será obrigatório.',
    motivo: acesso.motivo || null,
  };
}

/**
 * Registra GET /api/departamento/gate — chamado pela tela logo após o login.
 * O token do usuário abre a porta no CFI (crossProjectAuth aceita este
 * projeto), igual às consultas do R-4020.
 */
function registrarGateDepartamento(app) {
  app.get('/api/departamento/gate', async (req, res) => {
    const modo = modoAtual();
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    let acesso = null;
    let erro = null;
    try {
      acesso = await buscarAcessoModuloNoCfi({ email: req.user?.email, modulo: MODULO_DESTE_APP, token });
    } catch (e) { erro = e; }
    const d = decidirGate({ acesso, erro, modo });
    if (d.indeterminado) {
      console.warn(`[departamento-gate] indeterminado para ${req.user?.email}: ${d.motivo}`);
    }
    res.json({ ok: true, modulo: MODULO_DESTE_APP, ...d });
  });
}

module.exports = { decidirGate, avaliarHorario, registrarGateDepartamento, modoAtual, MODULO_DESTE_APP };
