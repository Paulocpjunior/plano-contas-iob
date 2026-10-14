# CRM — roteiro de homologação profissional

## Objetivo e piloto

O usuário confirmou a empresa **1200** em 14/10/2026. Identidade e equipe precisam ser verificadas no cadastro online antes de registrar resultados do piloto. Não atribuir um colaborador por suposição nem criar demandas, baixas ou vínculos fictícios em produção.

A entrega visual não é aceite de equivalência com o Jotform. Manter a origem disponível até concluir os critérios abaixo e obter autorização específica para o corte.

## Evidência atual da origem

Em 14/10, o conector retornou nomes de 57 campos do CONTROLE_CONTABIL_2026_V2 e 26 do Checklist. Não forneceu expressões, condições, ações ou binários. Contagens de submissões não são contagens de empresas e não reconciliam abas do Tables.

O payload privado consolidado da migração de 13/10 contém 14 fontes e 7.928 registros; nenhuma célula contém expressão no campo `formula`. Isso significa ausência de expressões na exportação disponível, não ausência de fórmulas no Jotform. Links repetidos aparecem em Jotform, SharePoint e outras origens; não correspondem automaticamente a anexos únicos. Não executar nem copiar URLs sem classificar destino e acesso.

## Critérios de aceite

| Frente | Implementado | Evidência necessária para encerrar |
|---|---|---|
| Orientação visual | Entrada ilustrada, atalhos, temas e celular | Colaborador identifica empresa, demanda e próximo passo sem instrução externa |
| Entrada leve | Contexto e preferências sem leitura da carteira | Confirmar online as requisições e tempo percebido |
| Trabalho individual | Executor/revisor e filtro pessoal/equipe | Conferir atribuições da empresa 1200 e usuário real; ausência de atribuição permanece explícita |
| Acesso | Autorização atual por carteira, revisão, auditoria e apoio com vigência | Sessões reais de admin, colaborador e consulta; negar acesso cruzado e após revogação |
| Cronograma | Início, prazo interno, vencimento, recorrência por confirmação | Administrador confirma regras, vigências e casos de mudança/saída; não presumir feriados |
| Totais e desempenho | Alcance parcial explícito, carga completa sob consulta | Índice operacional autorizado, consulta pessoal completa e medição com volume real |
| Empresas e parâmetros | Origem preservada e edição auditada | Reconciliar identificações pendentes e snapshot atualizado, campo a campo |
| Fórmulas e opções | Valores importados preservados | Obter expressões, dependências, opções e condições; comparar vazios, erros, limites e arredondamento |
| Anexos | Links preservados | Inventário de binários, autorização de leitura, hashes/contagens e armazenamento privado com autorização por carteira |
| Checklist | Prévia validada por esquema | Credencial configurada, mapeamento confirmado, replay, entrada/saída/retorno e alterações retroativas sem perda histórica |
| Automações | Geração recorrente com prévia e proteção contra duplicidade | Gatilhos/condições/ações reais, fila idempotente, retries e auditoria; nenhuma comunicação real em teste |
| Operação e corte | Deploy candidato com health e promoção | Testar restauração, reconciliar delta final, definir fonte de escrita e aceite explícito |

## Ordem de execução

1. Publicar e conferir a experiência visual, preservando dados e acessos atuais.
2. Inspecionar a empresa 1200: identidade, equipe, parâmetros, documentos, controles e vigência. Registrar ausência como pendência, não como falha corrigida.
3. Obter a configuração completa da origem que falta no conector/exportação; documentar expressões, opções e automações antes de implementar equivalência.
4. Implementar e testar integrações a partir desses contratos, usando cenários isolados; homologar com colaborador real.
5. Concluir desempenho, restauração e reconciliação final; somente então propor o corte do Jotform.
