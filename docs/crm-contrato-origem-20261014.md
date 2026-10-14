# CRM — configuração da origem conferida em 14/10/2026

Esta evidência complementa a exportação das tabelas; não é aceite de equivalência nem autorização para desligar o Jotform. Nenhum campo, condição, integração ou e-mail foi alterado na origem.

## Formulário contábil V2

Formulário `260402658948061`, título CONTROLE_CONTABIL_2026_V2. Conferido no construtor autenticado da máquina remota e no HTML servido do formulário. A limitação do conector foi contornada pela leitura da fonte original: foram encontradas cinco condições e uma configuração de cálculo. HTML e configuração extraída estão no diretório privado da migração, fora dos assets e do Git; SHA-256 do HTML: `8a0802b8da7ef3116ef0b57715bd911fba160d2565ff0ed2516dc88ec43825c4`.

### Opções e condições confirmadas

Status da Empresa: vazio, ATIVA, ENCERRADA, SUSPENSA, EM TRANSFERÊNCIA, BAIXADA. Esses estados legados não são equivalentes automaticamente a obrigação concluída, contrato vigente ou atraso.

Tributação: SIMPLES, SIMPLES-F, PRESUMIDO, ISENTA, MEI, LUCRO REAL, IMUNE, C.C, PRESUMIDO-F, PESSOA FISICA, IMUNE-F, LUCRO REAL-F. Preservar os sufixos; não normalizar eliminando informação.

| Condição da origem | Comportamento da interface original |
|---|---|
| Tributação = SIMPLES, SIMPLES-F ou MEI (qualquer uma) | Mostra CHECK DEFIS 2026 e PRAZO LIMITE DEFIS; esconde checks e prazos de ECD/ECF |
| Tributação = PRESUMIDO, PRESUMIDO-F, LUCRO REAL ou LUCRO REAL-F | Mostra checks e prazos de ECD/ECF; esconde check e prazo de DEFIS |
| Tributação = ISENTA, IMUNE, IMUNE-F, C.C ou PESSOA FISICA | Esconde os seis campos anteriores |
| SALDO JANEIRO 2026 preenchido | Calcula SALDO RESIDUAL pela expressão `{37}` (cópia do campo 37 para o campo 39) |
| SALDO JANEIRO 2026 preenchido | Mostra EMPRESAS, campo 80 |

A fórmula informa duas casas decimais, permite copiar zero, não usa vírgula como separador decimal e não ignora campos ocultos. `clearFieldOnHide=disable`: esconder campo não apaga o valor. Todos os IDs referenciados foram localizados; a leitura inicial de labels não contemplava os labels em `span` e foi corrigida.

Essas são condições de apresentação do formulário, **não regras de dispensa fiscal**. Não gerar `não aplicável`, baixa, prazo ou exclusão com base nelas. A fórmula ainda requer comparação real de resultado e arredondamento, especialmente com vazio, zero, negativo e separador decimal, antes de regravar parâmetros históricos. Fórmulas de colunas do Tables podem existir separadamente; este inventário não as cobre.

### Comunicações e integrações

Na sessão autenticada foram identificados três cartões: Notificação 1, E-mail de Resposta Automática 1 e Notificação 2. As duas notificações apontam para o mesmo destinatário administrativo; a resposta automática usa o campo E-mail de Contato da Empresa. Endereço pessoal e capturas ficam privados. Notificação 1 usa assunto `Re: {form_title}` e corpo com campos do formulário. Não foi enviado e-mail de teste nem salva configuração.

Conferência adicional na sessão autenticada, sem salvar nem enviar:

| Modelo | Novo envio | Edição do envio | Destino | Anexos |
|---|---|---|---|---|
| Notificação 1 | Marcado | Marcado | Destinatário administrativo fixo | Uploads e PDF desativados |
| Resposta Automática 1 | Marcado | Desmarcado | Campo E-mail de Contato da Empresa | Nenhum arquivo fixo exibido; PDF desativado |
| Notificação 2 | Desmarcado | Desmarcado | Mesmo destinatário administrativo | Uploads e PDF desativados |

A Notificação 2 exibe explicitamente que só pode ser enviada manualmente pela tabela. Não ativá-la como automação no CCI. A resposta automática tem assunto `Recebemos sua resposta para {form_title}` e a Notificação 2 usa `Re: {form_title}`. Na resposta automática, o envio adiado está desativado. Nos três modelos, “Atualizar E-mail” e “Ocultar Campos Vazios” estão ativados; o primeiro atualiza o modelo ao editar o formulário, não é um gatilho de envio por edição da submissão. Reply-to das notificações usa o campo de contato da empresa; o da resposta automática é administrativo. Os endereços pessoais e capturas ficam fora do Git.

Ainda é necessário conferir conteúdo integral, remetentes efetivos e entrega antes de reproduzi-los. As telas de remetente da resposta automática e da Notificação 2 mostraram “Choose one”; isso não comprova qual endereço efetivamente envia. Nenhum modelo foi habilitado no CCI, nenhuma fila criada e nenhum e-mail de teste enviado.

A página de integrações exibiu **“Only Form Owner can access this feature”**. É necessária a sessão proprietária para conferir integrações ativas; a galeria não comprova ausência de integrações. A página Workflows mostrou opções de criação, sem lista de fluxos existentes; não equivale a inventário global de automações da conta.

## Checklist

HTML original do formulário `210135417457653` preservado privadamente. Foram encontradas dez condições de apresentação. Não foi encontrado `setCalculations` nesse HTML; isso não exclui cálculos externos ou no Tables.

Os sete IDs e rótulos correspondem ao contrato de `crm-checklist.js`, após normalização de caixa/acentos:

| ID | Campo |
|---|---|
| 24 | EMPRESA NOME |
| 33 | Nosso Número |
| 47 | Status Clientes |
| 11 | DATA CADASTRO ESCRITÓRIO |
| 30 | Responsável a partir de |
| 40 | Responsável até |
| 5 | OBSERVAÇÃO: |

Os estados referenciados nas condições são CLIENTE NOVO, CLIENTE SAIDA, CLIENTE ALTERAÇÃO, CLIENTE SUSPENSO e ENCERRAMENTO CNPJ. O mapeamento de prévia existente contempla esses estados. A credencial `CCI_CHECKLIST_API_KEY` continua ausente no Cloud Run; HTML do formulário não substitui a leitura autenticada e paginada das submissões. Não houve sincronização de empresas, mudança de responsabilidade nem baixa.

## Publicação e próximos testes

A 3.4.396 publicou a ferramenta de reconciliação, não um motor de automações. PR #272, commit `e0cac28fea3d7fe128206ddb25d17e659f30d52c`, workflow 38561585206 concluído; revisão `plano-contas-iob-01154-kay` com 100% de tráfego. API de versão 3.4.396, saúde ok, Firestore conectado e hash do JavaScript servido conferidos. CI remoto: 229 aprovados, 26 pulados, zero falhas; local: 252 aprovados, 3 pulados, zero falhas.

A próxima implementação pode partir deste contrato, mas a homologação integral continua aberta: fórmulas do Tables, comportamento das comunicações, delta atualizado da origem, binários privados, integração Checklist, conta colaboradora restrita e restauração isolada. A restauração de JSON em teste não substitui a restauração do banco completo, subcoleções e arquivos.

## Continuação — opções e apresentação nativas (3.4.397)

`crm-base.js` entrega contrato de apresentação apenas para `contabil_v2` e `contabil_v2_integral`. Situação da Empresa e Tributação usam as opções acima, com validação no servidor, motivo, revisão e histórico existentes. Valor legado desconhecido pode ser preservado; não é convertido automaticamente. Nomes duplicados não recebem seletor presumido. Metadados são calculados na leitura e não gravados nos registros da migração.

As condições de tributação são indicadas junto aos campos, sem ocultar dados históricos, alterar prazos ou dispensar obrigações. Tributação desconhecida, vazia ou ambígua não produz indicação de visibilidade. O seletor recebe foco ao abrir a edição.

A inspeção das duas exportações confirmou uma diferença de abrangência: `SALDO JANEIRO 2026` e `SALDO RESIDUAL` estão em `contabil_v2_integral`, mas não em `contabil_v2`. Portanto, a fórmula da origem não deve ser aplicada à visão resumida nem confundida com os campos de distribuição de dividendos. A cópia calculada ainda não foi ativada: resta conferir comportamento real de vazio, zero, negativo, vírgula e arredondamento e distinguir cálculo do formulário das fórmulas do Tables.

Validação desta continuação: testes de domínio cobrem as 12 tributações, valores desconhecidos, sufixos, nomes duplicados e preservação de originais; testes de rota cobrem validação e ausência de persistência do contrato. Navegador com dados fictícios confirmou seletor e indicação de campo oculto. Nenhum parâmetro real foi alterado para testar.

## Comportamento real do cálculo — teste sem envio em 14/10/2026

Formulário público original aberto em uma aba temporária, com valores fictícios apenas nos campos de saldo; nenhum envio realizado. Leituras do DOM dos inputs 37 e 39 (não do valor float arredondado da árvore de acessibilidade):

| Entrada / ação | Saldo residual observado |
|---|---|
| `12.345` | `12.345` |
| `0` | `0` |
| `-12.345` | `-12.345` |
| `1.005` | `1.005` |
| Apagar entrada após `1.005` | permanece `1.005` |
| Editar manualmente residual para `99` | `99` |
| Depois informar entrada `7`, em seguida `8` | permanece `99` em ambos |

O input de saída é numérico e `readOnly=false`. A regra condicional de cópia e o cálculo declarado não podem ser tratados como arredondamento obrigatório a duas casas: a execução observada preservou três. Também não se pode zerar o residual ao apagar a entrada nem sobrescrever a intervenção manual. A tentativa inicial de limpar por `fill('')` não limpou o campo; o resultado de vazio acima foi confirmado após seleção e Backspace. Ainda faltam separador decimal por locale, recarga/edição de submissão existente e fórmulas do Tables. A aba temporária foi fechada sem submissão; evidência JSON ficou privada fora do repositório.

## Acesso às integrações e publicação 3.4.398

Após o usuário disponibilizar a conta proprietária, a página de integrações abriu sem o aviso de restrição. A opção Jotform Tabelas apresentou um assistente novo com Criar Entrada/Update Entry, sem ação selecionada; o assistente foi cancelado, sem criar conexão. A galeria não foi tomada como prova de ausência de automações externas. Continua necessária a conferência das configurações da própria tabela.

3.4.398 publicada pelo PR #276, merge `e7a41b830e27bf79bf19d5ebf1fe18e20e0a41dd`, workflow `38569224653` concluído. Revisão `plano-contas-iob-01158-dox` com 100% do tráfego; API de versão, saúde e Firestore conectados conferidos. SHA-256 do JavaScript servido igual ao arquivo do commit: `79eb977d1c6dea9a6d2199dede0b5c0e6920b6e4ea1559de616bc04b7fd69e13`. CI remoto: 229 aprovados, 26 pulados, zero falhas. A falha local do PDF externo AuditAI permanece reproduzível também na main anterior e não foi contornada.

## Ação da tabela: envio DEFIS — configuração conferida

A tabela V2 mostrou 967 registros e a coluna de ação com rótulo truncado `ENVIO DEFIS 202...`. Há células com data de envio e outras com botão disponível; nenhum botão de linha foi executado. O menu do cabeçalho permitiu consultar duas integrações selecionadas. Os editores foram cancelados, sem Salvar ou Aplicar Alterações. Uma seleção provisória alterada durante a navegação foi descartada pelo fechamento; ao reabrir, ambas as seleções originais estavam preservadas.

| Integração | Configuração observada |
|---|---|
| Microsoft Teams — Enviar mensagem via chat | Chat existente configurado; título com prefixo `New submission for:` seguido de N°, CNPJ, Colaborador, Status da Empresa e Tributação. Corpo inclui N°, CNPJ, Status da Empresa, Tributação, Colaborador e BALANCO / BALANCETE FECHADO 2025. Botões Visualizar Envio e Editar envio desmarcados. |
| OneDrive — Envio de Arquivos | Pasta existente em OneDrive corporativo/SharePoint; criação de subpastas por envio ativada. Nome composto pelos campos ID do Envio, N°, CNPJ, EMPRESAS e Colaborador. PDF de submissão selecionado: Padrão. Campo de upload selecionado: RECIBO + DEFIS 2025/2026. |

URLs de chat/pasta e conta vinculada ficaram somente nas capturas privadas. O destino completo estava truncado na tela e não foi inferido. A presença dessas configurações não comprova entrega atual nem define os gatilhos de todas as demais ações. O botão DEFIS não deve ser reduzido a uma baixa de obrigação: sua equivalência exige comunicação, PDF, cópia do anexo, organização de pastas e histórico do resultado.

Para implementação e homologação: identificar ação e versão, guardar referência estável do registro de origem, gerar prévia dos campos e arquivos, validar destino autorizado, separar resultado de cada integração e impedir repetição indevida. Testar falha parcial e retomada com destinos de teste antes de habilitar envios reais. A infraestrutura de documentos nativos do CCI não comprova, por si só, a migração desses arquivos e efeitos externos. Permanecem pendentes as outras ações da tabela, fórmulas, destinos completos, layout do PDF padrão e ensaio controlado.
