# Central compartilhada de notificações

## Escopo
A mesma interface é utilizada pelo CRM e por Aplicações Financeiras. O novo botão em Aplicações Financeiras abre a configuração da empresa ativa. A abertura administrativa é conferida novamente no servidor; mudar o CNPJ ou forjar o perfil no navegador não concede acesso.

## Separação de dados
- CRM mantém os documentos existentes em crm_automacoes/A01–A08, sem migração ou alteração automática.
- Aplicações Financeiras usa empresas/{cnpj}/crm_notificacoes/aplicacoes_F01–F03 e subcoleção historico.
- F01: solicitação de extratos. F02: pendências. F03: conclusão informada pelo responsável, sem concluir obrigações ou lançar valores.
- Nenhuma empresa recebe os destinatários de outra por herança. Cada regra possui canal, destinatários, modelo e revisão próprios.
- Servidor calcula a prévia a partir da empresa consultada e da configuração salva; valida competência AAAA-MM. F02/F03 exigem descrição da pendência/conferência. Configuração concorrente e chave de prévia repetida com conteúdo diferente são rejeitadas.

## Compatibilidade
O envio manual existente em Aplicações Financeiras permanece com sua confirmação, destinatário informado na tela e rota original. Ele não passa a consumir automaticamente os modelos ou destinatários desta central. Configurações da central continuam desativadas: não existe envio Teams ou execução automática criada nesta entrega. A interface informa essa separação explicitamente.

## Reutilização
A interface pública abrirCentralNotificacoes recebe módulo, CNPJ e competência. O catálogo e as variáveis são definidos no servidor; não se aceita módulo arbitrário ou ID de regra de outro módulo. Ao adicionar módulos futuros, registrar catálogo e escopo de autorização próprios, sem copiar o modal. O CRM abre o componente compartilhado em dialog; o script anterior deixou de manter uma implementação separada.

## Validação
Testes de isolamento entre CNPJs e entre módulos, acesso administrativo, revogação durante leitura, revisão e prévia por competência. Regressão do envio manual de extratos passou com provedor simulado, sem mensagem real. Navegador com backend de teste confirmou salvamento na empresa A, prévia de outubro/2026, empresa B sem destinatários e abertura das oito regras originais do CRM. Snapshot inclui configurações e histórico das novas notificações.
