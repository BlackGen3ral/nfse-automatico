# NFS-e Automático

O assistente com mascote aparece apenas quando o preenchimento chega à revisão. O aviso mostra uma contagem regressiva de 7 segundos e fecha automaticamente. Você também pode fechá-lo pelo X. A emissão continua manual no portal.

Extensão Manifest V3 para Chrome e Edge. Na etapa **Pessoas** do Emissor Nacional, abra a extensão e informe **CNPJ do tomador**, **Descrição do Serviço/Fornecimento** e **Valor do serviço**. Clique em **Preencher até a revisão**. O mesmo CNPJ é usado para o destinatário quando o campo estiver disponível e o perfil indicar que o destinatário é informado separadamente.

Use **Entrar com certificado** para ir direto ao acesso por certificado digital do Emissor Nacional. Se o navegador apresentar a lista de certificados ou solicitar o PIN, conclua essa etapa na janela do navegador.

O ícone da extensão abre um painel na lateral do Chrome, ao lado do site. Ele permanece aberto quando você clica na página. Use o X para fechar. Ao confirmar Preencher até a revisão, a lateral fecha após o portal confirmar o início. Cada guia mantém seu próprio rascunho. Requer Chrome 141 ou posterior.

O painel guarda um rascunho na sessão do navegador enquanto você digita. Se ele fechar ao trocar de janela ou minimizar o Chrome, abra a extensão na mesma guia para continuar. O rascunho é removido ao avançar para Serviço, fechar a guia ou encerrar a sessão do navegador.

O fluxo pesquisa os CNPJs em **Pessoas**, aplica a configuração tributária e a descrição em **Serviço**, informa o valor e os códigos combinados em **Valores** e avança para a **Revisão**. Você confere os dados e confirma a emissão no portal.

No painel inicial, **Exigibilidade do ISSQN suspensa?** começa em **Não** para cada nota. Se marcar **Sim**, a extensão leva a escolha para **Valores** e indica quando o portal exigir dados adicionais para continuar. Essa opção é separada da retenção do ISSQN.

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

O Agendador do Windows consulta a branch `main` do GitHub na sua conta. A primeira verificação começa na ativação e, depois, ocorre a cada hora. A tarefa usa um iniciador silencioso para rodar em segundo plano. Se a tarefa já existia antes da versão 0.2.9, execute a ativação novamente para trocar o iniciador.

Uma versão nova é baixada e verificada mesmo com o navegador aberto. O painel mostra quando ela está pronta. Com uma atualização pendente, o atualizador aguarda em segundo plano até Chrome e Edge fecharem por completo, incluindo processos em segundo plano. A próxima abertura do navegador carrega os arquivos novos. Mantenha a pasta no mesmo lugar após a ativação.

Para desativar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\atualizador\desativar.ps1
```

## Validação no portal

Os controles foram identificados no Emissor Nacional. A busca, a seleção, o preenchimento da descrição e do valor e a transição até a revisão foram verificados com formulários simulados.
