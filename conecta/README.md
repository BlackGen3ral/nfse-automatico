# NFS-e Conecta

Primeira versão do controle Android → Windows → extensão NFS-e Automático.

Site e API públicos em https://nfse-conecta.pages.dev. Cada computador possui uma chave própria. O celular recebe uma credencial independente ao consumir um código temporário de pareamento de 12 caracteres.

## Distribuição Windows

O executável 1.6.0 é compilado com Roslyn e o SHA-256 do arquivo publicado está fixado em versions.json. Os testes locais de comunicação não equivalem a uma certificação por antivírus.

## Instalação

1. No Windows, execute o programa e mantenha-o aberto. Quando uma versão estiver liberada, o executável roda da pasta onde foi salvo e continua na área perto do relógio quando a janela é fechada. O início com o Windows é opcional, pela caixa da interface.
2. Instale a extensão 0.8.0 no Chrome usando Carregar sem compactação. Use o botão Abrir portal no programa e conclua a autenticação no portal. O primeiro uso configura a conexão local da extensão.
3. No Android, instale o APK e leia o QR do PC com a câmera do celular, ou digite o código mostrado no PC. O código expira em 5 minutos e é consumido uma vez. O celular anterior permanece conectado até concluir um novo pareamento.
4. Informe CNPJ, descrição e valor no Android. O computador precisa estar ligado e conectado. Certificado, PIN, login e CAPTCHA são tratados no computador. O usuário confere e confirma a emissão no portal.

## Atualizações

A interface do Android é carregada do site com revalidação. A partir do Windows 1.3.0, o programa consulta versões ao iniciar e a cada 15 minutos, baixa o executável por HTTPS, verifica SHA-256 e troca para uma pasta de versão quando estiver ocioso. O processo novo aguarda o anterior sair. A partir do Android 1.2.0, o app verifica ao retornar e a cada intervalo mínimo de 15 minutos de uso, baixa pelo DownloadManager e verifica hash, pacote e assinatura antes de solicitar a instalação ao Android. A confirmação da instalação é feita pelo usuário. As versões anteriores precisam de uma atualização manual para receber esse mecanismo. A extensão mantém o atualizador GitHub existente.

Para publicar uma melhoria, altere versions.json e as partes correspondentes, execute release.ps1 e npm run deploy. O Windows é compilado separadamente com build-pc.ps1 e só entra no pacote se windowsAvailable estiver habilitado e windowsApprovedSha256 corresponder ao executável. Atualize também o versionCode para cada APK novo. A assinatura do Android deve permanecer a mesma. A chave e sua senha protegida pelo Windows ficam em %LOCALAPPDATA%/NFSeConectaBuild e devem ter backup privado. Nunca publique essa pasta. O código não contém tokens de clientes nem certificados de empresas.

## Desenvolvimento

- Node.js 24, Windows com .NET Framework, compilador Roslyn 4.8 e ferramentas Android em toolchain são necessários para compilar todos os componentes. download-toolchain.ps1 obtém JDK e ferramentas Android das fontes oficiais. Os binários dessas ferramentas não fazem parte do pacote distribuído.
- npm ci instala as ferramentas de publicação. npm test valida a API e o repasse de comandos da extensão.
- cloudflare.config.ts identifica o Worker e o banco D1. A configuração existente deve ser reutilizada nas atualizações.
- prepare-schema.mjs produz um lote SQL e cf d1 query deve recebê-lo com --batch @.cloudflare/schema-batch.json. Uma instrução SQL por entrada evita aplicação parcial do esquema.
- node build.mjs prepara os arquivos do site e downloads. node build-worker.mjs usa o formato oficial Build Output do Cloudflare. npm run deploy publica esse pacote pela CLI cf, na conta autenticada.
- A conexão do PC usa HTTPS para o Cloudflare e uma ponte TCP HTTP restrita a 127.0.0.1:17846 para a extensão. A chave da ponte é passada pelo fragmento do URL do portal e removida antes do início do preenchimento.

## Consistência e dados

O modo normal envia uma solicitação por vez. O lote experimental aceita de duas a cinco notas simultâneas, com um canal local e uma guia por nota. Exige PC 1.5.0 e extensão 0.8.0; versões antigas não recebem os dados do lote. O Android permite parar cada nota ou todo o lote. Se duas guias chegarem ao mesmo identificador de rascunho, a segunda é pausada. O comportamento de cinco rascunhos simultâneos ainda exige validação no portal real. Nenhum comando de emissão é enviado; todas as guias param na revisão. Cada envio tem um identificador idempotente. O PC registra a entrega antes de abrir o portal, e a extensão mantém um registro por solicitação na sessão do navegador. Depois de uma interrupção incerta, a solicitação exige conferência antes de novo envio. O celular só recebe sucesso depois da chegada ao mesmo rascunho na revisão.

CNPJ, descrição e valor são transmitidos por HTTPS e permanecem no D1 até concluir ou expirar o comando. Uma rotina a cada 5 minutos limpa comandos vencidos. O conteúdo do comando é removido quando termina. O status é mantido por até cerca de 24 horas após o prazo do comando. Certificados e senhas do portal ficam no computador. Credenciais do programa Windows são protegidas por DPAPI para a conta atual do Windows.

## Validação desta versão

Foram verificados compilação Windows, assinatura do APK, testes de fila/pareamento/idempotência, autenticação, integração simulada com a extensão, transições existentes da extensão e um teste HTTP real no Cloudflare, incluindo integridade dos três downloads.

A política de execução da sessão de desenvolvimento bloqueou abrir o executável Windows. A execução real do programa com Chrome e o teste no aparelho Android ainda precisam ser realizados pelo usuário. Nenhuma nota real foi emitida nos testes.

O endereço Pages usa uma Function com o binding ORIGIN apontando para o Worker nfse-conecta. As próximas publicações do Worker chegam também ao endereço Pages. O Worker mantém o banco e a rotina de expiração existentes.

## Entrada por certificado

No Windows 1.2.0, Configurar certificado seleciona um certificado instalado e cria uma regra AutoSelectCertificateForUrls para certificado.nfse.gov.br no Chrome. O Windows pode solicitar elevação para gravar a regra. A escolha permanece local. Após uma solicitação, a extensão 0.8.0 mantém a intenção por guia por até 9 minutos, abre o acesso por certificado na tela de login e segue para Pessoas ao chegar à página inicial. O preenchimento requer uma solicitação pendente válida. PINs de tokens continuam sujeitos à confirmação local.

Os testes automatizados cobrem login, navegação, expiração por guia e entrega única. O teste completo com a política aplicada e o certificado real no Chrome ainda precisa de validação.

## Pareamento e câmera

A API de status do PC diferencia credenciais válidas, celular conectado, código válido e solicitação ativa. Gerar um QR mantém o celular atual até o novo pareamento ser concluído. A troca é bloqueada durante uma solicitação ativa. O Windows recupera credenciais de dispositivo inválidas preservando a chave local da extensão. O botão Ler QR code do PC usa câmera e decodificação locais. A permissão é concedida apenas para vídeo no domínio do app. Os testes cobrem expiração, troca de celular, câmera simulada e integridade do atualizador. Ainda falta a validação em aparelho Android físico e a troca real de processos Windows.

## Abertura e parada remotas

Windows 1.4.0 envia open-invoice pela ponte local enquanto há solicitação pendente. A extensão 0.5.4 reconhece /EmissorNacional/Dashboard e usa o link real do atalho Nova NFS-e - Emissão Completa. O celular pode solicitar parada. Antes de iniciar, a fila cancela imediatamente. Durante uma execução, o estado final depende da confirmação da extensão, que bloqueia novas escritas e avanços. Mensagens de progresso tardias não podem substituir uma parada solicitada. Dados já preenchidos permanecem no portal para conferência.

Bancos anteriores exigem executar server/migrations/001-cancellation.sql uma vez, após conferir PRAGMA table_info(jobs). Bancos novos usam schema.sql. A migração foi aplicada ao banco publicado. Os testes incluem o Dashboard, a parada dentro de esperas, a proteção contra avanço posterior e um teste HTTP real da fila de cancelamento com dados sintéticos removidos ao final. A interação completa do Chrome e a confirmação no aparelho Android ainda precisam de validação.

Windows 1.4.1 tenta portas de loopback de 17846 a 17861 quando a porta padrão está ocupada. O endereço de acesso transmite a porta escolhida no fragmento, lido pela extensão 0.5.5. A extensão só aceita portas dessa faixa em 127.0.0.1. Falhas de inicialização ficam em connection-error.txt na pasta local privada do app. A atualização 1.4.0 para 1.4.1 foi verificada pela interface, com reconexão na porta alternativa.

Windows 1.4.2 inicia a conexão no Dashboard com a chave local no fragmento, para a extensão registrar a ponte antes do acesso por certificado. Abrir Emissão Completa no Chrome cria uma intenção de abertura com prazo de 9 minutos, mesmo sem dados de uma nota pendente. A extensão 0.5.6 aciona o atalho e confirma /opened quando Pessoas carrega. O fragmento é removido da página antes do acesso por certificado. As etapas de conexão e abertura apresentam mensagens locais na página.

A abertura da versão 1.4.2 com a extensão 0.5.6 foi validada pela interface do app no PC. O comando abriu o Chrome e a página /EmissorNacional/DPS/Pessoas foi observada, junto da confirmação /opened no app. O teste de abertura foi realizado com o formulário vazio.

## Lote experimental

Ative Lote simultâneo no Android, preencha os dados de cada nota e toque em Adicionar nota ao lote. Após adicionar de duas a cinco notas, toque em Enviar notas simultaneamente. O PC deve estar conectado, autenticado no portal e com a extensão atualizada. A autenticação por certificado permanece no PC. Aplique server/migrations/003-parallel-batch.sql antes de publicar o backend.

## Ligar o PC e aguardar a inicialização (Android 1.4.0 / PC 1.6.0)

No PC de destino, abra Configurar ligar PC pela rede, selecione o adaptador Ethernet e mantenha Iniciar o Conecta ao entrar no Windows marcado. O programa registra MAC e broadcast na API privada desse pareamento. Não há dados de rede de clientes embutidos no código.

No Android, abra Ligar PC pela rede e use o botão estando no Wi-Fi da mesma rede do PC. O app envia três magic packets UDP para a rede local. O retorno confirma o envio, não o despertar físico. A interface só considera o PC conectado após o Conecta responder ao serviço. O teste do hardware (suspensão e desligamento) continua necessário.

Marcando Ligar e aguardar o PC antes de preencher, um envio de uma nota ou lote pode aguardar até 30 minutos. A fila mantém os mesmos IDs para evitar duplicação e continua cancelável antes de o PC iniciar. Ao conectar, o PC abre o Chrome e a extensão segue o fluxo existente até a revisão, sem emissão automática. Windows, certificado e eventuais verificações ainda precisam permitir o acesso à sessão do usuário; não se configura login automático nem se armazena senha do Windows.

Acordar por outra rede ainda requer um roteador ou aparelho intermediário configurado. O modelo Huawei HG8145X6-10-V2 foi identificado pelo usuário, mas não há integração validada com seu firmware. A UI informa que o modo de fora da rede está pendente. A API não expõe um botão remoto que finja enviar o pacote pela internet. Aplique server/migrations/004-wake.sql antes de publicar.

### Entrada automática do Windows

No PC 1.6.1, o diálogo Configurar ligar PC pela rede contém Configurar entrada do Windows. Ele apresenta as instruções e abre o painel nativo Contas de Usuário (netplwiz), para o usuário confirmar a configuração no PC de destino. O Conecta não simula teclas na área de login, não configura Winlogon diretamente, não recebe senhas e não reinicia o Windows. A disponibilidade da opção e o funcionamento após iniciar precisam ser confirmados nesse PC.
