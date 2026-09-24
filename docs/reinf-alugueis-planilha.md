# Aluguéis por planilha

Acesso: **Obrigações → EFD-Reinf → Rendimentos pagos/créditos R-4000 → Aluguéis por planilha**.

1. Ative a empresa responsável pela administração da planilha e selecione o XLS/XLSX mensal.
2. Confira as abas: **PJ paga a PF**, **PF paga a PF / Carnê-Leão** e **Proprietário PJ**. O modelo reconhece `IR PF x PJ`, `IR PF x PF` e `IR PJ x PJ` pelos respectivos cabeçalhos. A competência vem de “PAGO EM …”, sem depender do nome do arquivo.
3. Em **Proprietários e participações**, confira os nomes/percentuais da planilha e complete os CPFs. O administrador pode salvar a parametrização na empresa ativa. Nos próximos arquivos, o cadastro recupera os CPFs pelos nomes; os percentuais continuam vindo da planilha.
4. Selecione uma fonte pagadora. Abra o detalhamento do pagamento e confira bruto, base tributável e IRRF por proprietário. O bruto sugerido é distribuído pela participação, preservando centavos. A retenção positiva não é rateada; informe o valor de cada beneficiário a partir do demonstrativo. A soma deve coincidir com a planilha. A base tributável exige preenchimento, sem dedução automática de IPTU, taxa de administração ou reparos.
5. Marque a conferência e clique em **Preparar R-4010 da fonte selecionada**. O cadastro da fonte deve existir no CCI e estar acessível ao usuário. O CNPJ da fonte será mostrado nos campos do Reinf; ele não é substituído pelo da administradora. A etapa apenas carrega beneficiários para revisão, sem transmissão.
6. Feche o modal e utilize a prévia do R-4010. Cada recebimento conserva sua data. Recibos, retificações, certificado e transmissão seguem o fluxo existente.

**Exportar conferência CSV** disponibiliza os dados lidos, aba/linha e pendências. É um relatório de revisão, não um arquivo de transmissão ou de importação no Carnê-Leão Web.

## Conferências do modelo

- “Não pagou” não gera pagamento.
- Datas ausentes, inválidas ou múltiplas exigem correção na planilha antes de preparar R-4010. Não há escolha automática da última data.
- Descontos, acréscimos ou recebimentos diferentes do aluguel previsto ficam destacados. A observação da revisão é obrigatória; ela não substitui dados monetários ausentes nem resolve somas divergentes.
- CPF inválido, participação diferente de 100%, base/IRRF ausente, somas divergentes e repetição de pagamento bloqueiam a preparação.
- Aluguéis recebidos de PF e de propriedade de PJ permanecem na conferência e não geram beneficiários PF por este fluxo. Não há recálculo do imposto previsto na planilha.
- Valores de revisão ficam apenas na sessão aberta. O botão de parametrização salva os proprietários, não a apuração mensal nem a planilha.

## Arquivo de referência

O arquivo de agosto/2026 fornecido contém 23 linhas de locação (6 PJ para PF, 16 PF para PF e 1 proprietário PJ), 3 registros “não pagou” e 5 proprietários sem CPF. Há uma data múltipla e divergências de recebimento, inclusive compensação de reparos. Ainda são necessários o cadastro/identificação do cliente, os CPFs e o demonstrativo da retenção individual para concluir sua parametrização fiscal.

Referência oficial: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/2-eventos-da-efd-reinf/2-13-9-e-necessario-informar

## Prestação de contas e atualização do IR

Dentro do modal, abra **Conferir prestação de contas e calcular IR mensal**. É possível selecionar até oito planilhas de apoio. A conferência recalcula aritmética, referências internas e somas verticais, mostra erros de fórmula, diferenças entre valores arredondados e totais, pagamentos repetidos e datas ausentes/múltiplas. Fórmulas externas ou não suportadas são contadas explicitamente como não conferidas. O relatório não certifica a integridade de toda a planilha nem altera os arquivos. Para o modelo PEC, verifica a taxa identificada como 20% sobre aluguéis sem IPTU, a equação de fechamento e o resultado de aluguéis entre prestações do mesmo período.

A data real do repasse é lida da prestação e não é presumida pelo início do mês nem pelo rodapé. Para tributação do aluguel, a referência é o pagamento do locatário ao proprietário ou à administradora. Repasse, recebimento e distribuição de lucros não são intercambiáveis. Fonte: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/rendimentos

A conferência mensal de IR recebe o rendimento tributável do CPF após exclusões de aluguel comprovadas, as deduções legais mensais e, opcionalmente, o imposto informado. A opção simplificada compara as deduções legais com o desconto simplificado, sem somá-los. A redução usa o rendimento tributável, antes dessas deduções mensais. Agregue PF/exterior no Carnê-Leão e a mesma fonte pagadora/CPF/mês no IRRF; considere outros rendimentos. A simulação não atribui automaticamente retenções aos proprietários, não transforma repasses em renda tributável e não altera eventos.

A tabela é consultada pelo servidor na página anual da Receita ao calcular, com cache de seis horas. Faixas, deduções e redução são extraídas da seção mensal, conferidas estruturalmente e guardadas com hash de versão e data de consulta. Valores publicados no mesmo formato passam a valer nas consultas seguintes sem deploy. Mudanças de estrutura/regra, múltiplas vigências não suportadas, ano sem cobertura ou indisponibilidade suspendem o cálculo com aviso; não há fallback silencioso para tabela vencida. A cobertura é limitada ao ano e início de vigência explicitamente extraídos. A interface informa a versão e fonte utilizadas. O módulo de conferência não substitui os demais importadores de IR existentes no CCI.

## Modelo de igrejas (CAIXA / código 3208)

O mesmo modal reconhece o cabeçalho Localidade, CNPJ, Código (CDG), Nome (Proprietário), CNPJ (Proprietário), Apuração, Bruto, IRRF e Líquido, independentemente do nome das abas ou do mês. Cabeçalhos repetidos e totais sem identificação não viram pagamentos. Os proprietários são individuais; não há cadastro de percentuais nem rateio neste modelo.

Selecione o XLSX, escolha a fonte pagadora e confira cada pagamento PF: data real, base tributável e retenção preservada. Apuração define apenas a competência. Divergências de bruto/IRRF/líquido exigem justificativa; valores ausentes e documentos inválidos devem ser corrigidos na origem. Proprietários PJ ficam em aba de conferência. O CNPJ da empresa aberta nunca substitui o CNPJ da planilha; a preparação valida acesso à fonte escolhida. Nenhum evento é transmitido pela importação.

Regressão de agosto: 88 linhas, 70 PF e 18 PJ, cinco fontes, bruto R$ 545.130,77 e IRRF informado R$ 24.757,41. Dez linhas apresentam diferença entre bruto menos IRRF e líquido; outras 14 têm IRRF vazio. Fixture com nomes, locais e documentos dos beneficiários anonimizados. Testes também verificam outro mês, ausência de data/base, isolamento por fonte e preservação do modelo PEC.
