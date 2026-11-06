# NFS-e Automático

Extensão Chrome/Edge Manifest V3 para preencher campos previamente configurados no Emissor Nacional da NFS-e. A versão 0.1.0 guarda perfis em armazenamento local do navegador e não contém integração de rede, Google Sync ou transmissão de cadastros.

## Padrões incluídos

- Data de competência: data de hoje.
- Compra governamental: Não.
- Tomador e destinatário localizados no Brasil; CNPJs vêm do perfil da empresa.
- Destinatário é o próprio adquirente: Não.
- Intermediário: Intermediário não informado.
- Serviço: Município Pimenta Bueno/RO, código nacional 140201, ISSQN Não, NBS 120012000 e indicador 050101.
- Regime de apuração: primeira opção habilitada que não seja um item vazio ou “Selecione”.

O campo **Descrição do Serviço/Fornecimento** fica em branco por não haver texto fornecido. A extensão não avança etapas, não preenche valores nem clica em “Emitir NFS-e”. Revise os dados e conclua a emissão manualmente.

## Instalação local

1. No repositório, abra **Code > Download ZIP** e extraia o arquivo.
2. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor** e escolha **Carregar sem compactação**.
4. Selecione a pasta extraída `nfse-automatico-main`.
5. Abra a extensão e cadastre cada emitente, o CNPJ do tomador e, se diferente, o CNPJ do destinatário.
6. Atualize a tela do Emissor Nacional para aplicar o perfil.

## Privacidade

Os cadastros são armazenados por `chrome.storage.local` na instalação atual do navegador. Eles não são sincronizados entre aparelhos nem enviados pela extensão. A extensão tem acesso apenas às páginas sob `https://www.nfse.gov.br/EmissorNacional/`, para preencher os formulários nesse endereço. Desinstalar a extensão pode remover os perfis.

## Compatibilidade e validação

O mapeamento dos campos Pessoas foi conferido na interface real do portal na versão 1.6.0.0: `pnlComprasGov`, `pnlTomador`, `pnlDestinatario`, `pnlIntermediario`, `btn_Tomador_Inscricao_pesquisar`, além do texto “LOGADO COMO”. O fluxo da aba Serviço foi preparado a partir da captura fornecida. A extensão não foi instalada nem executada no seu navegador; o preenchimento precisa de validação prática nas duas etapas com perfis de teste. As opções dinâmicas de município e códigos podem mudar conforme atualizações do portal. Não foi realizado teste de emissão.

## Repositório

Código-fonte: https://github.com/BlackGen3ral/nfse-automatico. O repositório contém apenas a extensão e esta documentação; os perfis empresariais são criados no navegador e não fazem parte do código.

