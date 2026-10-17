# Automações nativas — etapa de configuração

## Entrega 3.4.428
Administração em CRM → Gestão da carteira → Automações do CRM. O catálogo A01–A08 permanece identificado conforme a engenharia reversa. Usuário administrador pode escolher e-mail ou Teams para as notificações, cadastrar até vinte destinatários distintos por regra e editar o modelo. Revisão transacional impede sobrescrever configuração concorrente, motivo e autor ficam no histórico. Não há chave ou segredo no formulário; Teams recebe link de chat/canal, não webhook com credencial.

As prévias são calculadas no servidor usando identidade da empresa consultada, modelo/revisão atual e variáveis limitadas. Registra-se a prévia com chave de idempotência: repetir a mesma operação não duplica histórico; mudar seu conteúdo com a mesma chave falha. Autorização é revalidada no banco dentro da transação; perfil administrativo enviado pelo navegador não é aceito. Histórico é paginado, administrativo, com dados privados e sem cache. Novas coleções entram no snapshot CRM.

## O que esta etapa não executa
Não há envio e-mail/Teams, captura automática de eventos cadastrais, fila de entrega, confirmação do provedor, PDF ou agenda Scheduler. A05/A07 preparam o texto do registro, não produzem arquivo PDF nesta entrega. A08 continua usando a consulta assistida existente; o modelo configurado não agenda a consulta. A API recusa ativação. Não comunicar estas oito entradas como oito automações concluídas.

Os destinatários serão preenchidos pelos administradores no modal, por decisão expressa do usuário. Não depende de informar destinatários pelo chat. Um canal de entrega por regra nesta etapa; não há envio simultâneo por dois canais nem contato inferido do cadastro. A02 exige definir posteriormente a política de contato por empresa para não enviar informações de uma empresa ao contato de outra.

## Próxima implementação
- A01/A02: produtor de eventos cadastrais versionados, contato confirmado por empresa, fila e driver de entrega.
- A03/A04/A06: envio manual após prévia, destinatários configurados, confirmação específica, credenciais do serviço e autorização do provedor Teams; link cadastrado não concede acesso por si só.
- A05/A07: geração de PDF do registro nativo, sem copiar anexos antigos (decisão do usuário).
- A08: job autenticado, horário/frequência configuráveis, consulta completa e fila de revisão sem aplicar alterações.
- Entrega: estados pendente/processando/aceito/falhou/resultado desconhecido; não repetir envio de resultado incerto nem chamar aceitação do provedor de leitura pelo destinatário.

## Validação
Testes de modelo, destinatários, canal, revisão, acesso administrativo, revogação, categoria DITR/DEFIS, URL, idempotência e histórico. Navegador com dados fictícios confirmou seleção de Teams, dois destinatários e revisão incrementada sem ativação. Nenhum destinatário real ou dado empresarial foi alterado por estes testes.
