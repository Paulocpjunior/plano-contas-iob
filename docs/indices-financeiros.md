# Modelos de índices nos relatórios

1. Selecione a empresa e abra **Relatórios contábeis**.
2. Escolha **Índice Financeiro** ou **Índice de Endividamento**.
3. Se já houver demonstrativos cadastrados, selecione o período. Para outra base, clique em **Novo período**.
4. Informe as datas inicial e final dos demonstrativos. Preencha os saldos finais do balancete e os resultados acumulados da DRE do mesmo período, em reais.
5. Informe a fonte: nome do arquivo, páginas e contas usadas. Registre particularidades em Observações e clique em **Salvar bases desta empresa**. O formulário permanece aberto se não houver confirmação do salvamento online.
6. Confira fórmulas, bases e notas. Use **Exportar PDF**, **Visualizar impressão** ou **Exportar Excel**. Para revisar uma base já salva, use **Conferir / editar bases**.

Os modelos estão disponíveis a todas as empresas com acesso aos relatórios. As bases ficam na sessão privada de cada CNPJ, por período. Os dois modelos compartilham a mesma base do período. Salvar uma base não cria lançamentos nem altera saldos de abertura. O preenchimento de novas empresas é manual, com demonstrativos conferidos; esta versão não importa PDFs automaticamente.

## Critérios

- Campo vazio significa não informado; zero é um valor explícito. Indicadores sem base suficiente aparecem como **N.D.**, com motivo.
- Não use o sinal contábil credor como sinal negativo: passivos e receitas normais são valores positivos. Use sinal negativo para prejuízos ou PL negativo; saldos de natureza invertida precisam refletir seu efeito econômico.
- Liquidez corrente: AC / PC; seca: (AC − estoques) / PC; imediata: disponibilidades / PC; geral: (AC + RLP) / (PC + PNC).
- Capital circulante líquido: AC − PC. Margens: resultado bruto ou líquido / receita líquida × 100. Giro: receita líquida / ativo final, explicitamente sem saldo médio ou anualização.
- Endividamento geral: (PC + PNC) / ativo × 100. Composição: PC / (PC + PNC) × 100. Capital de terceiros / PL informado: (PC + PNC) / PL × 100. Dívida financeira / ativo: empréstimos e financiamentos de curto e longo prazo / ativo × 100. Solvência geral: ativo / (PC + PNC).
- Denominador nulo ou negativo resulta em **N.D.**. O resultado do exercício não é adicionado automaticamente ao PL. Diferenças entre ativo e PC + PNC + PL aparecem como nota, sem ajuste da escrituração.
- A classificação e o escopo seguem os demonstrativos informados. Registre inclusão de estoques de terceiros, outras receitas ou obrigações com sócios nas notas para evitar interpretações incorretas.

## Validação técnica

`npm run test:indices-financeiros` cobre cálculos, perdas, zeros, bases ausentes, datas, fonte, exportação e isolamento por CNPJ. A prévia de índices não calcula o balancete transacional. PDF e Excel usam a mesma memória de cálculo da tela.

Os PDFs de origem e bases reais de clientes não integram os arquivos públicos do aplicativo. A implantação inicial usa backup verificável da sessão, revisão concorrente e auditoria; esses dados são armazenados somente no ambiente privado da empresa.
