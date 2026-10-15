'use strict';
const { analisar, respostaLocal } = require('./cia-contabil');
const { validarPeriodo } = require('./admin-exclusao-lancamentos');
const { textoBaseAjuda } = require('./ajuda-cci-base');

function criarHandler({ db, checarAcessoEmpresa, carregarSessaoAtualPorRef, gerarResposta }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user || !req.user.uid) return res.status(401).json({ erro: 'Entre no CCI para consultar a CiA.' });
    const body = req.body || {};
    const cnpj = String(body.cnpj || '').replace(/\D/g, '');
    const pergunta = typeof body.pergunta === 'string' ? body.pergunta.trim() : '';
    if (cnpj.length !== 14 || pergunta.length < 3 || pergunta.length > 1500) return res.status(400).json({ erro: 'Selecione a empresa e escreva uma pergunta entre 3 e 1500 caracteres.' });
    let periodo;
    try { periodo = validarPeriodo(body.inicio, body.fim); }
    catch (_) { return res.status(400).json({ erro: 'Informe um período válido, com início anterior ou igual ao fim.' }); }
    try {
      const acesso = await checarAcessoEmpresa(cnpj, req.user);
      if (!acesso.ok) return res.status(acesso.status).json({ erro: acesso.erro });
      const sessao = await carregarSessaoAtualPorRef(db.collection('empresas').doc(cnpj).collection('sessoes').doc('current'));
      if (!sessao.encontrada || !sessao.stateJson) return res.status(404).json({ erro: 'Ainda não há sessão salva online para esta empresa. A CiA não pode inferir seus lançamentos.' });
      const analise = analisar(JSON.parse(sessao.stateJson), periodo.inicio, periodo.fim);
      let resposta = respostaLocal(analise);
      let modo = 'conferencia';
      if (gerarResposta) {
        let timer;
        try {
          const texto = await Promise.race([
            gerarResposta({ pergunta, analise, base: textoBaseAjuda() }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 25000); })
          ]);
          if (typeof texto === 'string' && texto.trim()) { resposta = texto.trim().slice(0, 6000); modo = 'ia'; }
        } catch (_) { /* A conferência verificável permanece disponível se a IA falhar. */ }
        finally { clearTimeout(timer); }
      }
      // Revalidar a carteira após a leitura e eventual espera pelo provedor.
      const atual = await checarAcessoEmpresa(cnpj, req.user);
      if (!atual.ok) return res.status(atual.status).json({ erro: atual.erro });
      return res.json({ resposta, modo, analise, empresa: { cnpj, nome: atual.empresa.razao_social || atual.empresa.nome || cnpj }, fonte: 'Sessão de lançamentos salva online', consultadoEm: new Date().toISOString() });
    } catch (_) {
      return res.status(503).json({ erro: 'Não foi possível ler a sessão contábil com segurança. Tente novamente; nenhum lançamento foi alterado.' });
    }
  };
}
module.exports = { criarHandler };
