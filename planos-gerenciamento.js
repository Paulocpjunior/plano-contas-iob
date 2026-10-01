'use strict';
module.exports=function registrarGerenciamentoPlanos(app,db,adminRequired,listarEmpresasAcessiveis){
  app.get('/api/planos/gerenciamento',async(req,res)=>{
    try{
      const [snap,empresas]=await Promise.all([db.collection('planos').get(),listarEmpresasAcessiveis(req.user)]);
      const vinculos=new Map();empresas.forEach(doc=>{const e=doc.data();if(!vinculos.has(e.plano_id))vinculos.set(e.plano_id,[]);vinculos.get(e.plano_id).push({cnpj:e.cnpj||doc.id,nome:e.razao_social||doc.id});});
      res.json(snap.docs.filter(d=>req.user.is_admin||vinculos.has(d.id)).map(d=>{const p=d.data();return {id:d.id,nome:p.nome||d.id,codigo:p.codigo||'',ativo:p.ativo!==false,empresas:vinculos.get(d.id)||[]};}));
    }catch(e){res.status(500).json({erro:e.message});}
  });
  async function alterar(req,res,ativo){
    try{
      const ref=db.collection('planos').doc(req.params.id);
      await db.runTransaction(async tx=>{
        const plano=await tx.get(ref);if(!plano.exists)throw Object.assign(Error('Plano não encontrado'),{status:404});
        if(!ativo){const empresas=await tx.get(db.collection('empresas').where('plano_id','==',req.params.id).limit(1));if(!empresas.empty)throw Object.assign(Error('Plano em uso. Vincule outro plano às empresas que o utilizam antes de arquivar.'),{status:409});}
        tx.set(ref,{ativo,arquivado_em:ativo?null:new Date(),alterado_em:new Date(),alterado_por_uid:req.user.uid},{merge:true});
        tx.set(ref.collection('historico_gerenciamento').doc(),{acao:ativo?'restaurado':'arquivado',em:new Date(),uid:req.user.uid});
      });
      res.json({ok:true,id:ref.id,ativo});
    }catch(e){res.status(e.status||500).json({erro:e.message});}
  }
  app.delete('/api/planos/:id',adminRequired,(req,res)=>alterar(req,res,false));
  app.post('/api/planos/:id/restaurar',adminRequired,(req,res)=>alterar(req,res,true));
};
