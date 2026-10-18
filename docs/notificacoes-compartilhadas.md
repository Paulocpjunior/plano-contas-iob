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

## Atualização 3.4.430 — execução manual e PDFs
A prévia salva agora oferece envio manual por e-mail aos destinatários configurados pelos administradores. O servidor confere novamente administrador, empresa, prévia e revisão. A mensagem vem exclusivamente da prévia auditada; o cliente não fornece HTML ou destinatários fora da lista. Cada destinatário tem uma reserva transacional baseada no conteúdo/revisão, inclusive entre prévias idênticas, e tentativas registradas separadamente no mesmo histórico.

Estados: processando (resultado ainda não confirmado), aceito (Microsoft 365 retornou 202; não comprova entrega), recusado (recusa explícita ou falha antes do POST), incerto (timeout/rede/5xx). Apenas recusados oferecem nova tentativa manual com conferência do número da tentativa. Incertos e processando não se repetem automaticamente. A queda do processo após a reserva exige conferência dos itens enviados. Mudança do modelo/destinatários exige nova prévia. O remetente segue a seleção existente de colaborador/caixa institucional; não há fallback automático após o POST.

A05/A07 geram PDF paginado da prévia específica DEFIS/DITR via jsPDF já instalado. O registro é interno, não é recibo fiscal, não copia anexos da origem e não altera obrigações. A geração exige autenticação administrativa e vínculo da prévia com o CNPJ.

Limites ainda abertos: Teams precisa de conexão de entrega (link não autoriza publicação); os gatilhos de cadastro e os agendamentos não foram implementados nesta etapa. `ativa` permanece falsa para não confundir configuração com execução automática. Nenhuma mensagem real foi enviada na validação; provedores simulados verificam os resultados. A disponibilidade de e-mail indica credencial configurada, não homologação de entrega.
