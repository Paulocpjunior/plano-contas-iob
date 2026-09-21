# Consultor Contábil (plano-contas-iob) — SP Assessoria Contábil

App contábil: conciliação bancária, plano de contas, ECD/ECF, exportação IOB SAGE e o módulo **EFD-Reinf**. É irmão do **CFI** (`consultor-fiscal-inteligente`), que é o fiscal. "IOB", no vocabulário do Paulo, é ESTE app.

## Regras de ouro (sempre)

- **Nunca faça commit, push ou deploy sem aprovação explícita do Paulo.**
- **Nunca commite direto na `main`.** O fluxo é branch → PR → squash-merge. O `deploy-app.yml` publica sozinho no merge.
- Trabalho novo sai da `main`, nunca de branch paralela de longa vida.
- Antes de mexer, confira se a `main` é o que está no ar (`version.json` × rodapé do app).
- Nunca altere URLs, domínios, DNS ou domain mapping sem pedido explícito.
- Chave ou segredo **nunca** trafega pelo chat.
- Respostas diretas, sem preâmbulo. Comandos em blocos prontos para colar no terminal.
- **Este arquivo é carregado em toda sessão. Mantenha-o enxuto (menos de 150 linhas).** Não registre aqui histórico de sessões, narrativas ou incidentes. O histórico completo está em `docs/historico-claude.md`. Consulte-o com `grep -n "termo" docs/historico-claude.md`, **nunca lendo o arquivo inteiro**. Registros novos de sessão devem ser anexados lá, de forma resumida.
- **Economize contexto:** filtre saídas longas (`| tail -50`, `grep -i error`). Nunca leia o `index.html` inteiro (~920 KB): use `grep -n` e leia só o trecho necessário. Não leia `node_modules/` nem `package-lock.json`.

## Stack

- Node + Express monolítico, **CommonJS** (`require`, `module.exports`).
- **Sem build de frontend:** o Express serve o `index.html` (SPA em JS inline). Não existe React/Vite aqui.
- **São dois projetos GCP, não confunda:**
  - **Cloud Run** → `gen-lang-client-0569062468`, serviço `plano-contas-iob`, região `us-west1`.
  - **Firestore** → `projetos-app-sp`, fixo no `server.js`.
- Não compartilha banco nem login com o CFI (que usa `consultorfiscalapp`). A integração é por rota. Env: `CFI_URL`, `FISCAL_GATEWAY_URL`.
- A fonte da verdade do deploy é `scripts/deploy-production.sh`.
- Erro "API não habilitada" costuma significar **projeto errado**, não API faltando. Compare o número do projeto (`gcloud projects describe <p> --format='value(projectNumber)'`) com o número citado na mensagem.

## Deploy e qualidade

- O deploy sobe a candidata com `--no-traffic --tag candidate`, confere `GET /api/health` e só então roteia o tráfego pela revisão validada.
- Merge verde não é prova. Confirme com `curl $APP/api/version` × `version.json`, e verifique se a tela nova aparece no HTML servido.
- Quality gate: `npm run check:ci` no CI e `npm run check` local. O resumo sempre informa quantos testes foram PULADOS.
- Não há framework de teste. Os testes são `scripts/test-*.js` com `require('assert')`. Módulo novo = teste novo registrado em três lugares do `package.json` no MESMO PR: `test:<nome>`, a lista do `node --check` e o encadeamento do `check`.
- `npm audit --omit=dev` bloqueia só produção. Escape hatch: `[skip-audit]` no assunto do commit.
- Nunca commite marcador de conflito. Rode `node --check` antes de todo commit.
- Nunca digite URL de Cloud Run. Derive com `gcloud run services describe <svc> --region <r> --project <p> --format='value(status.url)'`.

## Código

- Módulos de lógica são puros e testados. Rotas fazem apenas I/O.
- Mensagens de erro ao usuário: em português, com a AÇÃO prática.
- O dono de um limite de leiaute (tamanho de campo etc.) é o **gerador**, nunca a rota.
- Arquivos IOB SAGE / Folhamatic: largura fixa, Windows-1252, CRLF. Use `iconv-lite`.
- Faturas Itaú concatenam as descrições sem espaço. Use `\bPALAVRA` (fronteira só no início), nunca `\bPALAVRA\b`.
- Firestore rejeita `undefined`: sanitize os payloads antes de gravar.

## Regras de conteúdo fiscal (valem aqui como valem no CFI)

- **Alerta, nunca contorno:** cadastro errado ou faltando gera um alerta que diz ONDE corrigir. Nada de auto-preenchimento ou dedução "esperta".
- **Ausente ≠ zero:** campo de valor não recebe default. Zero só entra quando zero É a resposta.
- **Leiaute não se chuta:** XSD do REINF e leiaute do SPED só entram conferidos (`docs/reinf/xsd`) ou com um arquivo real aceito de espelho.
- **Farol honesto:** zero nunca é sucesso, lista cortada diz "mostrando X de N" e ausência de sinal nunca vira prontidão.
- Na dúvida, o dado que o CFI já apurou vem do CFI. Não recalcule aqui (ex.: retenções do R-4020, fechamento do mês).

## Estado do EFD-Reinf, pendências e decisões

Tudo isso está em `docs/historico-claude.md`. Localize as seções com:

```bash
grep -n "^##" docs/historico-claude.md
```

Depois leia só o intervalo necessário com `sed -n 'INICIO,FIMp'`.
