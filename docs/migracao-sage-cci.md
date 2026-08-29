# Plano de transição SAGE IOB Contábil → CCI

## Decisão e política de uso

A migração é tecnicamente viável, condicionada à validação de amostras reais dos arquivos exportados pelo SAGE, do plano de contas e dos relatórios de conferência.

**SAGE permanece como acervo histórico somente leitura para exercícios anteriores.**

**CCI passa a ser o sistema de registro oficial somente após aceite formal.** Até esse aceite, nenhum período será encerrado no CCI e nenhuma rotina de migração poderá alterar ou excluir dados já existentes.

A versão do PostgreSQL utilizada pelo SAGE é uma premissa informada e deve ser confirmada no inventário técnico. Ela não impede a migração, porque a fonte preferencial são os arquivos e livros oficiais exportados pelo sistema, e não uma escrita direta no banco legado.

## Escopo recomendado

| Período | Conteúdo no CCI | Regra |
| --- | --- | --- |
| Meses anteriores do exercício corrente | Lançamentos contábeis detalhados, lotes, históricos e centros de custo | Importação por lote, com conciliação antes da liberação |
| Exercícios anteriores encerrados | Saldos finais por conta e respectivos saldos iniciais do exercício seguinte | Manter o detalhe completo no SAGE para consulta; importar detalhe no CCI somente quando houver necessidade legal ou operacional validada |
| Novo período após o corte | Operação oficial no CCI | SAGE bloqueado para novos lançamentos e mantido somente para consulta |

## Hierarquia das fontes

1. ECD/SPED e arquivos oficiais TXT exportados pelo SAGE.
2. Relatórios estruturados CSV/XLS do Razão, Diário, Balancete, plano de contas e centros de custo.
3. Leitura direta do PostgreSQL em modo somente leitura, apenas se os arquivos oficiais não contiverem os campos necessários, com fotografia do esquema e consulta versionada.

PDF serve para conferência humana, não como fonte principal de lançamento.

## De-para obrigatório

O arquivo `docs/templates/de-para-sage-cci.csv` é a matriz inicial. O mapeamento deve cobrir:

- empresa e CNPJ;
- código e reduzido da conta, descrição e natureza;
- centro de custo;
- código de histórico e histórico complementar;
- participante/terceiro quando aplicável;
- lote, documento, data, competência e moeda;
- conta anterior e conta vigente quando houve evolução do plano.

Cada linha deve ter status explícito: `PENDENTE`, `VALIDADO`, `BLOQUEADO` ou `NAO_APLICAVEL`. Itens pendentes ou ambíguos não podem ser importados automaticamente.

## Fluxo de migração

1. Inventariar empresas, exercícios, competências, plano de contas e formatos de exportação.
2. Definir a data de corte e congelar novos lançamentos no SAGE a partir dela.
3. Exportar as fontes e registrar nome, tamanho, data e hash SHA-256 de cada arquivo.
4. Carregar os dados em uma área de preparação, sem gravar na contabilidade oficial.
5. Aplicar o de-para e gerar uma prévia com rejeições separadas.
6. Validar e conciliar por empresa, competência, conta e lote.
7. Obter aceite formal do responsável contábil.
8. Importar em lote no CCI, registrar o evento de corte e habilitar a operação oficial.
9. Manter o SAGE somente leitura e preservar os arquivos-fonte e relatórios de aceite.

## Critérios mínimos de aceite

- CNPJ, empresa, competência e layout identificados antes da persistência.
- Soma dos débitos igual à soma dos créditos por lote e competência.
- Quantidade de lançamentos e totais por conta iguais à origem.
- Balancete, Razão e Diário conciliados com os relatórios do SAGE.
- Continuidade entre saldo final do exercício anterior e saldo inicial seguinte.
- Nenhuma conta, histórico ou centro de custo sem de-para validado.
- Importação idempotente: o mesmo arquivo/lote não pode ser importado duas vezes.
- Amostra rastreável do relatório do CCI até a chave original do SAGE.
- Aprovação assinada pelo responsável contábil e pelo administrador do CCI.

## Rastreabilidade e retorno seguro

Todo registro migrado deve guardar `origem=MIGRACAO_SAGE`, identificador do lote, hash do arquivo, chave original, data/hora e usuário importador. O retorno é feito pelo lote de migração, nunca por exclusão ampla ou correção automática. Erros devem produzir rejeição e relatório; não devem ser substituídos por valores inventados.

## Fases de implementação no CCI

1. **Diagnóstico:** coletar amostras e fechar o dicionário dos formatos.
2. **Importador em prévia:** leitura, de-para, validações e relatório de rejeições sem persistência.
3. **Importação controlada:** gravação por lote com idempotência, auditoria e reversão.
4. **Conciliação:** painel comparativo SAGE × CCI e termo de aceite.
5. **Corte:** bloqueio de competências anteriores, CCI oficial e SAGE somente leitura.

## Contrato do executor controlado

O painel usa dois arquivos diferentes: o arquivo-fonte original, cujo SHA-256 é
calculado localmente, e o pacote estruturado conforme
`docs/templates/pacote-lancamentos-sage.json`. O pacote não substitui a fonte e
não autoriza inferências; ele apenas transporta as chaves originais, partidas,
históricos, centros de custo, competência e totais oficiais necessários para o
staging.

O staging é identificado pelo hash canônico do conteúdo, é imutável e pode ser
repetido sem duplicação. Somente administrador pode aplicar ou reverter. A
aplicação exige `MIGRAR`, termo de aceite, responsável contábil e evidência; o
rollback exige `REVERTER`, motivo e uma sessão ainda idêntica ao hash posterior
à aplicação. Se houver qualquer edição depois da migração, a reversão
automática é bloqueada para não apagar trabalho posterior.

## Evidências necessárias para o piloto

- uma empresa piloto e seu CNPJ;
- plano de contas completo;
- Balancete, Razão e Diário do mesmo mês em formato estruturado;
- ECD/TXT ou exportação equivalente do mesmo período;
- relatório de saldos de encerramento do último exercício;
- lista de centros de custo e históricos padronizados;
- dicionário ou fotografia somente leitura das tabelas do SAGE, se os arquivos não forem suficientes.
