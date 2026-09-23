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
