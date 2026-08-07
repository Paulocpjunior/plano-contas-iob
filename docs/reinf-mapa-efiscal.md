# EFD-Reinf — mapa do E-Fiscal SAGE × estado do módulo (03/08/2026)

> Origem: varredura do menu REINF do E-Fiscal feita no projeto do CFI
> (prints do Paulo, 02-03/08 — inventário completo em
> `consultor-fiscal-inteligente/docs/inventario-relatorios-efiscal.md`).
> Este arquivo é o roadmap do módulo `reinf/` deste app.

## O que o módulo JÁ cobre

| Evento | Estado |
|---|---|
| R-1000 (contribuinte) | ✅ gera + assina + transmite |
| R-4010 (rendimentos PF — dividendos, aluguel, planilha) | ✅ ponta a ponta |
| R-4099 (fechamento R-4000) | ✅ |
| Recibos de entrega / consulta de lote | ✅ (equivale ao submenu "Relatórios" do E-Fiscal: Recibos de Entrega · Rendimentos Enviados) |

## O que o E-Fiscal tem e o módulo ainda não (ordem sugerida)

| Evento | O que é | Fonte de dados pronta |
|---|---|---|
| **R-4020** (rendimentos PJ — IR/CSLL/PIS/COFINS retidos) | próximo alvo natural: mesma série já dominada | **CFI → relatório de Retenções** (NFS-e tomados, por prestador, com IR/INSS/CSLL/PIS/COFINS) |
| **R-2010** (serviços TOMADOS c/ INSS) / R-2020 (prestados) | retenção previdenciária de serviços + R-2099 (fechamento periódico) | CFI → NFS-e capturadas (valores.inss) |
| **R-2055** (aquisição de produção rural) | FUNRURAL por sub-rogação do adquirente | **CFI → aba 🌾 DIPAM/Produtor rural** (calcula por competência, com vigência de alíquota) |
| R-2050 (comercialização produtor PJ/agroindústria) | só se houver cliente produtor PJ | CFI → cadastro condicaoRural |
| R-1070 (processos adm./judiciais) | tabela auxiliar, sob demanda | manual |
| R-4040 (beneficiário não identificado) · R-4080 (autorretenção) | casos raros | manual |

## Natureza do rendimento (Tabela 01 do Anexo I) — PRONTA 07/08

`reinf/natureza-rendimento.js`: as **51 naturezas da série 15xxx** (serviços de
PJ → R-4020), com o código de receita do DARF por tributo (IR → 1708 e outros;
AGREGADO → **5952**, a CSRF com CSLL+PIS+Cofins juntos) e a correlação com os
itens da lista de serviços da LC 116/2003.

Origem: tabela de correlação da IOB (arquivo de 07/08/2026, entregue pelo
Paulo), carimbada em `ORIGEM_TABELA`. Antes disso o módulo tinha 4 constantes
soltas, **todas de pessoa física** — nenhum código de PJ existia no app.

**A tabela SUGERE, NUNCA DECIDE.** A ressalva é do próprio documento de origem:
não existe correlação OFICIAL entre a LC 116 e a natureza do rendimento, a
correlação é referência de enquadramento e tem caráter interpretativo. Por
isso `sugerirPorLc116` devolve candidatos (0, 1 ou vários), marca `ambigua`
quando há mais de um, carrega o aviso e NÃO escolhe. Código fora da tabela é
recusado — não repassado para o validador do governo reclamar.

Casos reais que a tabela fecha: serviço 4030 (medicina) → **15026**, que é o
código do print do IOB; serviço 7498 (manutenção) → **15044**, que a ELEVADORES
ORION escreve na própria discriminação da nota.

## Retenções de PJ — conteúdo do R-4020 PRONTO 07/08 (falta só o XML)

`reinf/retencao-pj-apuracao.js`: agrupa as notas TOMADAS por beneficiário e
competência e monta o conteúdo do evento — bruto, IR, PIS, COFINS, CSLL,
natureza. É o passo que a colaboradora faz à mão no E-Fiscal.

**A CSLL não estava perdida.** O export do portal de SP não traz a CSLL
individual: o campo rotulado "CSLL" é o TOTAL das três contribuições (CLINIPAR:
27,44 = 3,84 + 17,70 + 5,90). Como PIS e COFINS vêm corretos, a CSLL sai por
SUBTRAÇÃO — recuperação, não chute. A trava: só deriva quando PIS bate 0,65%,
COFINS bate 3,00% **e** o resultado bate 1,00% da base. Falhou um dos três, não
deriva: vira pendência apontando o XML da nota. Valor derivado sai carimbado.

**A natureza vem da FONTE quando a fonte a traz**: alguns prestadores escrevem
o código na discriminação (a ELEVADORES ORION escreve "15044 - REMUNERAÇÃO DE
SERVIÇOS DE CONSERVAÇÃO"). Ler isso é recuperação — mas só vale se o código
existir na Tabela 01, e dois códigos no texto = ambíguo, não "pega o primeiro".

Beneficiário sem natureza ou com retenção que não fecha **não entra no evento**.

FALTA: o XML. O leiaute do R-4020 ainda não foi conferido contra o XSD — e
leiaute chutado é a classe de erro que passa no teste e é recusada na
transmissão. Com o XSD (ou com um XML que o IOB já tenha gerado), o gerador é
uma casca fina sobre este payload já validado.

## Ganchos de integração com o CFI

Os DOIS apps compartilham o mesmo Firebase/Firestore do escritório. As
contas que alimentam R-4020 e R-2055 JÁ EXISTEM no CFI — a integração é
ler a mesma fonte (ou expor rota no CFI), nunca redigitar.

## Fora do jogo

DIRF está EXTINTA (substituída por esta série R-4000) — qualquer resíduo
de fluxo DIRF no escritório morre quando o R-4020 entrar aqui.
