# NFS-e Automático

Extensão Manifest V3 para Chrome e Edge. Na etapa **Pessoas** do Emissor Nacional, abra a extensão e informe **CNPJ do tomador**, **Descrição do Serviço/Fornecimento** e **Valor do serviço**. Clique em **Preencher até a revisão**. O mesmo CNPJ é usado para o destinatário quando o campo estiver disponível e o perfil indicar que o destinatário é informado separadamente.

O fluxo pesquisa os CNPJs em **Pessoas**, aplica a configuração tributária e a descrição em **Serviço**, informa o valor e os códigos combinados em **Valores** e avança para a **Revisão**. Você confere os dados e confirma a emissão no portal.

Em um rascunho aberto diretamente em **Serviço** ou **Valores**, os botões dessas etapas aplicam os respectivos padrões. Se o fluxo iniciado em Pessoas tiver parado nesse rascunho, o botão da etapa retoma a descrição e o valor informados no painel.

O andamento aparece na página do portal. Se algum campo ou pesquisa não puder ser confirmado, a extensão indica o que ficou pendente. A descrição e o valor são repassados entre etapas pelo armazenamento de sessão do navegador.

A extensão lê as exceções da etapa Pessoas quando o CNPJ do emitente corresponde a um perfil local. O CNPJ digitado no painel substitui os CNPJs cadastrados naquela execução. O número vai ao Emissor Nacional pela pesquisa do próprio portal. O atualizador consulta apenas os arquivos públicos do GitHub.

## Instalação

1. Baixe o ZIP e extraia para uma pasta fixa. Se você já instalou a versão anterior, copie os arquivos para a pasta que o navegador já usa.
2. Abra `chrome://extensions` ou `edge://extensions`, ative o **Modo do desenvolvedor** e use **Carregar sem compactação**. Se já estava instalada na mesma pasta, clique em **Recarregar**.
3. Abra ou atualize a etapa **Pessoas** no portal.

## Atualizações pelo GitHub

A atualização é opcional e funciona no Windows. No PowerShell, aberto na pasta da extensão, execute uma vez:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\atualizador\ativar.ps1
```

O Agendador do Windows verifica a versão publicada na branch `main` uma vez por hora, na sua conta. Quando encontra uma versão maior, baixa e confere os arquivos do mesmo commit. Ele aplica a atualização na mesma pasta quando Chrome e Edge estão fechados, incluindo processos em segundo plano. A próxima abertura do navegador carrega os arquivos novos. Mantenha a pasta no mesmo lugar após a ativação.

Para desativar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\atualizador\desativar.ps1
```

## Validação no portal

Os controles foram identificados no Emissor Nacional. A busca, a seleção, o preenchimento da descrição e do valor e a transição até a revisão foram verificados com formulários simulados. A execução completa da versão 0.2.4 no portal real e a atualização agendada ainda precisam de validação.

