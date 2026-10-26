# Importação direta FI IOB/SAGE

Disponível para todas as empresas com acesso à ação de importação. Na tela **Importar Extrato ou Lançamentos**, abrir **Importar FI IOB/SAGE**, selecionar o arquivo, conferir as partidas e confirmar a empresa de destino. Não exige escolher um banco.

O arquivo não contém CNPJ. Não se deduz empresa pelo nome do arquivo: a confirmação explícita do destino é obrigatória. Os códigos reduzidos precisam existir de forma única como contas analíticas no plano vinculado à empresa. Ausência, ambiguidade, período incompatível e competência encerrada bloqueiam a gravação.

## Contrato homologado

Espelho: gerador `exportIOB()` do CCI e arquivo FI financeiro fornecido para homologação, sem incorporar dados reais ao repositório. Windows-1252, registros de 328 posições, CRLF (leitura também aceita LF). Não confundir com FPIMP da folha. Limite de 2 MB (front, rota e `lerFI`; o JSON da rota cabe no limite padrão de 8 MB do `http-hardening.js`).

| Posições (base 1) | Conteúdo |
| --- | --- |
| 1–5 | Reservado em branco |
| 6–23 | Conta reduzida de débito |
| 24–41 | Conta reduzida de crédito |
| 42–45 | Código de histórico |
| 46 | Espaço |
| 47–58 | Valor inteiro em centavos, 12 dígitos |
| 59–68 | Data DD/MM/AAAA |
| 69–74 | Reservado em branco |
| 75–217 | Complemento de histórico |
| 218–237 | Digitador |
| 238–257 | Tipo de movimento 8 |
| 258–327 | Campos de centro de custo/rateio: precisam estar em branco nesta versão |
| 328 | Tipo de digitação N |

Variantes não homologadas geram erro de linha, sem importação parcial. Partidas compostas e rateios não são convertidos por aproximação.

## Conferência e persistência

A prévia mostra todas as partidas, descrições das contas do plano, datas, histórico e total de cada lado. Linhas iguais dentro do arquivo são preservadas com identificadores distintos. Semelhanças com lançamentos existentes exigem confirmação adicional; não constituem prova automática de duplicidade. O mesmo arquivo (incluindo mudança apenas de quebra de linha ou nome) é bloqueado pela impressão digital na sessão.

A confirmação relê o arquivo e o plano, adquire a trava da sessão, confere a impressão digital da prévia e acrescenta as partidas à sessão atual, preservando lançamentos anteriores. A trilha em `auditoria_contabil` registra usuário, horário, quantidade e impressão digital, sem valores. Os lançamentos guardam linha de origem, digitador e histórico.

O valor da partida é positivo e os lados contábeis são preservados explicitamente. A origem `CONTABIL_FI` é contábil, não um extrato bancário; os totais da prévia são débitos e créditos, não fluxo de caixa.

## Validação local

- Testes sintéticos: `npm run test:importacao-fi` (parser, plano, período, acesso, sessão concorrente, confirmação, preservação e reimportação).
- Anexo real: 288 partidas, 22 linhas repetidas, 02/01/2026 a 31/01/2026, totais de débito/crédito de 4.928.989 centavos cada.
- Chrome local: prévia integral e confirmação testadas com API e plano sintéticos; nenhuma gravação de produção.
- A homologação do plano da empresa real ocorre na prévia autenticada após publicação. Nenhuma conta foi criada ou presumida no cadastro.
