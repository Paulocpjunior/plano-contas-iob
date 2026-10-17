# Engenharia reversa funcional — Jotform → CCI/Topologia

## Decisão e limites

Em 17/10/2026, Paulo determinou transferir os comportamentos mapeados para o CCI por engenharia reversa e apenas enumerar as automações restantes para construção nativa posterior. A conferência de automações deixa de bloquear o desenvolvimento dos demais recursos; não significa que elas estejam implementadas ou autorizadas a enviar mensagens. Somente o Checklist continuará no Jotform.

Referências: `crm-contrato-origem-20261014.md`, exportações preservadas, propriedades obtidas em 17/10 pela API oficial e código de `crm-base.js`, `crm-contabil-routes.js`, `crm-planejamento.js` e interface CRM. Configurações privadas e destinatários ficam fora do Git. A matriz cobre as funções conhecidas dessas fontes; não presume descoberta de todos os fluxos da conta Jotform.

## Matriz de transferência

| Função observada | Destino e resultado verificado no código | Falta / tratamento |
|---|---|---|
| Dados, parâmetros e registros repetidos | `crm_registros`, edição por coluna com motivo, revisão e histórico | Resolver divergências no CCI; nunca escolher automaticamente entre fontes |
| 1.586 linhas da última exportação | Importação integral aditiva conferida; 975 CNPJs válidos distintos nessa fonte | Linhas não equivalem a empresas distintas; identidade inválida permanece para revisão |
| Situação e tributação V2 | Opções originais e sufixos preservados, validação no servidor | Situação contratual canônica exige confirmação independente |
| Três condições de tributação | Contrato indica visibilidade original de DEFIS/ECD/ECF | Não produz dispensa fiscal nem apaga dados ocultos |
| SALDO JANEIRO 2026 preenchido mostra EMPRESAS | Indicação de apresentação adicionada ao contrato e à interface | Dados continuam visíveis para conferência; não se replica ocultação destrutiva |
| Fórmula `{37}` → SALDO RESIDUAL | Prévia nativa e aplicação explícita, calculada no servidor em transação | Não é subtração. Campos vazios/ambíguos bloqueiam proposta; não arredonda; preserva edição manual até confirmação explícita |
| Responsáveis e colaboradores | Carteira e Topologia usam a mesma base, UID confirmado e departamento contábil | Homologação real com colaborador restrito ainda pendente |
| Colaborador em empresas de regimes diferentes | Distribuição nativa vincula pessoas a empresas, sem regime único por colaborador | Classificação vem do cadastro canônico; não converter ONG/terceiro setor automaticamente em regime fiscal |
| Obrigações, prazos, andamento e baixas | Controles, recorrências, calendário, carga, evidência e histórico nativos | Configurar aplicabilidade e vigência; piloto 1200 sem controles não comprova cobertura operacional |
| Documentos antigos | 3.800 binários copiados com leitura de retorno e SHA; download por carteira homologado no piloto 1200 | Dois arquivos na origem indisponíveis; links externos preservados; credencial de certificado segregada |
| Inclusão de novos anexos e substituição | A rota atual permite baixar os arquivos migrados; editar um link não equivale a fazer upload | Falta upload privado nativo com versões, histórico, validação de arquivo, autorização e revogação; não declarar completo |
| Botões DEFIS/DITR | Categorias e prévias próprias no CCI | Envios e organização de cópias ficam no inventário de automações abaixo |
| Checklist | API real, prévia, aplicação individual com confirmação e idempotência | Revisar pendências de identidade/situação/vigência; manter o formulário e suas notificações na origem |
| Coluna IA Saldo a Distribuir 2028 | Excluída da migração por decisão do usuário | Não recriar. Campo SALDO A DISTRIBUIR ATÉ 2028 continua preservado |

## Fórmula transferida nesta rodada

Somente a fonte `contabil_v2_integral` com exatamente um campo de entrada e um de saída recebe a proposta. Nomes duplicados não permitem inferir IDs. Aceita zero, negativo e decimal com ponto; mantém a precisão observada em `12.345` e `1.005`. Valores com vírgula, vazio ou formatos ambíguos não são interpretados automaticamente. Alterar/limpar a entrada não modifica o residual já salvo. Aplicação requer revisão atual, permissão de edição na empresa, confirmação e motivo. O servidor ignora qualquer resultado enviado pelo cliente e obtém a cópia do registro transacional. Histórico registra regra, antes/depois e autor; original permanece intacto. Não modifica saldos ou lançamentos contábeis.

É uma adaptação deliberada do comportamento observado para proteger correções: o Jotform executa uma cópia condicional e permite intervenção manual; o CCI exige conferência antes de substituir dados históricos. Não é equivalência automática irrestrita.

## Automações a construir dentro do CCI

| ID | Gatilho e origem conhecida | Ação nativa pendente | Cuidados de implementação |
|---|---|---|---|
| A01 | Novo envio ou edição; Notificação 1 | Notificar administração sobre o registro | Destinatário configurável, motivo/evento, idempotência, registro de entrega e falha |
| A02 | Novo envio; Resposta Automática 1 | Confirmar recebimento ao contato da empresa | Conferir contato e conteúdo; não enviar a cada edição |
| A03 | Acionamento manual; Notificação 2 | Enviar notificação administrativa sob comando | Manter manual: gatilhos automáticos estavam desligados |
| A04 | Botão ENVIO DEFIS | Mensagem Teams própria de DEFIS | Definir chat e destinatários no CCI; prévia existente não é envio |
| A05 | Botão ENVIO DEFIS | Gerar PDF de registro e copiar recibo/declaração para pasta configurada | Preservar identidade, exercício confirmado, resultado por arquivo e idempotência; Storage privado já contém binários antigos |
| A06 | Botão ENVIO DITR | Mensagem Teams própria de DITR | Correção expressa do usuário: não reutilizar balanço/DEFIS |
| A07 | Botão ENVIO DITR | PDF e cópia do anexo próprio de DITR | Não reutilizar RECIBO + DEFIS; definir destino e convenção de pastas |
| A08 | Rotina de consulta Checklist (nova operação CCI) | Agendar consultas e encaminhar eventos para revisão | Consulta assistida já existe; agenda não deve aprovar divergências nem trocar responsabilidade por inferência |

A01–A07 provêm das configurações observadas; A08 é uma necessidade operacional do destino, não uma automação comprovada na origem. As quatro notificações do Checklist permanecem no Jotform: não duplicar no CCI. Zero webhooks/integrações na API de propriedades não prova ausência de ações no Tables. Fórmulas ou ações ainda não identificadas devem entrar como desconhecidas, sem inventar equivalência.

## O que depende de cada ambiente

**CCI:** upload/versionamento nativo, saneamento cadastral, configuração de obrigações, homologação de permissões, teste de restauração e construção das automações enumeradas.

**Origem:** consulta final de mudanças posteriores ao snapshot e tentativa de recuperar os dois anexos indisponíveis (ou reposição pelo usuário). Não é necessário reimportar toda a base nem manter o CRM operacional por causa de automações que serão recriadas.

Nenhuma comunicação foi disparada e nenhum parâmetro financeiro real foi regravado nesta rodada.
