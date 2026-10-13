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
