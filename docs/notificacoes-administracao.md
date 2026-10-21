# Central de notificações — 3.4.431

Administradores configuram quem recebe, conteúdo, canal e ativação em Automações do CRM e em Aplicações Financeiras → Notificações. Configurar um modelo não ativa uma execução. Aplicações mantém configuração exclusiva por empresa; as APIs exigem administração e acesso ao escopo.

## Operação

1. Salvar modelo, destinatários e motivo. E-mail admite os destinatários validados pela central. Teams usa um destino por regra.
2. Para Teams, criar no Microsoft Teams um Workflow de webhook de entrada que publique no chat/canal escolhido. Em **Conectar Teams**, informar a URL gerada e confirmar o destino. O endpoint deve aceitar o payload Adaptive Card e a chamada do servidor; não usar URL que exija token de usuário. A URL fica exclusivamente em versão imutável do segredo `cci-notificacoes-teams`; Firestore guarda somente referência e destino. [Orientação Microsoft](https://support.microsoft.com/pt-br/workflows/send-messages-in-teams-using-incoming-webhooks).
3. Em **Gatilhos e agenda**, configurar evento de cadastro (A01/A02) ou agenda única, diária, semanal ou mensal. Eventos podem abranger uma empresa ou todas. Somente eventos novos, posteriores à ativação, são elegíveis. Não há reenvio histórico da importação.
4. Definir parâmetros, motivo e marcar a ativação. Datas são de Brasília. Aplicações pode usar competência fixa, do mês da execução ou anterior. Dias mensais inexistentes usam o último dia do mês, preservando o dia original no mês seguinte.
5. Consultar histórico, pausar ou editar/reativar. Alterações de modelo ou conexão invalidam a revisão anterior e exigem revisar a execução. Revogação do administrador responsável bloqueia o processamento.

A01/A02 recebem eventos das rotas de cadastro de empresa e edição de parâmetros do CRM. Outras regras usam prévia manual ou agenda; não inferem conclusão de obrigação nem executam baixa. A05/A07 geram registros PDF próprios; a agenda gera a prévia disponível no histórico para download. A08 consulta o Checklist para conferência, sem aplicar entradas/saídas ou mudar contratos. Anexos antigos continuam consultáveis no Jotform, sem nova importação.

## Execução e estados

Cloud Scheduler chama a cada cinco minutos uma rota com identidade OIDC exclusiva e audiência fixa. O servidor trabalha mesmo com o navegador fechado. Cada rodada limita 20 agendas, 20 eventos e 18 itens da fila, com três transportes simultâneos e uma consulta do Checklist. Pode haver atraso adicional em fila. Após indisponibilidade, executa uma ocorrência pendente e avança para o próximo horário futuro, sem avalanche de todas as ocorrências perdidas. Agenda já expirada não envia uma ocorrência atrasada.

`aceito` significa aceitação do provedor (Microsoft 365 ou Workflows), sem prova de entrega/leitura no destino. Recusas confirmadas podem ser repetidas explicitamente pelo administrador. Resultados incertos ou interrompidos em processamento não são repetidos automaticamente; precisam de conferência do provedor. Pausa impede itens ainda não reclamados; uma chamada já iniciada ao provedor não pode ser desfeita. A trilha registra configuração, execução, destino e tentativa. Prévias automáticas não podem ser reenviadas pelo caminho manual.

## Infraestrutura e verificação

`scripts/configurar-notificacoes-infra.sh --apply` provisiona segredo, permissões restritas ao segredo e Scheduler autenticado. Um job novo nasce pausado; deve ser retomado após publicar a rota correspondente. A service account de execução não recebe acesso genérico a novos segredos. O handler interno exige token Google com audiência e e-mail exclusivos; não utiliza autenticação Firebase de usuário. As quatro coleções de execução/eventos/fila/sistema estão no escopo do ensaio de restauração CRM.

Testes automatizados usam Firestore e transportes fictícios: isolamento, revogação, deduplicação, calendário mensal, expiração, repetição explícita, conexão Teams, OIDC e Checklist somente leitura. Teste no navegador gravou agenda, processou uma ocorrência, conferiu histórico e verificou zero envios na segunda rodada. Não foram ativadas regras reais nem enviadas mensagens durante a homologação. A configuração dos destinos e a validação de entrega real cabem aos administradores pelo painel publicado.

## Automações criadas pelo administrador (3.4.443)

Em **＋ Nova automação** o administrador cria até 20 automações próprias por módulo (P01–P20): nome, canal (e-mail ou chat/canal do Teams), destinatários e texto com variáveis. Elas são manuais (prévia e confirmação) ou por agenda; não têm gatilho de cadastro. No CRM aceitam também `{{competencia}}`. Se o texto usa uma variável e ela não foi informada, a prévia é bloqueada e diz qual dado falta. Teams segue a mesma regra das demais: um chat ou canal por automação, com **Conectar Teams** depois de salvar.
