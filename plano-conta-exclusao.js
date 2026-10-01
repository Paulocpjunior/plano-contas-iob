'use strict';
const { colecaoContas, publicarContas } = require('./planos-versionados');
const erro = mensagem => Object.assign(new Error(mensagem), { status: 409 });
const normalizar = v => String(v ?? '').trim().replace(/^0+(?=\d)/, '');
function referencias(valor, aliases) {
  if (!valor || typeof valor !== 'object') return false;
  return Object.entries(valor).some(([chave, item]) => {
    // Cached account catalogs are not accounting use; account references outside them are checked.
    if (/^(planoContas|contasPlano|planosDisponiveis)$/i.test(chave)) return false;
    if (aliases.has(normalizar(chave))) return true;
    if (item && typeof item === 'object') return referencias(item, aliases);
    if (typeof item === 'string' && /^[\[{]/.test(item.trim()) && /json|state|dados|config/i.test(chave)) {
      try { if (referencias(JSON.parse(item), aliases)) return true; } catch (_) { throw erro('Há dados armazenados que não puderam ser conferidos. Nenhuma conta foi excluída.'); }
    }
    return /conta|account|reduz|codigo|^cod$|debito|credito/i.test(chave) && aliases.has(normalizar(item));
  });
}
function validarEstrutura(contas, alvo) {
  if (!alvo) throw Object.assign(new Error('Conta não encontrada. Atualize a consulta.'), {status:404});
  const cod = alvo.cod || alvo.codigo;
  const base = String(cod).replace(/(?:\.0+)+$/, '');
  if (contas.some(c => c !== alvo && (String(c.cod || c.codigo).startsWith(cod + '.') || (alvo.analitica === false && String(c.cod || c.codigo).startsWith(base + '.')))))
    throw erro('A conta possui contas subordinadas. Exclua primeiro as contas subordinadas sem uso.');
  if (contas.length <= 1) throw erro('Não é permitido excluir a última conta do plano.');
}
module.exports = function registrar(app, db, adminRequired, carregarSessao) {
  app.delete('/api/planos/:id/contas/:contaId', adminRequired, async (req,res) => {
    try {
      const ref = db.collection('planos').doc(req.params.id), plano = await ref.get();
      if (!plano.exists) return res.status(404).json({erro:'Plano não encontrado'});
      if (plano.data().ativo === false) throw erro('Restaure o plano antes de alterar suas contas.');
      const snapshot = await colecaoContas(ref, plano.data()).get();
      const contas = snapshot.docs.map(d=>({...d.data(), _id:d.id}));
      const alvo = contas.find(c=>c._id === req.params.contaId);
      validarEstrutura(contas, alvo);
      if (req.body?.codigo !== alvo.cod || req.body?.descricao !== alvo.desc) throw erro('A conta mudou. Atualize a consulta antes de excluir.');
      const aliases = new Set([alvo.cod, alvo.reduzido, alvo.ref_rfb].filter(v=>v!=null && String(v).trim()).map(normalizar));
      const consultas = [], leituras = [];
      let total = 0;
      async function consultar(query) {
        query = query.limit(4001);
        const snap = await query.get();
        total += snap.size;
        if(total > 4000) throw erro('A conferência excedeu o limite seguro. Nenhuma conta foi excluída; solicite revisão administrativa.');
        consultas.push({query, docs:snap.docs});return snap;
      }
      const empresas = await consultar(db.collection('empresas').where('plano_id','==',req.params.id));
      async function verificarDocumento(doc, origem) {
        const dados=doc.data();
        if(referencias(dados,aliases)) throw erro('Conta em uso: '+origem+'. Nenhuma alteração realizada.');
        if ('state_json' in dados || 'state_payload' in dados || dados.state_chunked) {
          const sessao=await carregarSessao(doc.ref);
          leituras.push(sessao.doc);
          if(sessao.dados?.session_write_lock) throw erro('Há uma sessão em atualização. Tente novamente após concluir a gravação.');
          if(!sessao.stateJson) throw erro('Não foi possível conferir uma sessão armazenada. Nenhuma conta foi excluída.');
          if(referencias(JSON.parse(sessao.stateJson),aliases)) throw erro('Conta em uso em lançamentos ou configurações: '+origem+'.');
        }
        const colecoes = new Map((await doc.ref.listCollections()).map(c=>[c.id,c]));
        if(doc.ref.parent?.id === 'empresas') for(const nome of ['sessoes','periodos_contabeis','transportes_saldos','importacoes','relatorios']) colecoes.set(nome,doc.ref.collection(nome));
        for (const col of colecoes.values()) {
          if(col.id === 'chunks') continue; // Verified and decoded through the session loader above.
          const snap=await consultar(col);
          for(const child of snap.docs) await verificarDocumento(child,origem);
        }
      }
      for(const emp of empresas.docs) {
        await verificarDocumento(emp, emp.data().razao_social || emp.id);
        for(const nome of ['aprendizado','folha_mapeamentos','folha_importacoes','logs_validacao']) {
          const snap=await consultar(db.collection(nome).where('cnpj','==',emp.id));
          for(const doc of snap.docs) if(referencias(doc.data(),aliases)) throw erro('Conta possui vínculo em '+nome+' da empresa '+emp.id+'.');
        }
      }
      const result=await publicarContas(db,ref,contas.filter(c=>c!==alvo),req.user,plano,async tx=>{
        for(const {query,docs} of consultas) {
          const agora=await tx.get(query);
          const anteriores=new Map(docs.map(d=>[d.id,d]));
          if(agora.size!==docs.length || agora.docs.some(d=>!anteriores.get(d.id)?.updateTime.isEqual(d.updateTime))) throw erro('Os dados mudaram durante a conferência. Atualize e tente novamente.');
        }
        for(const doc of leituras) {
          const atual=await tx.get(doc.ref);
          if(!atual.exists || !atual.updateTime.isEqual(doc.updateTime)) throw erro('A sessão mudou durante a conferência. Tente novamente.');
        }
      },{acao:'excluir_conta',conta:alvo.cod,descricao:alvo.desc});
      res.json({...result,conta_excluida:alvo.cod});
    } catch(e) { res.status(e.status||500).json({erro:e.message}); }
  });
};
module.exports.referencias=referencias;
module.exports.validarEstrutura=validarEstrutura;
