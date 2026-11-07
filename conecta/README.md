# NFS-e Conecta

Primeira versão do controle Android → Windows → extensão NFS-e Automático.

Site e API públicos em https://nfse-conecta.pages.dev. Cada computador possui uma chave própria. O celular recebe uma credencial independente ao consumir um código temporário de pareamento de 12 caracteres.

## Distribuição Windows

O executável 1.1.0 passou na verificação do Defender com marca de origem da Internet. O SHA-256 do arquivo está fixado em versions.json. A publicação reaproveita esse arquivo validado sem recompilar o Windows. A verificação não substitui o teste do programa no computador.

## Instalação

1. No Windows, execute o programa e mantenha-o aberto. Quando uma versão estiver liberada, o executável roda da pasta onde foi salvo e continua na área perto do relógio quando a janela é fechada. O início com o Windows é opcional, pela caixa da interface.
2. Instale a extensão 0.5.1 no Chrome usando Carregar sem compactação. Use o botão Abrir portal no programa e conclua a autenticação no portal. O primeiro uso configura a conexão local da extensão.
3. No Android, instale o APK e leia o QR do PC com a câmera do celular, ou digite o código mostrado no PC. O código expira em 5 minutos e é consumido uma vez. Gerar outro código revoga o celular anterior.
4. Informe CNPJ, descrição e valor no Android. O computador precisa estar ligado e conectado. Certificado, PIN, login e CAPTCHA são tratados no computador. O usuário confere e confirma a emissão no portal.

## Atualizações

A interface do Android é carregada do site com revalidação dos arquivos. O APK consulta updates.json ao abrir e oferece o download de uma nova versão, com confirmação da instalação pelo Android. O programa Windows consulta versões a cada hora e oferece a página de downloads quando encontra uma atualização. O usuário instala a nova versão. A extensão mantém o atualizador GitHub existente.

Para publicar uma melhoria, altere versions.json e as partes correspondentes, execute release.ps1 e npm run deploy. O Windows é compilado separadamente com build-pc.ps1 e só entra no pacote se windowsAvailable estiver habilitado e windowsApprovedSha256 corresponder ao executável. Atualize também o versionCode para cada APK novo. A assinatura do Android deve permanecer a mesma. A chave e sua senha protegida pelo Windows ficam em %LOCALAPPDATA%/NFSeConectaBuild e devem ter backup privado. Nunca publique essa pasta. O código não contém tokens de clientes nem certificados de empresas.

## Desenvolvimento

- Node.js 24, Windows com .NET Framework, compilador Roslyn 4.8 e ferramentas Android em toolchain são necessários para compilar todos os componentes. download-toolchain.ps1 obtém JDK e ferramentas Android das fontes oficiais. Os binários dessas ferramentas não fazem parte do pacote distribuído.
- npm ci instala as ferramentas de publicação. npm test valida a API e o repasse de comandos da extensão.
- cloudflare.config.ts identifica o Worker e o banco D1. A configuração existente deve ser reutilizada nas atualizações.
- prepare-schema.mjs produz um lote SQL e cf d1 query deve recebê-lo com --batch @.cloudflare/schema-batch.json. Uma instrução SQL por entrada evita aplicação parcial do esquema.
- node build.mjs prepara os arquivos do site e downloads. node build-worker.mjs usa o formato oficial Build Output do Cloudflare. npm run deploy publica esse pacote pela CLI cf, na conta autenticada.
- A conexão do PC usa HTTPS para o Cloudflare e uma ponte TCP HTTP restrita a 127.0.0.1:17846 para a extensão. A chave da ponte é passada pelo fragmento do URL do portal e removida antes do início do preenchimento.

## Consistência e dados

A fila permite somente uma solicitação ativa por PC. Cada envio tem um identificador idempotente. O PC registra a entrega antes de abrir o portal, e a extensão mantém um registro por solicitação na sessão do navegador. Depois de uma interrupção incerta, a solicitação exige conferência antes de novo envio. O celular só recebe sucesso depois da chegada ao mesmo rascunho na revisão.

CNPJ, descrição e valor são transmitidos por HTTPS e permanecem no D1 até concluir ou expirar o comando. Uma rotina a cada 5 minutos limpa comandos vencidos. O conteúdo do comando é removido quando termina. O status é mantido por até cerca de 24 horas após o prazo do comando. Certificados e senhas do portal ficam no computador. Credenciais do programa Windows são protegidas por DPAPI para a conta atual do Windows.

## Validação desta versão

Foram verificados compilação Windows, assinatura do APK, testes de fila/pareamento/idempotência, autenticação, integração simulada com a extensão, transições existentes da extensão e um teste HTTP real no Cloudflare, incluindo integridade dos três downloads.

A política de execução da sessão de desenvolvimento bloqueou abrir o executável Windows. A execução real do programa com Chrome e o teste no aparelho Android ainda precisam ser realizados pelo usuário. Nenhuma nota real foi emitida nos testes.

O endereço Pages usa uma Function com o binding ORIGIN apontando para o Worker nfse-conecta. As próximas publicações do Worker chegam também ao endereço Pages. O Worker mantém o banco e a rotina de expiração existentes.
