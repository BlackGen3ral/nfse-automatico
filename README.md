# NFS-e Automático

Extensão Manifest V3 para Chrome e Edge. Na etapa **Pessoas** do Emissor Nacional, abra a extensão, digite o **CNPJ do tomador** e clique em **Preencher**. O mesmo CNPJ é usado para o destinatário quando o campo estiver disponível e o perfil indicar que o destinatário é informado separadamente.

O fluxo marca **Sim** em **Preencher as informações IBS/CBS?** quando a pergunta aparece, para liberar a data e os campos combinados. Em seguida, pesquisa os CNPJs e, quando a etapa **Pessoas** está pronta, aciona **Avançar**. Ao abrir **Serviço**, pesquisa Pimenta Bueno/RO e o código 140201 nos controles do portal. Depois aplica ISSQN Não, NBS 120012000 e operação 050101. O fluxo para nessa etapa para você completar a descrição, revisar e avançar manualmente.

Se já estiver na etapa **Serviço**, abra o painel e clique em **Preencher Serviço**. Esse botão aplica os mesmos valores sem pedir CNPJ.

Ao avançar manualmente de **Serviço** para **Valores** no mesmo rascunho, a extensão seleciona ISSQN sem retenção, PIS/COFINS **00 – Nenhum**, retenção **0**, situação tributária **000**, classificação **000001** e alíquota do Simples Nacional **6,00%**. Você também pode clicar em **Preencher Valores** quando já estiver nessa etapa. O valor do serviço e o avanço continuam manuais.

O andamento aparece na página do portal. Se algum campo ou pesquisa não puder ser confirmado, a extensão indica o que ficou pendente e aguarda a revisão.

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

Os controles foram identificados no Emissor Nacional. A busca e a seleção em Serviço foram verificadas com Select2 e respostas simuladas. O preenchimento de Valores foi verificado em um formulário simulado com os identificadores observados no portal. A execução completa da versão 0.2.3 no portal real e a atualização agendada ainda precisam de validação.

