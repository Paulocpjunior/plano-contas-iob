# WhatsApp Cloud API no CCI

O canal usa a API oficial da Meta e mantém o token exclusivamente no servidor.

Variáveis de ambiente obrigatórias:

- `WHATSAPP_CLOUD_TOKEN`: token do usuário de sistema da Meta.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do número oficial.
- `WHATSAPP_TEMPLATE_CCI`: nome exato do template aprovado para o CCI.
- `WHATSAPP_TEMPLATE_IDIOMA`: idioma aprovado; o padrão é `pt_BR`.

O cadastro da empresa guarda o WhatsApp normalizado em E.164 sem o sinal `+`.
O envio só aceita template aprovado. A tela solicita as variáveis na mesma ordem
do template e exibe o identificador devolvido pela Meta como comprovante de aceite.
Quando a rede cai durante o POST, o resultado é indeterminado e a orientação é
conferir o número oficial antes de reenviar, evitando mensagem duplicada.
