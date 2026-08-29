# Observabilidade operacional do CCI

Configuração implantada em 29/08/2026 no projeto de runtime
`gen-lang-client-0569062468`. O provisionamento é idempotente e está em
`scripts/provision-observability.sh`.

## SLOs e alertas

| Fluxo | SLO/gatilho | Evidência |
|---|---|---|
| Saúde pública | `/api/health` disponível e com `"status":"ok"`; alerta após 2 min | uptime em 3 regiões |
| API | mais de 2 respostas 5xx/min | métrica nativa do Cloud Run |
| Sessão | p95 menor ou igual a 2.000 ms; alerta por 5 min acima da meta | distribuição `cci_session_latency_ms` |
| Sessão/concorrência | qualquer falha de sessão ou mais de 3 HTTP 409/min | `cci_session_failures` e `cci_http_409` |
| Importação/parser | qualquer resposta de falha | `cci_import_failures` e `cci_parser_failures` |

As políticas abrem incidentes no Cloud Monitoring. Não há canal externo de
notificação cadastrado no projeto; e-mail, Slack ou plantão deve ser adicionado
somente com destinatário e escala definidos pelo responsável operacional.

## Privacidade e correlação

A aplicação emite JSON estruturado somente para sessão, importação, parser,
falhas ou requisições lentas. O evento contém fluxo, método, status, latência,
resultado, revisão e `request_id`; não contém URL, CNPJ, e-mail ou UID. O mesmo
identificador é devolvido no header `X-Request-Id` para correlação segura.

## Verificação

1. Conferir `/api/health` e `/api/version` públicos.
2. Conferir que o uptime `CCI produção - API health` está ativo.
3. Conferir as cinco políticas com o prefixo `CCI -`.
4. Para um incidente, filtrar no Cloud Logging por
   `jsonPayload.event="cci_http_request"` e pelo `request_id` informado.
5. Não reduzir limites ou desativar políticas para ocultar incidência; corrigir
   a causa e registrar a resolução no quadro de pendências.
