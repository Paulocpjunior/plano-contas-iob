# CRM contábil — migração da base e análise de equivalência

## Evidência e escopo

Conferência feita na sessão autenticada do Jotform Tables em 13/10/2026. O conector retornava metadados incompletos; as exportações das abas operacionais foram conferidas contra os totais da interface. As primeiras exportações continham apenas as colunas visíveis. Após abrir as tabelas originais e exibir todos os campos, foram acrescentadas as exportações integrais: base oficial, 1.585 linhas / 101 colunas; contábil V2, 967 / 87; aluguéis, 541 / 25. Os campos adicionais ficaram preservados em fontes separadas, sem substituir o retrato anterior. Botões da interface não são colunas de dados exportáveis.

A conferência final em produção, em 13/10/2026 às 18:50 UTC, comparou integralmente os campos de 7.928 registros, 419.095 campos e 14 exportações. Os registros incluem repetições entre abas e retratos; não representam 7.928 empresas. Foram identificados 975 CNPJs válidos distintos na origem, sendo 297 já cadastrados e 678 novos dossiês CRM. A carteira administrativa apresentou 984 identificadores distintos na união com os cadastros contábeis existentes. Essa contagem é dinâmica e inclui cadastros anteriores à migração.

Há 125 registros sem identificação segura, preservados para conferência administrativa; tampouco são 125 empresas distintas. Nove linhas da exportação oficial integral contêm divergência entre duas colunas de CNPJ preenchidas: nenhum dos dois foi escolhido automaticamente. A exportação não incluiu a restauração de itens arquivados ou excluídos.

Os arquivos reais, manifestos, hashes e snapshot anterior do destino ficam em diretório privado, fora do repositório e dos assets do app. O quadro administrativo “Conferência da migração” consulta os manifests conferidos no banco online; não contém dados fictícios.

## Modelo implementado

- `empresas`: permanece autoridade do cadastro contábil e da carteira existente. Nenhum cadastro, usuário, lançamento ou saldo é regravado pela importação.
- `crm_empresas`: dossiês dos CNPJs válidos presentes na origem e ausentes do cadastro contábil. Começam sem equipe; apenas administradores distribuem acesso.
- `crm_registros`: registro por fonte + linha da exportação. Preserva nome e posição de todas as colunas, valor original, tipo, formato, fórmula exportada e hyperlink. Rótulos duplicados são campos distintos. Há revisão e histórico para a edição nativa.
- `crm_importacoes`: contagem, cabeçalhos e SHA-256 da exportação, publicados após a conferência da carga.
- CNPJ ausente/inválido: registro completo na área administrativa de identificações a conferir; sem carteira automática. Nenhuma correção por aproximação de nome/código.
- Registros repetidos do mesmo CNPJ são apresentados separadamente por aba e linha. Não há eleição de um status “verdadeiro” entre valores conflitantes.
- O nome de colaborador na origem é informação histórica. Acesso depende de `responsaveis` com UID e papel principal/apoio. `empresas` prevalece quando um cadastro posterior existe.
- Controles ficam no caminho estável `empresas/{cnpj}/crm_controles`, inclusive quando o dossiê ainda não possui cadastro contábil. Criar um cadastro depois não perde os controles.
- Rotas autenticadas e rules deny-all para clientes. Código de backend, exports e dados não integram a allowlist de assets.

## Equivalência funcional e limites

| Função da origem | Situação nesta entrega |
|---|---|
| Empresas, dados cadastrais e parâmetros exportáveis | Consulta nativa por origem; valores originais preservados |
| Campos repetidos, vazios e erros de fórmula | Preservados; não viram zero nem conclusão |
| Carteira por colaborador | Administração explícita; nenhum vínculo inferido pelo primeiro nome |
| Obrigações e demandas por período | Controles nativos com situação, prazo, evidência, revisão e histórico |
| Baixa de obrigação | Exige protocolo/link; valores legados não são convertidos em baixas certificadas |
| Alterar parâmetros | Edição com motivo e controle de revisão; identificação/origem protegidas |
| Anexos | Links preservados; cópia definitiva dos binários ainda pendente |
| Botões de envio do Jotform | Não são valores exportáveis; automações/envios precisam ser reproduzidos e testados separadamente |
| Fórmulas/indicadores do Jotform | Valores exportados preservados; motor das fórmulas não está migrado |
| Checklist: entradas, saídas e responsabilidade | Prévia existente depende da credencial da integração; sincronização automática ainda pendente |
| Abas individuais dos colaboradores | Devem corresponder à carteira administrada, não autorizar usuários pelo texto da aba |

O Jotform não deve ser desativado enquanto anexos, fórmulas, automações e Checklist não tiverem equivalência verificada. Não há sincronização bidirecional: editar o parâmetro no CCI não regrava o Jotform.

## Importação e repetição

`preparar-crm-jotform.py` lê exports sem executar fórmulas e confere as contagens do manifesto. `importar-crm-jotform.js` faz prévia por padrão; `--aplicar` usa criação com precondição e lotes limitados. Repetição da mesma exportação verifica origem e preserva alterações nativas. Mudança do hash de uma fonte existente bloqueia a importação para conciliação explícita. O importador não remove registros.

Identificadores de linha são identificadores desta exportação, não IDs de submissão Jotform. Uma exportação posterior com outra ordenação exige conciliação, não deve sobrescrever a anterior por posição.

## Validação

Testes cobrem isolamento por UID, prioridade do cadastro atual, identificação inválida, acesso direto indevido, revisões concorrentes, campos repetidos, preservação de nulo/zero/origem, auditoria e estabilidade dos controles ao criar cadastro posteriormente. A suíte de CI distingue testes sem arquivos de evidência dos que falharam.

Entrega 3.4.389: PR #264, merge `18d37d5075d0736d5546c1158698cb6782aa525a`, workflow 38447268920 concluído e revisão `plano-contas-iob-01140-tol` com 100% do tráfego. Versão pública, saúde do Firestore e hash do JavaScript servido foram conferidos. Backend/importador não são assets públicos; consulta sem autenticação retorna 401. Suíte: 250 testes aprovados, 3 pulados por ausência de fixtures externas, zero falhas.

Na sessão real do administrador no Safari, a busca por uma empresa existente retornou um resultado e carregou suas seis fontes, incluindo os 87 campos da V2 integral. Conferidos status, atividade, tributação e colaborador de origem ao lado do valor atual. O painel administrativo mostrou as exportações integrais. Nenhuma baixa, alteração de parâmetro ou atribuição fictícia foi criada para validar a interface.

## Critério de equivalência antes de desligar o Jotform — 14/10/2026

Esta etapa acrescenta filtros e navegação local, não autoriza a desativação da origem. A migração de valores não comprova migração de comportamento.

| Item | Evidência disponível | Falta para equivalência |
|---|---|---|
| Empresas, colunas e valores | Importação documentada acima, com origem preservada | Reconciliar cada identificação pendente e divergência entre fontes; conferir snapshot final atualizado |
| Opções e situação do cliente | Valores originais preservados nos parâmetros | Inventariar opções/validações condicionais; conciliar estado contratual canônico com histórico, sem inferir do estado das obrigações |
| Carteira e permissões | Distribuição administrativa por UID; testes de isolamento | Homologar contas reais de admin, colaborador e consulta; revisar permissões dos demais módulos |
| Fórmulas | Resultados importados | Inventariar expressão, dependências, tipos e arredondamento; recalcular casos normais, vazios, erros e limites comparando campo a campo |
| Automações | Sem reprodução integral comprovada | Inventariar gatilho, condição, ação, destino e efeitos; testar repetição, falha/retry e desativação segura, sem disparar comunicações reais |
| Anexos | Links preservados e expostos no dossiê | Copiar binários para armazenamento privado; validar contagem, hashes e acesso por carteira; testar sem depender de sessão Jotform |
| Checklist | Prévia de leitura existente | Resolver credencial autorizada e contrato; testar entrada, saída e início/fim de responsabilidade, correção retroativa e replay idempotente |
| Obrigações/processos | Estados, evidência e histórico existentes; prazo separado nesta etapa | Conciliar aplicabilidade, periodicidade, valores e transições com a origem; não converter valores importados em baixas automaticamente |

Homologação final: congelar um snapshot de referência, registrar diferenças por fonte/linha/coluna, corrigir e repetir; executar cenários de paridade aprovados, ensaiar restauração e definir janela de corte. Só desligar após aceite explícito com pendências resolvidas ou formalmente aceitas. A edição e publicação desta etapa permanecem separadas do corte da origem.

## Preparação do delta e anexos — 15/10/2026

`scripts/planejar-crm-delta.js` compara três entradas privadas: snapshot anterior, novo snapshot e array atual de `crm_registros`. Quarto argumento: relatório novo. Quinto opcional: JSON de vínculos `{anterior, novo, motivo}` conferidos pelo operador. Sem rede, gravação no banco ou aplicação automática. Saída exclusiva, modo 0600; valores, CNPJ e URLs são representados por hashes. Relatório inclui inventário dos links reconhecidos por empresa; não representa inventário completo de binários.

O identificador legado contém fonte e linha, não ID de submissão. Alteração do manifesto da fonte bloqueia vínculo implícito mesmo quando o número de linha se repete. Nome/CNPJ não fazem pareamento automático. Mudança de identificação/estrutura exige revisão; edições CCI são preservadas e divergências simultâneas viram conflitos. Registro sem vínculo permanece preservado. Vínculos explícitos não são autorização para aplicar o plano. O script não implementa escrita do delta.

Inventário do snapshot de 13/10 executado em 15/10: 4.316 combinações empresa/link, 10.839 referências, 53 combinações com identidade inválida. Hosts observados: Jotform 3.820; SharePoint 134; portal igreja 358; Google Drive 2; 1drv.ms 1; OneDrive 1. Nenhum binário copiado. Links podem ser páginas, não anexos; classificar antes de transferir. Relatório privado fora do Git em `cci-crm-qa-20261015/inventario-anexos.json`.

## Checklist assistido — implementação 3.4.404

`POST /api/crm/checklist/aplicar`: exclusivo de administrador conferido no Firestore antes e depois da consulta externa. Exige assinatura da leitura, ID da submissão, revisão do contrato, motivo e confirmação explícita. Reconsulta a origem paginada e valida seu esquema; transação atualiza apenas `crm_contrato`/`crm_situacao_cliente`, cria evento em `crm_checklist_eventos` e auditoria em `auditoria_contabil` da empresa. Repetição idêntica não grava; alteração posterior da mesma submissão exige revisão manual. A chave global da submissão impede repetir a aplicação após troca de vínculo da empresa.

Entradas só iniciam contrato ausente; saídas/baixas exigem contrato ativo, preservam seu início e conferem a data final. Não há aplicação de eventos futuros, múltiplos eventos da empresa, suspensão/alteração, retorno com contrato anterior ou identificação ambígua. Não cria empresa sem CNPJ/vínculo confirmado, não concede acessos, não gera/baixa controles e não envia mensagens. Isso não é sincronização automática nem homologação do Checklist real.

Credencial: não foi encontrado segredo identificado como Jotform/Checklist no Secret Manager do projeto de produção; nenhum valor foi lido. No projeto de autenticação a consulta retornou serviço desabilitado/inacessível. É necessário cadastrar uma credencial autorizada e vinculá-la a `CCI_CHECKLIST_API_KEY` antes da homologação real. Não presumir que outro segredo seja a chave correta.

## Saneamento dentro do CRM — 3.4.414

A base preservada pode ser conferida progressivamente no destino. Registros sem identidade segura continuam acessíveis somente à administração; não são descartados nem distribuídos automaticamente. Em Gestão da carteira → Identificações a conferir, o administrador informa CNPJ válido e razão social exata de um cadastro existente, confirma a exposição do registro à carteira de destino e registra o motivo. A transação relê o perfil, verifica revisão e mantém `cnpj_origem`, campos originais, fórmulas e hash. Histórico por registro e auditoria na empresa registram a correção. No dossiê → Parâmetros, o mesmo fluxo permite revisar novamente um vínculo incorreto. Nenhuma correção de cadastro concede carteira ou baixa obrigação.

O relatório de preservação distingue `cnpj_origem` do vínculo operacional corrigido e exige metadados/revisão da conferência. A Topologia permite combinar responsável, busca e pendência: sem equipe, tributação, CNAE, situação confirmada ou controles. Esses filtros indicam ausências no cadastro canônico, não divergências entre todas as fontes nem dispensas fiscais. Corrigir tributação/CNAE canônicos continua pelo cadastro da empresa; parâmetros exportados mantêm edição independente no dossiê.

Limites desta entrega: não houve nova exportação ou importação em produção, cópia de binários, edição em lote dos parâmetros, detecção automática de duplicidades ou ativação de automações. A base de outubro já preservada continua disponível. Snapshot final e conciliação do delta permanecem necessários; nunca sobrescrever por posição de linha. A coluna IA `Saldo a Distribuir 2028` continua excluída somente da migração. Jotform não foi desligado.

## Corte do CRM e permanência do Checklist — 17/10/2026

Decisão do usuário: manter somente o Checklist no Jotform, integrado ao CCI. A retirada dos controles do CRM continua condicionada à conferência final; não inclui excluir formulários nem disparar mensagens.

A exportação oficial de 16/10 (SHA-256 `65d4da58f7727b7969904b7067225fc9b4b89be43cb02c5c463e9fa85288d924`) foi preservada como fonte adicional `oficial_20261016_65d4da58`: 1.586 linhas, 60.268 campos, 20 linhas com identificação inválida disponíveis para saneamento administrativo. As 1.566 linhas com CNPJ válido representam 975 CNPJs distintos, todos já presentes no destino. Não representam 1.586 empresas únicas. Verificação posterior não encontrou alterações nos registros anteriores. Total preservado: 9.516 registros em 16 fontes, não empresas. Evidências privadas em `cci-crm-migracao-20261017` fora do Git.

Credencial exclusiva somente leitura validada na API e armazenada no Secret Manager. Prévia real do Checklist: 1.431 registros, 1.346 com pendências e 85 sem pendências de leitura. Nenhum evento foi aplicado. Principais causas, com sobreposição: 782 sem vínculo confirmado, 432 em múltiplos eventos, 326 que exigem conferência de vigência, 249 situações não reconhecidas, 6 códigos ambíguos. Ausência de pendência na leitura não comprova aprovação operacional.

A versão 3.4.425 prepara a credencial no runtime e a leitura dos arquivos no bucket privado com prevenção de acesso público. A migração de 3.802 URLs de anexos está em andamento; 114 URLs externas e uma credencial de certificado foram separadas. Não declarar cópia completa sem relatório final. Cada binário copiado é relido e comparado por SHA-256; metadados guardam geração e tamanho. Nenhum link público de armazenamento é criado.

`GET /api/crm/empresas/:cnpj/documentos/:registro/:coluna/:indice` confere carteira atual, registro e vínculo com a empresa, cópia existente, tamanho e SHA-256, e relê vínculo e permissão depois do download. A interface diferencia download CCI de link ainda na origem. URLs múltiplas no mesmo campo também são preservadas. Checklist mantém aplicação individual assistida; campos ausentes e ambíguos não são inferidos.

Pendências de encerramento: relatório final de anexos e indisponíveis, homologação autenticada da empresa 1200, conferência das fórmulas/automações, ensaio de restauração e aceite de corte dos controles. O Checklist não será desligado.

## Atualização da conferência — 17/10/2026

Cópia concluída para 3.800 de 3.802 URLs de anexos Jotform; dois arquivos indisponíveis (404 e vazio), 114 URLs externas preservadas e uma credencial segregada. Homologação administrativa na SP_HOME: empresa 1200, dossiê/documentos, download privado e abertura do PDF DEFIS confirmados. Piloto sem controles cadastrados; não equivale à homologação de obrigações ou de colaborador restrito.

Por decisão de Paulo, automações serão enumeradas e construídas nativamente no CCI, sem bloquear os demais desenvolvimentos pela reprodução exata do fluxo legado. Ver `crm-engenharia-reversa-20261017.md` para matriz atual de transferência, adaptação da fórmula de saldo e pendências reais. Nenhum envio foi ativado.
