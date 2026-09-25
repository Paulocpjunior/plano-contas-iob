# Itaú — validação dos extratos de maio a agosto de 2026

Empresa: Técnica Denardo Comercial. Arquivos: `EXTRATO ITAU MM-2026.pdf`.

| Mês | Movimentos | Dias conciliados | Saldo anterior | Saldo final |
| --- | ---: | ---: | ---: | ---: |
| Maio | 197 | 20 | 121.443,80 | 113.155,37 |
| Junho | 200 | 21 | 113.155,37 | 102.006,31 |
| Julho | 206 | 22 | 102.006,31 | 161.211,42 |
| Agosto | 188 | 21 | 161.211,42 | 200.095,77 |

A leitura esparsa passa a ser tentada também no modelo sem linhas de aplicação automática. Quando existem vários saldos diários no OCR, todos precisam conciliar; nos modelos com saldo da conta corrente, as duas conferências são obrigatórias.

O parser preserva movimentos iguais em linhas físicas distintas (três recebimentos de R$ 100,00 em 25/05). Células de débito cujo OCR perdeu o sinal são relidas por inteiro, pois podem ter perdido também um dígito (R$ 1.131,78 em 07/07). A cor continua definindo a natureza. Uma releitura opcional ilegível preserva o token completo da primeira leitura, sujeito à conciliação.

Se o OCR da célula não reconhecer um número completo, a última tentativa separa os glifos visíveis. Só aceita a vírgula impressa abaixo da base dos dígitos, com exatamente dois dígitos à direita; cada dígito é reconhecido individualmente. Não há recuperação de valores por diferença de saldo nem regras por empresa, mês ou valor.

As fixtures guardam a leitura capturada no navegador e o SHA-256 do PDF. `scripts/test-itau-denardo-maio-agosto.js` verifica movimentos, saldos, repetições legítimas e bloqueios por saldo diário ausente ou alterado. As regressões de fevereiro, março e abril permanecem obrigatórias.

Para conferir no aplicativo: atualizar a página, selecionar **Automático**, importar o PDF e revisar a prévia antes de incluir os lançamentos. Os testes do parser não gravam lançamentos no cliente.
