'use strict';
// ============================================================================
// graph-credencial.js  (PURO — testável)
// ----------------------------------------------------------------------------
// 🛡️ O MATA-BURRO DA CREDENCIAL DO E-MAIL — portado do CFI em 24/09 (Paulo:
// *"isso não pode voltar a acontecer"*).
//
// O que aconteceu lá: o segredo do app *Notificacoes* ficou com o Secret ID
// (36 caracteres) no lugar do Value, e ninguém soube até um envio falhar na
// mão de quem usa. Credencial morta é silêncio: nenhum e-mail sai e nenhum
// alerta chega — o próprio alerta sairia por e-mail.
//
// Aqui: a FORMA do segredo (sem nunca mostrar o valor), o VEREDITO de uma
// sondagem (o resultado de pedir token à Microsoft, sem I/O neste módulo) e a
// FAIXA que a tela mostra a todo mundo enquanto a credencial estiver recusada.
// ============================================================================

/** O *Secret ID* do Azure é um GUID — e é ele que a tela deixa copiável para sempre. */
const FORMA_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Com que frequência a sonda roda sozinha (quem abre o app dispara, se passou). */
const INTERVALO_SONDA_MS = 24 * 60 * 60 * 1000;
/** Depois disto sem sondar, "ok" é leitura velha e a faixa amarela acende. */
const VIGIA_VELHO_MS = 2 * INTERVALO_SONDA_MS;

const ONDE_GRAVAR = 'Cloud Run → serviço plano-contas-iob (região us-west1, projeto gen-lang-client-0569062468) → '
  + 'variável GRAPH_CLIENT_SECRET, que aponta para o segredo do app "Consultor Fiscal Inteligente - Notificacoes" '
  + '(o MESMO do e-mail do CFI). Grave a versão nova nesse segredo e suba uma REVISÃO NOVA do serviço com '
  + '--update-secrets GRAPH_CLIENT_SECRET=<segredo>:latest — o :latest só é lido quando o contêiner sobe. '
  + 'Nunca --set-env-vars (apaga as outras variáveis).';

/**
 * Que forma tem o segredo gravado. O valor NUNCA sai daqui.
 * @returns {{forma: 'vazio'|'id-secreto'|'com-espaco-ou-quebra'|'nao-reconhecida', caracteres: number, ehProblema: boolean, diagnostico: string|null}}
 */
function formaDoClientSecret(valor) {
  const bruto = valor == null ? '' : String(valor);
  if (bruto.trim() === '') {
    return { forma: 'vazio', caracteres: 0, ehProblema: true, diagnostico: 'Não há segredo gravado — a Microsoft recusa toda chamada.' };
  }
  if (/\s/.test(bruto)) {
    if (FORMA_GUID.test(bruto.replace(/\s/g, ''))) {
      return {
        forma: 'id-secreto', caracteres: bruto.length, ehProblema: true,
        diagnostico: 'O que está gravado é o ID do segredo (GUID de 36 caracteres), com espaço ou quebra de linha junto — não é o Valor. '
          + 'Crie um segredo NOVO no Azure e copie a coluna Valor no instante em que ela aparece.',
      };
    }
    return {
      forma: 'com-espaco-ou-quebra', caracteres: bruto.length, ehProblema: true,
      diagnostico: 'O segredo gravado tem espaço ou quebra de linha — a Microsoft compara caractere a caractere e recusa. '
        + 'Regrave o mesmo valor sem o espaço (a colagem costuma trazer um \\n no fim).',
    };
  }
  if (FORMA_GUID.test(bruto)) {
    return {
      forma: 'id-secreto', caracteres: bruto.length, ehProblema: true,
      diagnostico: 'O que está gravado é o ID do segredo (GUID de 36 caracteres), não o Valor dele. No Azure o Secret ID fica '
        + 'copiável para sempre e o Valor aparece SÓ no instante da criação. Não há como recuperar o Valor: crie um segredo NOVO '
        + 'e copie a coluna Valor na hora.',
    };
  }
  return { forma: 'nao-reconhecida', caracteres: bruto.length, ehProblema: false, diagnostico: null };
}

/** Qual é a causa da recusa, quando a resposta da Microsoft permite dizer. 'indeterminada' é resposta legítima. */
function causaDaRecusa(motivo) {
  const m = String(motivo || '');
  if (/AADSTS7000215/i.test(m) || /secret\s+value.*not.*secret\s+id/i.test(m)) return 'segredo-nao-confere';
  if (/expir/i.test(m) && /(secret|key|certificate)/i.test(m)) return 'segredo-expirado';
  if (/AADSTS90002/i.test(m) || /tenant[^.]*not\s+found/i.test(m)) return 'tenant-inexistente';
  return 'indeterminada';
}

/** Qual app do Azure a Microsoft nomeou na recusa (id cru, para procurar no portal). */
function appDaRecusa(motivo) {
  const m = /app\s+'([0-9a-f-]{36})'/i.exec(String(motivo || ''));
  return m ? m[1].toLowerCase() : null;
}

/**
 * Traduz o resultado de um pedido de token em algo com AÇÃO.
 * ⚠️ Recebe o RESULTADO, nunca faz I/O — é o que permite provar as situações sem rede.
 * @param {{ok: boolean, configurado: boolean, erro?: string}} r
 */
function vereditoDaCredencialDeEmail(r) {
  const { ok, configurado, erro } = r || {};
  if (!configurado) {
    return {
      situacao: 'nao-configurado', cor: 'vermelho',
      titulo: 'As credenciais do e-mail não estão preenchidas.',
      detalhe: 'Faltam GRAPH_CLIENT_ID, GRAPH_TENANT_ID ou GRAPH_CLIENT_SECRET no serviço plano-contas-iob (Cloud Run). '
        + 'Enquanto isso, nenhum e-mail sai pelo app.',
      onde: ONDE_GRAVAR,
    };
  }
  if (ok) {
    return {
      situacao: 'ok', cor: 'verde',
      titulo: 'A Microsoft aceitou a credencial do e-mail.',
      detalhe: 'O token saiu. Isto prova a CREDENCIAL — não prova que a caixa do remetente existe nem que a mensagem chegou ao cliente.',
      onde: null,
    };
  }
  const msg = String(erro || '');
  const causa = causaDaRecusa(msg);
  const app = appDaRecusa(msg);
  const detalhe = {
    'segredo-nao-confere': 'O segredo gravado não confere com o que o Azure espera para este aplicativo. A frase "informe o VALOR do segredo, '
      + 'não o ID" é o texto padrão de todo AADSTS7000215 — a causa mais comum, não um diagnóstico. São três possibilidades: '
      + '(1) foi copiado o Secret ID (GUID de 36 caracteres); (2) o segredo é de OUTRO aplicativo; (3) a colagem veio truncada '
      + 'ou com espaço/quebra de linha. Quem desempata é a FORMA medida abaixo, não a mensagem.',
    'segredo-expirado': 'O segredo venceu. Crie um novo no Azure (App registrations → Certificates & secrets → New client secret) '
      + 'e copie a coluna Valor NA HORA — depois ela some.',
    'tenant-inexistente': 'O tenant enviado não existe: confira GRAPH_TENANT_ID contra o do serviço consultor-fiscal-inteligente (é o mesmo).',
    indeterminada: 'A Microsoft recusou a credencial e a resposta não diz a causa — leve a mensagem INTEIRA (código AADSTS, Trace ID '
      + 'e Timestamp) ao portal do Azure. O app não deduz o motivo.',
  }[causa];
  return {
    situacao: 'recusada', cor: 'vermelho',
    titulo: 'A Microsoft RECUSOU a credencial do e-mail — nenhum e-mail sai pelo app.',
    detalhe: `${detalhe}${app ? ` A Microsoft nomeou o app ${app}.` : ''}`,
    causa,
    onde: ONDE_GRAVAR,
  };
}

/** A sonda automática precisa rodar de novo? (nunca rodou, ou passou o intervalo) */
function precisaSondar(doc, agoraMs = Date.now()) {
  if (!doc || !doc.testadoEm) return true;
  const idade = agoraMs - Date.parse(doc.testadoEm);
  return !Number.isFinite(idade) || idade >= INTERVALO_SONDA_MS;
}

/**
 * O documento gravado após uma sonda: guarda desde quando falha
 * (`primeiraFalhaEm`) e a última vez que passou (`ultimoOkEm`).
 */
function documentoDoVigia(veredito, anterior) {
  const v = veredito || {};
  const ok = v.situacao === 'ok';
  const antesFalhava = anterior && anterior.situacao && anterior.situacao !== 'ok';
  return {
    ...v,
    primeiraFalhaEm: ok ? null : (antesFalhava && anterior.primeiraFalhaEm ? anterior.primeiraFalhaEm : v.testadoEm),
    ultimoOkEm: ok ? v.testadoEm : ((anterior && anterior.ultimoOkEm) || null),
  };
}

const dataBr = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

/**
 * A faixa que a tela mostra a TODO MUNDO. `null` quando não há o que dizer.
 * Vigia velho (sem sondar há > 2 dias) também acende: silêncio não é saúde.
 */
function faixaDoVigia(doc, agoraMs = Date.now()) {
  if (!doc) {
    return {
      cor: 'amarelo',
      titulo: 'A credencial do e-mail ainda não foi sondada.',
      detalhe: 'O app não sabe se o envio de e-mail funciona. Um administrador pode usar "Testar credencial do e-mail" no painel Admin.',
      desde: null,
    };
  }
  const idade = agoraMs - Date.parse(doc.testadoEm || '');
  if (doc.situacao === 'ok') {
    if (Number.isFinite(idade) && idade > VIGIA_VELHO_MS) {
      return {
        cor: 'amarelo',
        titulo: `A credencial do e-mail não é sondada desde ${dataBr(doc.testadoEm)}.`,
        detalhe: 'A sonda automática não rodou — o "ok" é a leitura de antes. Um administrador pode testar agora no painel Admin.',
        desde: doc.testadoEm,
      };
    }
    return null;
  }
  return {
    cor: 'vermelho',
    titulo: `${doc.titulo || 'A Microsoft recusou a credencial do e-mail.'} Nenhum e-mail sai pelo app${doc.primeiraFalhaEm ? ` desde ${dataBr(doc.primeiraFalhaEm)}` : ''}.`,
    detalhe: (doc.onde ? `Onde corrigir: ${doc.onde}` : (doc.detalhe || ''))
      + (doc.forma && doc.forma.ehProblema ? ` Forma do segredo gravado: ${doc.forma.diagnostico}` : ''),
    desde: doc.primeiraFalhaEm || doc.testadoEm,
  };
}

module.exports = {
  INTERVALO_SONDA_MS, VIGIA_VELHO_MS, ONDE_GRAVAR,
  formaDoClientSecret, causaDaRecusa, appDaRecusa, vereditoDaCredencialDeEmail,
  precisaSondar, documentoDoVigia, faixaDoVigia,
};
