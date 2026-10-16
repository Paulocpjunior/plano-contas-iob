# Topologia e retirada do Jotform — revisão de 16/10/2026

## Evidência e escopo

CCI revisado a partir de main 3c253de (3.4.410). Serviço Topologia configurado no CCI. Código do serviço encontrado em `/Users/paulocesarpereirajunior/topologia-contabil/server.js`; não há repositório Git nesse diretório. A página pública servida confirma os fluxos de SSO e edição, mas não comprova que todo o backend local é idêntico ao publicado. Nenhum dado real foi alterado nesta revisão.

## Problemas encontrados no código da Topologia

- Alto: `auth` aceita a sessão SSO assinada por oito horas sem consultar novamente o cadastro de acesso. Remover um usuário não revoga essa sessão imediatamente. Usar sessão revogável no servidor e verificar a autorização atual do emissor CCI.
- Alto: `passesUsados` é um Map em memória. O uso único do passe não é garantido entre instâncias/reinícios. Consumir o identificador em transação persistente, com expiração e separação entre passe e sessão.
- Alto: `podeEditar` permite ao líder editar/excluir qualquer posição de colaborador, independente de célula. Isso diverge do README e não pode se propagar para a carteira CCI. Definir e testar o escopo por célula, sem conceder acesso contábil por posição no organograma.
- Alto: PATCH lê o documento fora de transação e depois grava o objeto completo. Edições simultâneas podem sobrescrever mudanças e produzir histórico incorreto. Exigir revisão esperada em transação e registrar o antes/depois efetivamente persistido.
- Médio: `empresas` é um número manual; valores inválidos viram zero. Não representa a carteira efetiva. Substituir por indicadores calculados pelo CCI, vinculados por UID confirmado, com período e contagem de empresas distintas.
- Médio: excluir líder não verifica colaboradores dependentes; validar referências e arquivar posições mantendo o histórico.
- Médio: datas são validadas apenas por formato, permitindo datas inexistentes. Validar calendário e vigências.
- Médio: comparação de assinatura usa comprimento de string antes de comparar bytes; Unicode pode provocar exceção. Rejeitar formato inválido antes da comparação. Correção feita no módulo emissor/verificador do CCI; receptor externo ainda exige correção própria.
- Médio: a tela administrativa anunciava sucesso antes de confirmar qualquer carregamento do serviço. A nova entrada no CRM informa apenas acesso solicitado e oferece nova tentativa.

## Integração implementada no CCI

Entrada Topologia dentro do CRM, apenas para administradores; carregamento sob demanda, retorno à gestão de responsáveis, iframe com referrerpolicy no-referrer, descarte do iframe ao perder o perfil administrativo. Endpoint de passe protegido por adminRequired e resposta private/no-store. Validação de URL HTTPS sem credenciais e endurecimento da validade/formato do passe. Não altera distribuição, registros contábeis ou fórmulas.

A incorporação visual não é sincronização de cadastros. A fonte de autorização continua sendo a carteira do CCI. Para integração de dados, vincular posição a UID de usuário confirmado; consultar carteira/carga por API autorizada; nunca aceitar o número manual do organograma como carteira real.

## Critérios para desligar o Jotform

1. Checklist: credencial CCI_CHECKLIST_API_KEY não aparece na configuração atual do serviço. Preparação existente não comprova sincronização real. Configurar credencial autorizada pelo canal de segredos e conferir entradas, saídas e datas por evento.
2. Base final: reconciliar exportação nova, identidade estável e diferenças desde a importação; não reutilizar o snapshot antigo como prova de atualização.
3. Anexos: inventário de links não é cópia. Migrar binários para armazenamento privado com hash, escopo por empresa, quantidade e evidência de abertura.
4. Fórmulas e ações: homologar casos vazios/zero/negativos e configuração original; DITR mantém anexo e mensagem próprios. Coluna IA "Saldo a Distribuir 2028" segue excluída somente da migração.
5. Homologar piloto 1200 e colaborador restrito, inclusive documentos, exportações e revogação de carteira.
6. Executar restauração isolada e ensaiar corte sem perda de eventos. Só então suspender novas entradas no Jotform.

Jotform não foi desligado. Esta revisão não comprova equivalência completa, cópia de anexos ou homologação autenticada.
