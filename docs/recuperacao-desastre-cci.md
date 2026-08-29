# Recuperação de desastre do CCI

Este procedimento valida a recuperação sem escrever no banco de produção. A
restauração deve sempre usar um banco Firestore nomeado, criado exclusivamente
para o teste. O banco `(default)` nunca pode ser usado como destino.

## Camadas protegidas

- banco de produção com proteção contra exclusão;
- PITR de sete dias;
- backup nativo diário com retenção de 98 dias;
- exportação integral semanal para o bucket regional privado;
- retenção reversível de 98 dias e soft delete de sete dias no bucket;
- réplica externa ao Google Cloud: pendente de definição do destino
  corporativo e das credenciais de serviço.

## Restauração isolada

1. Identificar o último export concluído e guardar o caminho exato do arquivo
   `overall_export_metadata`. Não selecionar o objeto apenas pela data do
   diretório.
2. Criar um banco nomeado na mesma região, com proteção contra exclusão. O nome
   deve conter a data do teste, por exemplo `cci-restore-test-AAAAMMDD`.
3. Confirmar por leitura que o destino não é `(default)` e está vazio.
4. Iniciar uma única importação assíncrona a partir da raiz do export e guardar
   o nome completo da operação. Nunca reiniciar enquanto a operação estiver
   em `PROCESSING`.
5. Consultar a mesma operação até `SUCCESSFUL`. Registrar início, fim,
   documentos, bytes e eventual erro.
6. Conferir no banco restaurado:
   - conjunto de coleções-raiz;
   - contagem de documentos por coleção-raiz;
   - coerência temporal das diferenças em relação à produção atual;
   - ausência de qualquer escrita no banco `(default)` durante o teste.
7. Calcular:
   - RTO do teste: `fim da importação - início da importação`;
   - idade do ponto restaurado: `início da importação - data do export`;
   - RPO de projeto por camada: PITR até sete dias, backup nativo diário e
     export integral semanal.

Uma importação concluída prova a leitura e a reconstrução do artefato pelo
Firestore. As contagens estruturais complementam essa prova e não devem ser
forçadas a coincidir com a produção atual, porque lançamentos legítimos podem
ter sido criados ou alterados depois da fotografia restaurada.

## Encerramento seguro

O banco isolado deve permanecer protegido até a evidência ser registrada e
revisada. A exclusão do banco de teste exige autorização explícita, conferência
do nome exato e remoção deliberada da proteção. O banco `(default)`, os exports
e os backups não são apagados ou sobrescritos por este procedimento.

## Réplica externa

A P05 somente pode ser encerrada quando uma cópia criptografada existir fora
do projeto Google Cloud e uma restauração dessa cópia também for comprovada.
Antes de configurar a réplica, registrar:

- destino corporativo: SharePoint ou OneDrive;
- conta de serviço e política de acesso;
- retenção e versionamento;
- NAS, se utilizado: modelo, sistema operacional e caminho do compartilhamento;
- frequência, monitoramento, responsável e teste de restauração.

Não copiar para pasta pessoal nem reutilizar credenciais interativas de um
colaborador como mecanismo permanente de backup.
