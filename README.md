# NFS-e Automático

Extensão Manifest V3 para Chrome e Edge. Na etapa **Pessoas** do Emissor Nacional, abra a extensão, digite o **CNPJ do tomador** e clique em **Preencher**. O mesmo CNPJ é usado para o destinatário quando o campo estiver disponível e o perfil indicar que o destinatário é informado separadamente.

O fluxo pesquisa os CNPJs no portal, preenche Pessoas e, quando os campos e as pesquisas estiverem confirmados, aciona **Avançar**. Em **Serviço**, aplica Brasil, Pimenta Bueno/RO, tributação 140201, ISSQN Não, NBS 120012000 e operação 050101. Preencha a descrição, revise os dados e emita manualmente.

A extensão lê as exceções da versão anterior quando o CNPJ do emitente corresponde a um perfil local. O CNPJ digitado no painel substitui os CNPJs cadastrados naquela execução. O número vai ao Emissor Nacional pela pesquisa do próprio portal. O atualizador consulta apenas os arquivos públicos do GitHub.

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

Os painéis da etapa Pessoas foram identificados na interface do Emissor Nacional. As seleções da etapa Serviço usam os rótulos da tela fornecida. O novo fluxo e a atualização agendada ainda precisam ser validados em uso real.

