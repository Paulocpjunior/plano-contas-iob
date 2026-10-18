# CRM/Topologia — operação e homologação de 17/10/2026

## Escopo confirmado

Paulo autorizou os itens 1 a 5 e alterou a estratégia documental: **não trazer mais anexos do Jotform; criar os modais; manter o Jotform vivo para consultas**. As cópias já existentes são preservadas. Upload de binários e recuperação dos dois arquivos indisponíveis deixam de ser bloqueadores desta etapa. Checklist permanece integrado. Não haverá exclusão/desligamento do Jotform nesta entrega.

## Entregas

1. **Documentos:** cadastro de referência HTTPS, categoria, período, motivo, atualização e histórico por versão dentro do dossiê. Nenhum download externo automático, cópia ou envio é realizado. O histórico guarda metadados e links, não versões do conteúdo externo. Os arquivos já copiados continuam acessíveis pelo CCI. Leituras paginadas, perfil atual, carteira, revisão transacional e isolamento por empresa valem também para o histórico.
2. **Topologia:** regimes presentes na carteira de cada colaborador são calculados pelas empresas; uma pessoa pode atender regimes diferentes. A vigência mostrada é o contrato canônico do CRM. Não há novo cadastro de responsabilidade paralelo. Obrigações, prazos e executores continuam nas rotas de planejamento existentes; transferir carteira preserva os executores de demandas em andamento.
3. **Checklist:** filtros por empresa/número/CNPJ e pendências, contagem visível, orientações por tipo de divergência. Não aprova eventos automaticamente nem converte ausência em zero/dispensa. Correções contratuais continuam nos modais nativos com motivo; eventos múltiplos e inconsistentes exigem conferência administrativa.
4. **Permissões:** testes de documento/histórico, acesso externo, revisão, paginação e revogação; ensaio adicional com cadastros reais restaurados em emulador. Administrador acessa, colaborador vê sua carteira, empresa externa bloqueada e revogação bloqueia controles/parâmetros/referências. Não foi utilizado login real do colaborador em navegador.
5. **Recuperação:** snapshot transacional somente leitura e restauração integral em emulador Firestore exclusivo: 14.543 documentos, comparação de todos por leitura de retorno e hash. Inclui cadastros/autorização, registros CRM, histórico e metadados documentais; sem lançamentos contábeis e binários. Produção não alterada. Não equivale a ensaio de recuperação de infraestrutura Cloud Run/IAM/Storage em outro projeto.

## Evidência de recuperação

Projeto local: `demo-crm-restauracao-20261017`, endpoint `127.0.0.1:8796`.
SHA-256 do conjunto: `dd880892b39adc8474ffe6a185edb03143728970cfc63e53e88b4022fae886ff`.
Arquivos privados: `cci-crm-homologacao-20261017/snapshot.json`, `restauracao-relatorio.json`, `permissoes-isoladas.json`, fora do Git e dos assets.

Ferramenta `scripts/ensaiar-restauracao-crm.js`: restauração bloqueada fora de loopback/projeto `demo-crm-restauracao-*`, destino deve estar vazio; não sobrescreve arquivos de evidência. Tipos Firestore preservados; tipos não suportados falham explicitamente. Teste registrado no CI.

## Conferências que ainda exigem decisão operacional

- Definir responsável e vigências corretas quando as fontes divergem.
- Confirmar aplicabilidade e prazos antes de gerar obrigações reais. Ausência de controles no piloto não permite inventar calendário.
- Testar o fluxo com sessão real de colaborador: a homologação isolada não é prova de autenticação no navegador.
- As oito automações enumeradas na matriz anterior permanecem para construção posterior, sem disparos nesta entrega.

As decisões de dados não impedem usar os modais, mas impedem declarar todas as empresas e obrigações homologadas.
