# Carteira e obrigações — desenho e primeira etapa

Data: 13/10/2026. Base: main d9e8e1ba1c1778ff8e579df57298f2f21ea97baa, versão 3.4.385, conferida com /api/version, /version.json e HTML publicado antes das alterações. Implementação local; sem migração, publicação ou mudança de dados reais.

## Decisão

O CCI será a fonte dos controles operacionais. O Checklist continuará como origem dos eventos contratuais. Cadastro da empresa é reaproveitado; os períodos de responsabilidade serão independentes do início da escrituração no CCI. Sem associação por semelhança de nomes. Ausência de dados não implica conclusão, dispensa ou saída.

## Fontes e limites

- [CRM CONTROLE_CONTABIL_2026_V2](https://form.jotform.com/260402658948061): metadados consultados informaram 57 campos e 965 submissões. Submissões não equivalem a empresas únicas. A contagem inclui elementos de apresentação.
- [Check List Atual 2026](https://form.jotform.com/210135417457653): metadados informaram 26 campos e 1.427 submissões. IDs e tipos dos campos contratuais foram conferidos na estrutura do formulário.
- A tabela compartilhada no Teams exigiu autenticação. Fórmulas, visualizações, automações, permissões, anexos efetivos e integrações exclusivas do Tables não foram integralmente inventariados. A paridade completa permanece pendente.
- Código: carteira-contabil.js, empresa-plano-vinculo.js, acompanhamento-contabil.js, progressao-contabil.js e cadastro existente. O leitor do Financeiro foi usado como referência para leitura completa; ele não mapeava as datas de responsabilidade 30/40.

## Matriz de equivalência dos 57 campos informados

| Campos da origem | Destino previsto | Situação nesta etapa |
|---|---|---|
| CONTROLE_CONTABIL_2026_V2; Enviar | Título e ação de formulário | Elementos de apresentação; não migrar como dados |
| N°; CNPJ; EMPRESAS; RAZÃO SOCIAL | Cadastro CCI e tabela de correspondência dos IDs de origem | Cadastro existente; reconciliação da origem pendente |
| Status da Empresa; Atividade; Tributação | Cadastro com vigência e dicionário de valores | Não importar automaticamente |
| Colaborador | Responsável principal e apoios por UID | Distribuição administrativa com revisão e auditoria implementada |
| Avaliação; CLASSIFICAÇÃO | Campos distintos de avaliação e classificação | Definição do significado e migração pendentes |
| Contato; Telefone de Contato; E-mail de Contato da Empresa; Endereço da Empresa | Cadastro existente | Conferir correspondência e conflitos antes da carga |
| Observações | Observações da empresa e histórico de interações | Migração pendente; observações dos controles disponíveis |
| REGIONAL; Regional; GRUPO; FUSÃO | Classificações e relações cadastrais | Resolver duplicidade das regionais e semântica de fusão |
| DECLARAÇÕES OBRIGATÓRIAS | Catálogo e aplicabilidade por vigência | Catálogo inicial; aplicabilidade confirmada manualmente por admin |
| PARTICULARIDADES | Requisitos especiais da empresa | Pendente |
| DOCUMENTAÇÃO; LINK'S DOCUMENTAÇÃO | Documentos da empresa e evidências com autorização | Link/protocolo em controles; migração e armazenamento de anexos pendentes |
| IR-ALUGUEL-REINF | Aplicabilidade e acompanhamento de aluguéis | Tipo de controle mensal disponível; integração com eventos Reinf pendente |
| SOLICITAÇÃO DE DOCUMENTOS | Controle por competência | Criação e acompanhamento manual disponíveis |
| IMPORTAÇÃO FOLHA; IMPORTAÇÃO FISCAL; CONTABILIZADO FINANCEIRO; EMPRESA CONCILIADA | Controles mensais e eventos comprovados de execução | Controles manuais disponíveis; ligação automática ao processamento pendente |
| CHECK ECD 2026; CHECK ECF 2026; CHECK DEFIS 2026; CHECK DIMOB 2026 | Obrigações por exercício de referência | Controles manuais com evidência e histórico disponíveis |
| DATA ENTREGA BALANÇO | Controle de entrega e comprovante | Tipo mensal disponível; não confundir geração com entrega |
| CONTROLE DIVIDENDOS REINF 2026 | Agrupamento de apresentação | Não migrar como valor |
| REGISTRO ATA; SALDO JANEIRO 2026; SÓCIO QUANTIDADE; SALDO RESIDUAL; VALOR DISTRIBUÍDO MENSAL | Registros de dividendos e saldos do módulo Reinf | Mapeamento individual, valores e origem pendentes; não recalcular nesta etapa |
| DISTRIBUIÇÃO DIVIDENDOS 2026; REINF INFORMADA 2026; STATUS REINF DIVIDENDOS; OBSERVAÇÕES DIVIDENDOS | Dividendos por competência, transmissão e observações | Acompanhamento manual Reinf disponível; integração e migração pendentes |
| ÚLTIMA COMPETÊNCIA FECHADA; DATA CONCLUSÃO CONTABILIZAÇÃO | Fechamento oficial existente e acompanhamento | Não sobrescrever períodos fechados a partir do CRM |
| PRAZO LIMITE ECD; PRAZO LIMITE ECF; PRAZO LIMITE DEFIS | Prazo em cada controle, configurado por administrador | Disponível; sem prazos legais presumidos |
| Check List Importado | ID de submissão, assinatura e versão da origem | Prévia de leitura; persistência/aplicação pendentes |
| MESES CONCILIADOS; % CONCLUSÃO MENSAL; MESES FISCAL IMPORTADO; MESES FOLHA IMPORTADA | Indicadores calculados com denominador explícito | Percentual de controles exigíveis carregados; indicadores de execução pendentes |
| Insira uma pergunta aqui | Campo a identificar | Preservar no arquivo de origem; não atribuir significado |

Catálogo inicial: documentos, folha, fiscal, financeiro, conciliação, balanço, Reinf aluguéis/dividendos; ECD, ECF, DEFIS, DIMOB, DITR, IBGE, DIMED, E-Financeira, DECRED e ITR. Inclusão no catálogo não é parecer de obrigatoriedade. O administrador confirma aplicabilidade, exercício e prazo. Processo usa código e título próprios e competência mensal.

## Autorização e transição

| Operação | Admin CCI | Colaborador |
|---|---|---|
| Listar carteira | Todas as empresas, paginadas | Somente responsável/apoio por UID |
| Ler controles e histórico | Todas | Somente empresas da carteira |
| Distribuir carteira | Sim, com motivo e versão vigente | Não |
| Criar controle/processo e mudar prazo | Sim | Não |
| Atualizar andamento | Sim | Carteira + permissão editar |
| Concluir | Sim, com evidência | Carteira + editar + fechar, com evidência |
| Marcar não aplicável / reabrir | Sim, com justificativa | Não |
| Conferir Checklist | Sim, leitura sem gravação | Não |
| Excluir controles/histórico | Não há operação nesta etapa | Não |

A consulta usa carteira_uids como índice, mas confere responsaveis por UID antes de devolver uma empresa. Índice desatualizado não concede acesso. owner_uid, vinculado_por_uid, acesso_uids e comparação de e-mail não concedem acesso ao CRM. O perfil do usuário é relido no servidor e, nas gravações, dentro da mesma transação da empresa e do controle. Histórico e alteração são atômicos. Revisão antiga retorna 409.

**Limite importante:** os módulos antigos ainda usam as regras anteriores. O novo CRM não resolve sozinho o isolamento global do CCI. Antes de mudar essas regras, produzir relatório de acessos legados versus carteira, obter revisão administrativa das divergências e testar todos os endpoints, exportações, arquivos, caches e integrações. Não remover vínculos históricos silenciosamente.

A nova distribuição atualiza responsaveis/carteira_uids existentes, portanto também pode conceder acesso em módulos antigos que já respeitam a carteira. A interface deixa claro o escopo de revogação. Nesta execução nenhuma distribuição real foi feita.

## Persistência e concorrência

- empresas/{cnpj}: cadastro e equipe existentes. Alteração de equipe registra antes/depois, motivo e autor em auditoria_contabil; fingerprint detecta mudança até por rotas antigas.
- empresas/{cnpj}/crm_controles/{categoria_codigo_periodo}: obrigação/processo, prazo, situação, evidência, protocolo, revisão, autores e datas.
- .../historico/{id}: antes/depois integral, revisão, ação, autor e horário do servidor.
- Chave determinística e create transacional impedem criar o mesmo controle duas vezes para o período. Processos diferentes usam códigos distintos.
- Concluída e não aplicável são terminais. Só admin reabre para pendente, com justificativa. Evidência anterior permanece no histórico.
- A conclusão registra informação fornecida pelo usuário; não autentica o conteúdo de um recibo nem transmite declarações. Links HTTPS não são buscados pelo servidor.
- Listagem de empresas (50), controles (100) e histórico (50) usa cursor e indica páginas adicionais. Não apresenta resumo parcial como total global.

## Checklist: o que a prévia faz

Credencial de servidor: CCI_CHECKLIST_API_KEY, configurada via segredo no ambiente de implantação. Nunca deve ir ao navegador, repositório, log ou URL. Não foi configurada nem utilizada nesta etapa.

| ID | Campo | Tratamento |
|---|---|---|
| 24 | EMPRESA NOME | Rótulo para conferência; não é chave de associação |
| 33 | Nosso Número | Correspondência exata com código interno normalizado; preserva original |
| 47 | Status Clientes | Seleciona entrada, saída, alteração, suspensão ou baixa; desconhecido fica pendente |
| 11 | DATA CADASTRO ESCRITÓRIO | Separada das datas de responsabilidade |
| 30 | Responsável a partir de | Início contratual; não usar data de cadastro como substituto |
| 40 | Responsável até | Fim contratual; saída sem esta data fica pendente |
| 5 | OBSERVAÇÃO | Texto para revisão, sem executar HTML |

Duas leituras paginadas são comparadas com contagens, identidade dos registros, conteúdo e esquema. Alteração durante a leitura, duplicidade, fonte indisponível ou truncamento bloqueiam a prévia completa. Prazo total de 90 segundos, limite de 10 mil registros. Campos são reconhecidos pelo ID e rótulo para detectar mudanças do formulário.

Empresa nova sem código correspondente, código ambíguo, múltiplos eventos, período invertido, registro não ativo ou status desconhecido são sinalizados. Todos os eventos têm aplicacao_automatica=false. Não há rota para aplicar, cadastrar empresa, apagar registros ou gerar obrigações a partir do Checklist nesta etapa.

Próxima integração: mapear serviços contratados, tributação e suas vigências, documentos, assinatura, datas duplicadas de saída/alteração/suspensão/baixa; armazenar eventos de origem imutáveis; introduzir aprovação com comparação antes/depois, idempotência e revalidação da assinatura; usar checkpoint incremental com recuperação. Antes disso a prévia não é uma sincronização operacional.

## Critérios de migração e publicação

1. Completar inventário autenticado de Tables e dicionário de campos/valores. Confirmar que o campo de razão social não contém valores múltiplos indevidos antes de qualquer importação.
2. Exportar origem completa, anexos e metadados; registrar checksum, contagens e snapshot de destino. Executar restauração em ambiente isolado.
3. Conciliar por Nosso Número/CNPJ/código, preservar cada submission ID e tratar duplicidades por revisão humana. Não converter marcação antiga em recibo comprovado.
4. Confirmar períodos de responsabilidade e obrigações remanescentes após saída. Separar cadastro, contrato, início de escrituração e prazo de entrega. Retorno cria novo período; não apaga anterior.
5. Simular carga com resumo por campo, empresa, competência, situação, valores e arquivos. Comparar antes/depois e obter decisão sobre divergências.
6. Pilotar empresa ativa, recém-chegada, transferida, saída com pendências, matriz/filial, principal/apoio e usuário consulta. Testar URL direta, exportação, arquivo, troca de carteira, revogação durante gravação e concorrência.
7. Integrar eventos de processamento só quando a evidência comprovar a etapa completa. Não deduzir competência completa de um lote parcial.
8. Definir corte, fonte de escrita e rollback. Após reconciliar o delta, deixar CRM anterior em consulta e CCI como fonte operacional; manter Checklist como origem contratual. Rollback não pode perder alterações feitas no CCI após o corte.
9. Publicar somente após autorização, quality gates e validação da versão, endpoints e fluxo autenticado no ambiente de destino.

## Validação desta etapa

Testes de domínio, rotas e leitor são registrados em npm run test:crm-contabil, npm run check e check:ci. Cobrem autorização por UID, acessos legados negados no CRM, perfil atual, revogação, conclusão, reabertura, históricos atômicos, duplicidade, concorrência e páginas. Integração de UI é verificada localmente com dados fictícios. Resultados e limitações da execução estão no relatório de validação ao lado deste documento.

## Etapa local de 14/10/2026 — filtros e navegação do dossiê

Branch `codex/crm-filtros-dossie`, baseada no `origin/main` f2dd52c (3.4.390). As alterações visuais mencionadas no handoff não estavam no checkout limpo; esta etapa reconstrói os recursos abaixo. Sem commit, push ou deploy.

- Busca, equipe (UID), origem do cadastro e situação confirmada do cliente são combinados no servidor, após autorização e antes da paginação. As equipes retornadas pertencem apenas às empresas acessíveis. O cadastro contábil prevalece sobre o dossiê com mesmo CNPJ.
- Visualizações pessoais: até 20 nomes, atualização pelo mesmo nome, revisão transacional contra sobrescrita concorrente. GET/PUT `/api/crm/visualizacoes`, persistência em `users/{uid autenticado}/crm_preferencias/visualizacoes`. O UID do corpo não define o proprietário. Filtros salvos nunca concedem acesso.
- Dossiê com navegação para controles, parâmetros, links de documentos e orientação para consultar o histórico por registro. A equipe continua administrada exclusivamente pelo administrador. Ainda não há uma linha do tempo unificada da empresa.
- `crm_situacao_cliente`: ativa, suspensa, saida, baixada ou nao_informada. Não é deduzida de `ativo`, encerramento contábil ou texto legado. Falta conciliar/preencher esse campo com histórico antes de a situação contratual funcionar sobre toda a base real. Os campos originais continuam disponíveis nos parâmetros.
- Situação da obrigação permanece independente do prazo: concluída/não aplicável aparece como encerrado; falta de prazo não vira atraso. O filtro de período/situação/prazo age nos controles carregados da empresa selecionada, não seleciona empresas por pendência global. Resumos de páginas incompletas são explicitamente parciais.
- Cores com rótulos textuais, progresso, foco visível, estado de carregamento, botões de 44 px, cartões em celular e respeito à redução de movimento. Tema escuro usa os tokens existentes.

### Decisões técnicas e pendências

Manter Cloud Run e Firestore. A consulta unificada de carteira ainda lê as duas coleções completas no servidor; a paginação da resposta não elimina esse custo. Próxima otimização: índice materializado de carteira/atributos consultáveis, atualizado transacionalmente ou por processo idempotente, mantendo a autorização fresca. Não alterar o fluxo leve de ativação de empresa da 3.4.390.

Tabulator foi avaliado, mas não adicionado nesta etapa. A tabela nativa paginada atende a seleção e os cartões no celular sem uma nova dependência. Avaliar adoção quando forem necessários agrupamentos, reorganização/ocultação de colunas e grandes grades; fixar versão e validar teclado, leitores de tela e celular. Referência: [acessibilidade do Tabulator 6.x](https://www.tabulator.info/docs/6.x/accessibility/).

Anexos: bucket privado no Cloud Storage, manifesto de origem, tamanho, MIME e hash, contagem conciliada, repetição segura e download autorizado pela carteira atual. URLs assinadas dão acesso a quem as possui enquanto válidas; preferir autorização no backend ou expiração curta após a verificação. Nenhum bucket/arquivo foi criado/copiado nesta etapa. Referência: [Cloud Storage — signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls).

Automações: Scheduler para disparos periódicos e Tasks para trabalho individual com controle de taxa/repetição. Cada evento precisa de identidade estável, consumo idempotente, histórico de execução e reconciliação. Repetir um evento não pode duplicar empresa, obrigação ou baixa. Nenhuma fila/job foi provisionada. Referência: [Tasks e Scheduler](https://docs.cloud.google.com/tasks/docs/comp-tasks-sched).

### Validação desta etapa

`npm run check:ci`: 250 passaram, 3 pulados por ausência de evidência local, nenhuma falha. Navegador com API fictícia: abrir dossiê, distinguir atraso de conclusão, salvar/limpar/restaurar visualização, abrir seção de documentos; tema escuro e viewport de 390 px sem transbordamento horizontal. Nenhuma gravação de produção. Isso não comprova equivalência da base real nem substitui homologação autenticada após eventual publicação. O gate local completo continua pendente dos arquivos externos de evidência; nenhum parser foi alterado.

## Área de trabalho — 14/10/2026, v3.4.392

A interface usa toda a área disponível com navegação própria, mantendo o isolamento nativo do dialog e o retorno ao CCI. Carteira, demandas, gestão administrativa e dossiê ficam em painéis separados. A carteira mantém filtros e posição ao abrir/voltar de um dossiê, permite ocultar CNPJ/equipe/situação durante a sessão e recolher filtros. Na 3.4.392, as colunas eram restritas à sessão; a 3.4.398 passa a persistir essa escolha nas visualizações pessoais. A gestão concentra conferência, Checklist e atalho para empresas sem equipe. Não há indicadores fictícios de produtividade.

`GET /api/crm/trabalho` consulta apenas carteiras autorizadas, em lotes de dez empresas; retorna no máximo cem controles por empresa e indica empresas truncadas. A autorização é revalidada depois da leitura dos controles. O cursor percorre empresas por CNPJ. A tela informa empresas consultadas versus total e permite continuar; os filtros operacionais incidem no conjunto carregado. Responsáveis exibidos são os da empresa, não uma atribuição individual presumida para a tarefa. Nenhuma baixa acontece nessa consulta. O índice materializado e a distribuição individual de demandas continuam como evolução posterior.

Causa do defeito de contraste: `--surface2` não existe no tema real; o fallback claro combinava com texto claro. Substituído por `--bg-dark`, presente nos dois temas. QA usa os estilos completos extraídos do index e tema-apple.css, com API fictícia. Confirmados filtros salvos, retorno ao dossiê, ocultação de colunas, demandas, tema claro/escuro e largura de 390 px sem transbordamento. CI local: 250 aprovados, 3 pulados por arquivos externos ausentes, zero falhas.

Conferência somente de leitura em produção: os três registros genéricos terminados em 01, 02 e 03 não possuem registros importados de Jotform na seção de parâmetros. Não foram encontrados no código atual. A origem de criação permanece não comprovada; nenhum registro foi excluído, arquivado ou reclassificado.

## Planejamento operacional — 14/10/2026, v3.4.393

Calendário mensal/semanal distingue início previsto, prazo interno e vencimento. Consulta todas as empresas autorizadas, independentemente da página aberta, com limite explícito de 2.000 demandas exibidas e janela máxima de 92 dias. A agregação ainda lê controles por empresa em lotes de dez; um índice materializado permanece necessário para reduzir leituras e latência na expansão da base.

Administradores definem executor e revisor da equipe vigente, prioridade, horas estimadas e até vinte dependências da mesma empresa. Ciclos e datas invertidas são bloqueados. Conclusão exige dependências concluídas/não aplicáveis e o revisor indicado (ou administrador), além da evidência e permissão já existentes. Revisor fora da carteira não ganha acesso por estar indicado. O planejamento não limita a edição cotidiana apenas ao executor: continuam valendo as permissões da equipe autorizada.

Carga semanal é agregada sobre toda a carteira; a estimativa integral pertence à semana do prazo interno, ou vencimento se não houver prazo interno. Disponibilidade é distribuída de segunda a sexta e reduzida pelas ausências cadastradas. Sem estimativa, sem executor e capacidade não cadastrada são sinais distintos; o total sem executor refere-se a toda a carteira aberta. Horas não são medições de produtividade nem incluem ajustes automáticos de feriados.

Distribuição em lote: até trinta empresas por transação; confere revisão de cada carteira e mantém antigos responsáveis como apoios. Apoio temporário concede acesso apenas ao CRM dentro das datas inclusivas, pode ser cancelado antecipadamente e preserva histórico e vínculos permanentes. Não amplia permissões dos outros módulos. Capacidades, contrato, regras, alterações de equipe e planejamento são auditados.

Recorrência: responsabilidade contratual ativa com início confirmado e regra de aplicabilidade/prazo confirmada pelo administrador são obrigatórias. Competências intersectam vigência e responsabilidade; dia inexistente vai ao último dia do mês. Não presume feriados. A regra anual usa mês no ano de referência mais deslocamento. Prévia assinada e revalidação transacional impedem sobrescrita e duplicação de controles existentes. Alterar regra não reprograma controles já criados; saída não os exclui. A geração é acionada e confirmada na tela, não executada por Scheduler.

Pendências de equivalência: execução agendada de regras, reprodução integral de fórmulas/automação Jotform, cópia conciliada de anexos, aplicação incremental do Checklist e homologação dos parâmetros/vigências reais. Nenhuma dessas funções deve ser presumida concluída por esta publicação. Nenhuma carteira, ausência, prazo ou recorrência de produção foi preenchida automaticamente nesta etapa.

Validação: testes de domínio e rotas cobrem ciclos, vigência, prévia concorrente, preservação de existentes, carga com ausências, revisão, dependências e revogação de apoio. Navegador com dados fictícios: calendário, carga, formulário de planejamento e responsabilidade; celular 390 px sem transbordamento e tema escuro. Validação local não comprova a conciliação da origem real.

## Experiência profissional — 14/10/2026, v3.4.394

Meu início substitui a grade como entrada do CRM. Ilustração SVG própria (sem dados reais), ícones consistentes e cores acompanhadas por texto identificam carteira, demandas, calendário e administração. A ativação de empresa do CCI mantém a busca sob demanda e recebe a mesma ilustração; abrir um dossiê não ativa a empresa contábil implicitamente.

GET /api/crm/contexto consulta somente o usuário autenticado e devolve perfil/permissões atuais e catálogo. Abrir o CRM consulta contexto e visualizações pessoais, sem ler empresas ou controles. Carteira, calendário e demandas são carregados ao solicitar. Teste de rota verifica ausência de consultas às coleções de empresas na entrada.

Meu dia filtra executor_uid/revisor_uid do usuário atual; não presume que todo responsável da empresa executa todas as tarefas. Visão da equipe continua limitada às carteiras autorizadas. Contagens só aparecem após consulta e herdam o alcance de /trabalho (dez empresas por lote, até cem controles por empresa). Mostram explicitamente a parcialidade; grupos podem se sobrepor. Não são indicadores globais de produtividade. Implementar índice operacional para totais pessoais completos com baixo custo continua necessário.

QA com dados fictícios confirmou somente contexto/preferências na abertura, um atraso atribuído ao usuário sem incluir demanda não atribuída, navegação até dossiê e retorno com carregamento de carteira. Temas claro/escuro e largura de 390 px conferidos. Ajuste de empilhamento garante conteúdo do banner acima do fundo no tema escuro. Gate local: 251 aprovados, 3 pulados por arquivos externos ausentes, zero falhas; verificações de versão repetidas após atualização para 3.4.394.

## Visualizações pessoais — 3.4.398

CNPJ, equipe e situação do cliente podem ser exibidos ou ocultados e salvos junto dos filtros. Número, empresa e abertura do dossiê permanecem disponíveis. Ao escolher uma visualização, os checkboxes e a tabela são restaurados juntos. Uma visualização legada sem colunas mostra todas; atualizar pela tela antiga preserva a escolha existente. Limpar filtros mantém as colunas escolhidas.

A preferência continua em `users/{uid}/crm_preferencias/visualizacoes`, usando o UID autenticado e revisão transacional. O servidor aceita apenas as três chaves e valores booleanos. A configuração visual não concede acesso nem altera parâmetros, equipe ou obrigações. Testes de domínio e rota cobrem compatibilidade, valores inválidos sem gravação, isolamento e concorrência. Navegador fictício confirmou salvar, fechar/reabrir e restaurar as colunas.
