# Validação local — Carteira e obrigações

13/10/2026. Branch: codex/crm-carteira-obrigacoes. Base: d9e8e1ba1c1778ff8e579df57298f2f21ea97baa (main, 3.4.385). Nenhum commit, push, deploy ou alteração em dados reais nesta execução.

## Entrega revisável

- [Matriz de equivalência, permissões e implantação](crm-carteira-obrigacoes.md).
- crm-contabil.js: regras de acesso ao CRM, catálogo, períodos, conclusão, reabertura e indicadores.
- crm-contabil-routes.js: consultas paginadas e gravações transacionais com autorização revalidada, revisão e histórico.
- crm-checklist.js: mapeamento contratual e prévia consistente da origem, sem aplicação.
- crm-contabil-ui.js: carteira, distribuição administrativa, criação/atualização de controles, histórico e prévia.
- index.html: novo atalho; funções anteriores preservadas. Apenas o arquivo de UI entrou na lista de arquivos públicos.
- Três scripts de teste registrados nos gates existentes.

## Resultados

| Verificação | Resultado |
|---|---|
| npm ci --ignore-scripts --no-fund | Dependências instaladas; 0 vulnerabilidades informadas |
| npm run test:crm-contabil | Passou: domínio, leitor e rotas |
| npm run test:permissoes-cci | Passou |
| npm run test:empresa-plano | Passou, inclusive compatibilidade dos módulos anteriores |
| npm run test:html-inline | 17 blocos de JavaScript válidos |
| npm run test:marcador-conflito | Sem marcadores nos 515 arquivos examinados |
| npm run check:ci | 248 scripts passaram; 3 pulados por evidência externa ausente; 0 falhas |
| npm run check | Não completou: parou em arquivo de regressão Itaú ausente, após as verificações anteriores do encadeamento |
| npm audit --omit=dev | 0 vulnerabilidades |
| node --check nos novos módulos; git diff --check | Passaram |

Scripts pulados pelo gate CI: test-itau-extrato-mensal.js, test-sage-impostos-retidos-servicos-tomados.js e test-santander-layouts.js. Não houve alteração de parsers neste trabalho. Os arquivos de evidência não foram fabricados, os testes não foram removidos e os gates não foram contornados.

Logs da execução estão em /Users/paulocesarpereirajunior/Documents/New project/output/crm-contabil-20261013/cci-crm-check.log e cci-crm-check-ci.log.

## Interface verificada

Navegador local, dados fictícios e armazenamento em memória; nenhuma conexão com Firestore real ou Jotform:

1. Administrador visualiza duas empresas fictícias.
2. Criação de ECD para ano de referência 2025 e prazo definido manualmente: sucesso.
3. Tentativa de concluir sem comprovante/protocolo: bloqueada com mensagem de correção.
4. Conclusão com protocolo fictício: sucesso, situação atualizada e duas revisões no histórico.
5. Histórico mostra a transição, autor, data, prazo, observação e protocolo.
6. Atribuição de principal e apoio com motivo: ambos preservados após salvar.
7. Perfil colaborador visualiza somente uma empresa atribuída e não recebe controles de distribuição, criação ou reabertura de conclusão.
8. Inspeção visual do modal e de seus rótulos; datas de tela em português e horário de São Paulo.

Evidência visual: /Users/paulocesarpereirajunior/Documents/New project/output/crm-contabil-20261013/previa-colaborador.jpg.

## Limites e próxima etapa

Esta é a primeira etapa local, não uma substituição concluída do Jotform. Não foram feitos testes com contas reais, transações em emulador Firestore, leitura autenticada de Tables, migração, sincronização incremental, transmissão fiscal, armazenamento de anexos ou publicação. A credencial CCI_CHECKLIST_API_KEY não foi configurada; a leitura externa foi testada com respostas controladas.

Apenas o CRM usa a carteira como limite exclusivo. O acesso legado dos demais módulos continua preservado até a revisão de acessos e a migração controlada. Obrigações são criadas por administrador e baixadas manualmente com evidência; a aplicabilidade contratual e os vínculos automáticos com execução/Reinf ainda não foram implementados.

Antes da publicação: concluir o inventário do Tables, revisar a matriz com a operação, homologar em ambiente isolado com Firestore e perfis de teste, avaliar credencial/índices necessários, preparar plano de dados com backup e restauração, e seguir o processo de publicação autorizado do repositório.
