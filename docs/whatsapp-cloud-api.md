# WhatsApp Cloud API no CCI

O CCI usa o gateway compartilhado do Consultor Fiscal Inteligente. O token da
Meta permanece exclusivamente no CFI e nunca é copiado para este projeto.

Configuração necessária no CCI:

- `CFI_URL`: URL do Cloud Run do CFI; já é usada pelos túneis de cadastro e Reinf.
- O usuário precisa estar autenticado com e-mail verificado do escritório.
- O CFI precisa ter um template ativo no departamento `contabil`, cadastrado em
  `Config Admin > Templates do WhatsApp` depois da aprovação pela Meta.

O cadastro da empresa guarda o WhatsApp normalizado em E.164 sem o sinal `+`.
O CCI consulta no CFI os templates e suas variáveis nomeadas antes do envio. A
tela exibe o identificador devolvido pela Meta como comprovante de aceite.
Quando a rede cai durante o POST, o resultado é indeterminado e a orientação é
conferir o número oficial antes de reenviar, evitando mensagem duplicada.
