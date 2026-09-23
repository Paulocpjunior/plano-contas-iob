const express = require('express');
const { validarProprietarios, digits } = require('./reinf/reinf-alugueis-planilha');
module.exports = function registrarAlugueis(app, { db, checarAcessoEmpresa }) {
  const router = express.Router();
  router.use('/:cnpj', async (req,res,next) => {
    try {
      const cnpj=digits(req.params.cnpj);
      if(!/^\d{14}$/.test(cnpj)) return res.status(400).json({erro:'CNPJ inválido.'});
      const acesso=await checarAcessoEmpresa(cnpj,req.user);
      if(!acesso.ok) return res.status(acesso.status).json({erro:acesso.erro});
      req.alugueisRef=db.collection('empresas').doc(cnpj);
      next();
    } catch(e) {res.status(500).json({erro:'Não foi possível acessar o cadastro de aluguéis.'});}
  });
  router.get('/:cnpj', async(req,res)=>{
    try {const s=await req.alugueisRef.get();res.json({ok:true,perfil:s.data().reinfAlugueisPlanilha||null});}
    catch(e){res.status(500).json({erro:'Não foi possível carregar o perfil.'});}
  });
  router.put('/:cnpj', async(req,res)=>{
    if(req.user?.is_admin!==true) return res.status(403).json({erro:'Somente administrador pode parametrizar os proprietários.'});
    try {
      const ps=req.body.proprietarios;
      validarProprietarios(ps,false);
      const proprietarios=ps.map(p=>({nome:String(p.nome).trim().slice(0,150),cpf:digits(p.cpf),percentual:Number(p.percentual)}));
      if(proprietarios.some(p=>p.cpf&&!require('./reinf/reinf-alugueis-planilha').documentoValido(p.cpf,11))) throw Error('CPF inválido no cadastro de proprietários.');
      const perfil={versao:1,proprietarios,atualizadoEm:new Date().toISOString(),atualizadoPor:req.user.uid};
      await req.alugueisRef.update({reinfAlugueisPlanilha:perfil});res.json({ok:true});
    }catch(e){res.status(400).json({erro:e.message});}
  });
  app.use('/api/reinf/alugueis-planilha',router);
};
