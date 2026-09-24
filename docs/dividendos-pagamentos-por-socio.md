# Dividendos: pagamentos por sócio

Mantenha o cadastro societário completo, com participações somando 100%. Em **Distribuição do mês**, o modo inicial é **Informar valor efetivamente pago por sócio**. Preencha o valor de quem recebeu e mantenha zero para quem não recebeu. Os pagamentos devem somar o total distribuído; apenas valores positivos geram beneficiários. A opção de rateio pelos percentuais continua disponível de forma explícita.

Exemplo: total de R$ 400.000,00; cadastro com 99,13% e 0,87%. Para pagamento somente ao primeiro sócio, informe R$ 400.000,00 para ele e zero para o segundo. Não altere as participações nem remova o segundo sócio. Recalcule após alterações. Dados alterados, erro e troca de empresa invalidam o cálculo anterior; pagamentos já adicionados devem ser removidos da lista antes de uma nova inclusão.

O botão de e-mail usa somente a empresa ativa e o endereço preenchido no campo **E-mail Reinf do cliente**. Antes do envio apresenta empresa, CNPJ, destinatário, competência e texto. A API exige uma empresa explícita e confirmação correspondente à prévia; não há envio geral quando a lista é omitida. A competência de solicitação refere-se ao e-mail; a competência fiscal e a data de pagamento pertencem aos campos do R-4010.

Os testes de e-mail usam transportador simulado, sem mensagens reais. O ajuste não modifica registros fiscais existentes, saldos de ATA nem o cadastro societário dos clientes.
