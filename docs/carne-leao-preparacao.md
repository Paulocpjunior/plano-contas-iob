# Preparação do Carnê-Leão por proprietário

Em **Obrigações → Aluguéis por planilha → PF paga a PF · Carnê-Leão**, selecione o proprietário no painel **Preparar Carnê-Leão**. Complete seu CPF em Proprietários e participações. As participações devem totalizar 100%; os demais CPFs podem ser completados quando os respectivos proprietários forem preparados.

1. Abra **Conferir recebimentos do proprietário**. O rateio sugerido usa o total efetivamente recebido, inclusive IPTU. Informe as exclusões comprovadas atribuíveis ao proprietário e justifique-as. A taxa de administração não é abatida automaticamente.
2. Para datas múltiplas, use **Separar mais um pagamento**. A soma deve fechar com a participação do proprietário no recebimento original. Corrija valores ou CPFs errados na planilha e importe novamente; não marque um pagamento como conferido para ignorar uma divergência.
3. Informe outros rendimentos PF/exterior e deduções legais mensais, se aplicáveis. O cálculo usa a mesma tabela oficial da conferência mensal e compara o desconto simplificado uma única vez no mês.
4. Clique em **Preparar Carnê-Leão do proprietário**. Confira o resumo e baixe o CSV e a memória JSON. Alterar os dados invalida os arquivos preparados. Trocar a aba ou o proprietário reinicia a revisão; baixe a memória antes.
5. No Carnê-Leão Web do CPF selecionado, use **Escrituração → Importar Escrituração → Analisar arquivo**. Confira todas as linhas antes de importar. Reimportar adiciona registros e pode duplicar recebimentos.

O CSV contém exclusivamente os aluguéis PF do proprietário, sem cabeçalho, separado por ponto e vírgula, com código R01.003.001 e 13 colunas. Exclusões de cada recebimento ocupam a coluna de dedução; o desconto simplificado e as deduções mensais não são repetidos por lançamento. Outros rendimentos e deduções mensais usados na memória devem ser informados/conferidos também no portal.

Esta etapa prepara arquivos localmente; não salva declaração no servidor, não transmite à Receita e não emite DARF. O formato foi conferido com a documentação oficial; a aceitação final deve ser verificada em **Analisar arquivo** no portal.

Referências consultadas em 25/09/2026:
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/manual/formato-arquivo
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/manual/rendimentos
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/manual
