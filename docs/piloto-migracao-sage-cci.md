# Piloto formal de migração SAGE → CCI

Seleção técnica registrada em 30/08/2026. Este documento define o grupo de
piloto e os gates de aceite; não autoriza completar campos, aprovar saldos ou
fechar competências sem a evidência contábil correspondente.

## Fotografia da carteira

- 146 empresas ativas avaliadas em leitura somente.
- 105 empresas possuem sessão com lançamentos.
- 9 estão marcadas como `cci_exclusivo`, 45 como `ponte_sage` e 92 ainda não
  possuem modo contábil informado.
- Nenhuma empresa possui saldo de abertura aprovado.
- Nenhuma empresa possui piloto iniciado ou homologado segundo o roteiro
  automático do CCI.

## Empresas selecionadas

| Perfil | Empresa | CNPJ | Regime | Modo atual | Lançamentos | Configuração | Motivo da seleção |
|---|---|---:|---|---|---:|---:|---|
| Presumido / menor volume | UIRA CONSULTORIA AMBIENTAL | 13.992.465/0001-18 | Lucro Presumido | CCI exclusivo | 300 | 67% | Já está no modo definitivo e representa operação menor de serviços. |
| Simples / maior volume | SAINT PATRICK BAR-RESTAURANTE | 96.616.974/0001-73 | Simples Nacional | Ponte SAGE | 2.331 | 75% | Valida comércio/alimentação, Simples e volume relevante. |
| Real / maior complexidade | CLUDE CARTÃO DE SAÚDE 360 LTDA | 32.922.514/0001-90 | Lucro Real | Não informado | 3.943 | 50% | Valida Lucro Real, retenções/serviços e o maior volume do grupo. |

Os volumes acima vêm do resumo da sessão atual e servem para dimensionar o
piloto; eles não substituem a conferência de quantidade e totais SAGE × CCI.

## Gates individuais

### UIRA CONSULTORIA AMBIENTAL

1. Concluir a parametrização do regime tributário comprovada pela fonte CFI.
2. Informar, conferir e aprovar os saldos de abertura de `2026-01`.
3. Cadastrar ao menos uma conta bancária para conciliação formal.
4. Fechar `2026-01` e `2026-02` consecutivamente.
5. Aprovar conciliações e transportes correspondentes.
6. Anexar comparação SAGE × CCI e aceite contábil responsável.

### SAINT PATRICK BAR-RESTAURANTE

1. Autorizar explicitamente a mudança de `ponte_sage` para `cci_exclusivo`.
2. Conferir parametrização do Simples Nacional e vigência no CFI.
3. Informar, conferir e aprovar os saldos de abertura de `2026-01`.
4. Cadastrar as contas bancárias abrangidas pelo piloto.
5. Fechar `2026-01` e `2026-02` com conciliação e transporte aprovados.
6. Anexar comparação SAGE × CCI e aceite contábil responsável.

### CLUDE CARTÃO DE SAÚDE 360 LTDA

1. Definir o modo contábil e a data inicial; nenhum dos dois será inferido.
2. Completar plano, parametrização do Lucro Real e demais bloqueios do cadastro.
3. Informar e aprovar os saldos de abertura da competência inicial escolhida.
4. Cadastrar as contas bancárias abrangidas pelo piloto.
5. Fechar duas competências consecutivas com conciliação e transporte.
6. Conferir serviços, retenções e totais SAGE × CCI antes do aceite contábil.

## Critério de saída

Cada empresa só será classificada como homologada quando o roteiro automático
mostrar 100%, com dois fechamentos consecutivos, abertura aprovada, conciliações
e transportes vigentes, além da comparação SAGE × CCI e do aceite contábil.
Não existe aprovação manual capaz de ignorar uma etapa reprovada.
