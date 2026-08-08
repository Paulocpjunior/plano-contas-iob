// ============================================================================
// reinf/certificado-conferencia.js  (PURO — testável)
// ----------------------------------------------------------------------------
// O ESCRITÓRIO TEM DUAS CÓPIAS DA MESMA CHAVE — e ninguém estava vendo.
//
// Este app assina TODOS os eventos do EFD-Reinf com o A1 da SP Assessoria como
// procuradora (`cert-loader`), guardado no Secret Manager DESTE projeto. O CFI
// guarda certificado A1 no dele. São dois cofres, e nada nunca comparou os
// dois.
//
// ═══ POR QUE ISSO IMPORTA, E NÃO É TEORIA ═══════════════════════════════════
//
// Quando o certificado do escritório é renovado, alguém sobe o arquivo novo —
// **em um dos cofres**. O outro continua com o antigo, e nada acusa: o app
// segue assinando normalmente até o dia em que o antigo vence, e aí TODA
// transmissão para de uma vez, para todos os clientes.
//
// A prova é o FINGERPRINT (SHA-256 do DER), calculado do mesmo jeito nos dois
// lados. Mesma impressão digital = mesmo arquivo. Diferente = duas chaves
// distintas em uso no escritório, e renovar uma não renova a outra.
//
// ═══ E POR QUE A CONFERÊNCIA NÃO É "O CLIENTE TEM CERTIFICADO?" ═════════════
//
// A tentação era pendurar a aptidão do CLIENTE na tela de transmissão. Seria
// alarme falso: aqui não se usa o certificado do cliente em momento nenhum —
// a assinatura e o mTLS saem do A1 do escritório, por procuração. "Cliente sem
// certificado" ao lado de uma transmissão que não depende dele é o tipo de
// aviso que ensina a equipe a ignorar aviso.
//
// O que DE FATO trava a transmissão é o certificado daqui. É ele que se
// confere.
// ============================================================================

const texto = (v) => {
  const t = String(v == null ? '' : v).trim();
  return t || null;
};

/** Dias entre agora e a validade. Dia de calendário, não hora. */
function diasAte(notAfter, agora) {
  const fim = notAfter ? new Date(notAfter) : null;
  if (!fim || Number.isNaN(fim.getTime())) return null;
  return Math.floor((fim.getTime() - agora.getTime()) / 86400000);
}

/**
 * Confere o certificado DESTE app contra o que o CFI guarda para o mesmo CNPJ.
 *
 * @param {object} p
 * @param {object} p.daqui  { titular, notAfter, fingerprint, cnpj } do cert-loader
 * @param {object} [p.doCfi]  resposta de /api/admin/cadastro/certificados/:cnpj
 * @param {Error|string} [p.erroCfi]  quando o túnel não respondeu
 * @param {Date} [p.agora]
 */
function conferirCertificado({ daqui, doCfi, erroCfi, agora = new Date() } = {}) {
  if (!daqui || !daqui.fingerprint) {
    return {
      situacao: 'sem-certificado-aqui',
      titulo: 'Certificado não carregado',
      frase: 'Este app não conseguiu carregar o A1 do escritório. Sem ele não há assinatura nem transmissão.',
      exigeAcao: true, diasParaVencer: null,
    };
  }

  const dias = diasAte(daqui.notAfter, agora);
  const base = {
    titular: texto(daqui.titular),
    cnpj: texto(daqui.cnpj),
    validoAte: texto(daqui.notAfter),
    diasParaVencer: dias,
    fingerprintCurto: String(daqui.fingerprint).slice(0, 16),
  };

  // O certificado DAQUI vencido vence qualquer outra conversa: nada transmite.
  if (dias !== null && dias <= 0) {
    return {
      ...base,
      situacao: 'vencido-aqui',
      titulo: 'Certificado do escritório VENCIDO',
      frase: `O A1 usado para assinar e transmitir venceu em ${base.validoAte}. Nenhum evento sai `
        + 'enquanto ele não for renovado — e isso vale para TODOS os clientes de uma vez.',
      exigeAcao: true,
    };
  }

  // Túnel fora do ar: não se afirma nada sobre o outro cofre.
  if (erroCfi || !doCfi) {
    return {
      ...base,
      situacao: 'nao-conferido',
      titulo: 'Certificado carregado (sem conferência com o CFI)',
      frase: `Assinando com ${base.titular || 'o A1 do escritório'}, válido até ${base.validoAte}`
        + (dias === null ? '.' : ` (${dias} dia(s)).`)
        + ' Não deu para conferir contra o cadastro do Consultor Fiscal agora'
        + (erroCfi ? ` (${texto(erroCfi.message || erroCfi)}).` : '.'),
      exigeAcao: false,
    };
  }

  const doCfiCert = doCfi.certificado || doCfi.certificadoDaRaiz || null;

  // O CFI não conhece este certificado: não há com o que comparar, e dizer
  // "conferido" seria mentira.
  if (!doCfiCert || !doCfiCert.fingerprint) {
    return {
      ...base,
      situacao: 'cfi-nao-tem',
      titulo: 'Certificado sem par no Consultor Fiscal',
      frase: `Assinando com ${base.titular || 'o A1 do escritório'}, válido até ${base.validoAte}. `
        + `O Consultor Fiscal não tem certificado cadastrado para o CNPJ ${base.cnpj || '—'}`
        + `${doCfi.motivo ? ` (${doCfi.motivo})` : ''}, então esta cópia não tem com o que ser conferida.`,
      exigeAcao: false,
    };
  }

  const iguais = String(doCfiCert.fingerprint).toLowerCase() === String(daqui.fingerprint).toLowerCase();

  // 🚨 O CASO QUE MORDE: dois certificados DIFERENTES em uso no escritório.
  if (!iguais) {
    const cfiVenceDepois = String(doCfiCert.validoAte || '') > String(daqui.notAfter || '');
    return {
      ...base,
      situacao: 'certificados-diferentes',
      titulo: 'Dois certificados diferentes no escritório',
      frase: `Este app assina com um A1 válido até ${base.validoAte}, e o Consultor Fiscal guarda `
        + `OUTRO certificado para o mesmo CNPJ (válido até ${doCfiCert.validoAte}). `
        + (cfiVenceDepois
          ? 'O do Consultor Fiscal vence DEPOIS — tudo indica que a renovação foi feita lá e não aqui, '
            + 'e esta cópia vai parar de transmitir antes.'
          : 'Renovar em um dos cofres não renova o outro.')
        + ' Suba o certificado atual também aqui, na aba de certificado.',
      exigeAcao: true,
      cfiValidoAte: doCfiCert.validoAte || null,
      cfiFingerprintCurto: String(doCfiCert.fingerprint).slice(0, 16),
    };
  }

  // Mesmo arquivo nos dois cofres. Note que "igual" NÃO é "uma cópia só": a
  // chave continua existindo em dois lugares, e é isso que a fase 4 do túnel
  // (assinatura como operação do CFI) resolve de vez.
  return {
    ...base,
    situacao: dias !== null && dias <= 30 ? 'mesmo-certificado-vencendo' : 'mesmo-certificado',
    titulo: dias !== null && dias <= 30
      ? `Certificado confere, mas vence em ${dias} dia(s)`
      : 'Certificado confere com o Consultor Fiscal',
    frase: `Mesmo A1 nos dois sistemas (${base.fingerprintCurto}…), titular ${base.titular || '—'}, `
      + `válido até ${base.validoAte}`
      + (dias === null ? '.' : ` (${dias} dia(s)).`)
      + (dias !== null && dias <= 30
        ? ' Renove em tempo — quando ele vence, para tudo de uma vez, para todos os clientes.'
        : ' Atenção: a renovação precisa ser feita nos DOIS cofres.'),
    exigeAcao: dias !== null && dias <= 30,
    cfiValidoAte: doCfiCert.validoAte || null,
    cfiFingerprintCurto: String(doCfiCert.fingerprint).slice(0, 16),
  };
}

module.exports = { conferirCertificado };
