# CCI — notificacoes documentais SharePoint (fase 1)

## Escopo implementado
Modulo puro `crm-sharepoint-notificacoes.js`: vinculo canonico CNPJ/pasta, resolucao de arquivo dentro da pasta, responsavel principal e apoios por UID ativo, gestor por equipe delegada, contato externo explicitamente autorizado e confirmado. Falhas de vinculo, identidade ou cadastro interrompem a preparacao. Resultado sempre `pendente_validacao` e `envio_realizado: false`.

A fonte de carteira continua sendo o CCI (empresas, users e crm_topologia/gestao); o modulo recebe esses dados de um adaptador futuro. Nao ha base paralela nem acesso direto ao Firestore nesta fase.

## Pendente para a fase 2
1. Definir esquema persistido dos vinculos SharePoint (identificador estavel de drive/item, tenant/site, biblioteca e CNPJ), contatos autorizados por empresa/departamento e preferencias de canais.
2. Implementar ingestao autenticada de eventos Microsoft Graph/SharePoint com deduplicacao, assinatura/autorizacao, checkpoint, tratamento de move/delete e reconciliacao. URL isolada nao e identidade estavel de arquivo.
3. Revalidar autorizacao de carteira e permissao real de compartilhamento no momento do envio; nao compartilhar arquivos por efeito colateral.
4. Criar fila transacional, estados de entrega e logs de auditoria; integrar Teams/e-mail e WhatsApp via provedor autorizado. Impedir envio cruzado entre empresas.
5. Testes com usuario restrito, transferencia de carteira, contato revogado, links compartilhados e evento duplicado; homologar antes de ativar.

Nao ha gatilho Power Automate, Graph, credenciais, fila, endpoint HTTP, mensagens reais ou alteracao de dados de producao nesta entrega.
