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
