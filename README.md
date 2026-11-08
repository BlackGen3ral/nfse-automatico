# NFS-e Automático

Durante o preenchimento, a página recebe um escurecimento suave de 20%, com uma abertura iluminada no campo em uso. O efeito não bloqueia cliques e termina ao concluir ou ocorrer um erro. Uma seta ilustrativa com contorno claro e brilho verde acompanha os campos acionados. A interface usa branco e verde vivo. O assistente se reconecta se o portal remover seu cartão durante uma atualização da página; ele permanece durante pesquisas e esperas, e encerra no resultado final. Um robô com chapéu de mago, varinha animada e pequenas estrelas acompanha o preenchimento no canto da página. Ele olha para os lados e mostra um relógio enquanto aguarda o portal; sorri e dá um pequeno pulo quando confirma um campo. Um brilho verde com ✓ aparece por alguns instantes nos controles confirmados. Os efeitos respeitam a preferência de movimento reduzido e não atrasam o preenchimento. Ao chegar à revisão, o robô mostra o resultado com contagem de 10 segundos para fechar. Avisos de erro permanecem visíveis até serem fechados. Você também pode fechá-lo pelo X. A emissão continua manual no portal.

Extensão Manifest V3 para Chrome e Edge. Na etapa **Pessoas** do Emissor Nacional, abra a extensão e informe **CNPJ do tomador**, **Descrição do Serviço/Fornecimento** e **Valor do serviço**. Clique em **Preencher até a revisão**. O mesmo CNPJ é usado para o destinatário quando o campo estiver disponível e o perfil indicar que o destinatário é informado separadamente.

Use **Entrar com certificado** para ir direto ao acesso por certificado digital do Emissor Nacional. Se o navegador apresentar a lista de certificados ou solicitar o PIN, conclua essa etapa na janela do navegador.

O ícone da extensão abre um painel na lateral do Chrome, ao lado do site. A interface usa branco, tons neutros e verde, com etapas conectadas, identificação da guia do portal e botão principal sempre visível. Os campos se reorganizam em duas colunas quando há largura disponível, com rolagem vertical em painéis estreitos. Ele permanece aberto quando você clica na página. Use o X para fechar. Ao confirmar Preencher até a revisão, a lateral fecha após o portal confirmar o início. Cada guia mantém seu próprio rascunho. Requer Chrome 141 ou posterior.

O painel guarda um rascunho na sessão do navegador enquanto você digita. Se ele fechar ao trocar de janela ou minimizar o Chrome, abra a extensão na mesma guia para continuar. O rascunho é removido ao avançar para Serviço, fechar a guia ou encerrar a sessão do navegador.

O fluxo pesquisa os CNPJs em **Pessoas**, aplica a configuração tributária e a descrição em **Serviço**, informa o valor e os códigos combinados em **Valores** e avança para a **Revisão**. Você confere os dados e confirma a emissão no portal.

No painel inicial, **Exigibilidade do ISSQN suspensa?** começa em **Não** para cada nota. Se marcar **Sim**, a extensão leva a escolha para **Valores** e indica quando o portal exigir dados adicionais para continuar. Essa opção é separada da retenção do ISSQN.

Em um rascunho aberto diretamente em **Serviço** ou **Valores**, os botões dessas etapas aplicam os respectivos padrões. Se o fluxo iniciado em Pessoas tiver parado nesse rascunho, o botão da etapa retoma a descrição e o valor informados no painel.

O andamento aparece na página do portal. Se algum campo ou pesquisa não puder ser confirmado, a extensão indica o que ficou pendente. A descrição e o valor são repassados entre etapas pelo armazenamento de sessão do navegador.

A extensão lê as exceções da etapa Pessoas quando o CNPJ do emitente corresponde a um perfil local. O CNPJ digitado no painel substitui os CNPJs cadastrados naquela execução. O número vai ao Emissor Nacional pela pesquisa do próprio portal. O atualizador consulta apenas os arquivos públicos do GitHub.

## Conferência e diagnóstico

A extensão relê os campos que alterou antes de avançar. Se uma seleção, resposta ou valor tiver sido perdido pelo portal, ela interrompe a etapa e indica a pendência. O painel lateral mantém a lista de campos conferidos por etapa, com os valores esperados guardados somente na sessão local para comparar a tela final. O autodiagnóstico diferencia falta de internet, sessão expirada, verificação manual, avisos de validação e indisponibilidade do portal. As conferências verificam o preenchimento, não validam o enquadramento fiscal ou os cálculos do portal. A emissão continua manual.

O botão ↗ ao lado da versão expande a própria extensão em uma nova guia, com o formulário maior. O painel expandido fica vinculado à guia do portal de origem e usa o mesmo rascunho, mesmo quando outra aba estiver ativa. Ao iniciar o preenchimento, o navegador volta ao portal para acompanhar o robô; a guia expandida permanece disponível. O botão ↗ nessa guia volta ao portal. A expansão não abre uma nova página da NFS-e.

Na revisão, o robô compara os campos visíveis que consegue identificar com os valores esperados e mostra confirmados, diferentes e não localizados. A leitura usa os rótulos e seções da revisão: os CNPJs são separados por emitente, tomador e destinatário, e a descrição digitada é distinguida da descrição do código do serviço. Campos que essa tela não exibe são identificados como conferidos na etapa anterior, sem alegar confirmação na revisão. Campos desconhecidos ou ambíguos continuam pendentes para conferência manual. Abra **Ver resumo da revisão** no cartão para ver esperado e encontrado; a contagem de fechamento pausa enquanto o resumo estiver aberto. O resultado também fica no painel lateral. Essa comparação não valida o enquadramento fiscal nem os cálculos do portal.

As esperas reagem a mudanças do formulário, com agrupamento de eventos em 16 ms e checagem periódica de segurança para campos sem notificação. Os limites de tempo, o cancelamento e a conferência antes de avançar permanecem ativos. Isso reduz a latência da extensão, não o tempo de resposta do portal.

## Instalação

O painel coloca o foco no CNPJ ao abrir em Pessoas. Enter no CNPJ leva à descrição; na descrição, Enter mantém a quebra de linha e Ctrl+Enter leva ao valor. Enter no valor inicia o preenchimento até a revisão quando os dados estão completos. Se faltar descrição ou CNPJ, o foco vai ao campo pendente. A emissão final continua manual. Clique na caixinha branca vazia do **CNPJ do tomador** para colar o número copiado e ir direto à descrição. Quando já existe um número no campo, o clique apenas permite editá-lo. Para substituir pelo número copiado, use o título do campo; ele continua funcionando como ação explícita de colar. A área de transferência só é lida nesse clique; conteúdo fora do formato numérico de CNPJ não substitui o campo.

Use **＋ Salvar** ao lado do CNPJ para adicioná-lo à lista local deste navegador. Clique na seta do campo CNPJ para abrir uma caixinha com os números salvos. Pesquise por parte do número, com ou sem pontuação, e clique em um resultado para usá-lo e continuar na descrição; use o × de cada resultado para removê-lo da lista. Por padrão, a caixinha abre abaixo do campo. Marque **Abrir acima do campo** dentro dela se preferir a posição superior; a escolha fica salva neste navegador. Se não houver espaço do lado escolhido, a busca se ajusta para caber na tela. Escape, o botão de fechar ou um clique fora fecham a busca. A lista permanece após fechar o painel ou o navegador e não é enviada ao GitHub. A escolha não inicia o preenchimento automaticamente.

1. Baixe o ZIP e extraia para uma pasta fixa. Se você já instalou a versão anterior, copie os arquivos para a pasta que o navegador já usa.
2. Abra `chrome://extensions` ou `edge://extensions`, ative o **Modo do desenvolvedor** e use **Carregar sem compactação**. Se já estava instalada na mesma pasta, clique em **Recarregar**.
3. Abra ou atualize a etapa **Pessoas** no portal.

## Atualizações pelo GitHub

A atualização é opcional e funciona no Windows. Ela deve ser ativada uma vez em cada PC. Extraia o ZIP completo na pasta fixa usada pelo navegador e dê dois cliques em **ATIVAR-ATUALIZACOES.cmd**, ao lado de manifest.json. Aguarde a confirmação de ativação. Copiar a extensão de outro PC não cria a tarefa de atualização. A janela aparece apenas durante essa ativação manual; as verificações seguintes são silenciosas.

Como alternativa, no PowerShell aberto na pasta da extensão, execute:

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

## Leitura do portal e recuperação

O assistente identifica avisos de validação, sessão expirada e verificações CAPTCHA visíveis. Esperas por campos e resultados podem ganhar até 3 segundos adicionais. Pesquisas de CNPJ e buscas Select2 podem repetir uma vez quando a falha é temporária; erros de validação e autenticação não são repetidos automaticamente.

Descrição e valor do fluxo ficam na sessão da guia. Após uma interrupção ou recarga em Serviço ou Valores, a extensão pode retomar o mesmo rascunho ativo, com limite de duas retomadas automáticas por rascunho. O botão Tentar novamente nesta etapa permite repetir o preenchimento de um rascunho com erro, depois de corrigir o problema. Troca de rascunho, dados vencidos e etapas de avanço pendentes bloqueiam a retomada automática. A extensão não atualiza a página, não faz login, não resolve CAPTCHA e não confirma emissão.

Esses cenários foram verificados em formulários simulados; a leitura depende dos avisos e controles que o portal apresentar.
## Controle pelo Android

O NFS-e Conecta conecta o Android a um PC Windows pela internet. Instale o programa do PC e esta extensão, abra o portal pelo botão do programa e conclua o acesso com certificado. Digite no Android o código temporário mostrado pelo programa. O celular envia CNPJ, descrição e valor; o PC abre Pessoas e a extensão avança até a revisão.

O programa do PC recebe comandos autenticados pela sua própria conexão HTTPS. A extensão se comunica apenas com o serviço local em 127.0.0.1:17846, usando uma chave de pareamento local. O conteúdo dos comandos não é gravado no GitHub. A confirmação de sucesso no celular depende da chegada ao rascunho correto da revisão. A emissão é confirmada pelo usuário no portal.

Central de acesso e downloads: https://nfse-conecta.arthurgabrielfera.workers.dev
