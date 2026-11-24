<p align="center">
  <img width="90%" src="./server/public/assets/popups/outpost-takeover.png">
</p>

<br>

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![ActionScript](https://img.shields.io/badge/ActionScript-%23DD0031.svg?style=for-the-badge)

<br>

## 📖 About This Project
This repository is a complete digital preservation and restoration of Backyard Monsters, Kixeye’s 2010 Flash-based strategy game. It features a reconstructed client, decompiled from original game files, alongside a custom-built server component implemented through extensive reverse engineering efforts.
The ActionScript 3 client runs in the browser through the self-hosted Ruffle runtime or in the standalone Flash Player. The TypeScript backend uses Bun and Koa, with PostgreSQL managed through MikroORM and Redis for sessions and chat.
This project aims to keep a piece of gaming history alive and playable for future generations.

<br>

## Jogar pelo navegador

Abra [a página do jogo local](http://localhost:3001/play/) e entre com o e-mail e a senha da sua conta. No primeiro acesso de uma conta nova, use **Criar conta**, escolha o idioma e o servidor criará o quintal ao abrir o jogo. Para contas anteriores à preferência de idioma, o site começa em português. O idioma salvo em **Conta** entra em vigor na próxima abertura do jogo.

- **Jogar** fecha o painel do site e volta ao quintal.
- **Amigos** abre um painel sobre o jogo. Qualquer jogador pode buscar contas, enviar e responder a pedidos, cancelar pedidos enviados e remover amizades.
- **Conta** reúne idioma, recuperação de senha e saída. **Moderação** aparece para contas com essa permissão.
- **Nítida** é a qualidade padrão. O jogo ajusta a área ao monitor e compensa reduções no zoom do navegador para manter os textos e controles legíveis. Use **Desempenho** para reduzir a resolução de renderização em áreas grandes ou **Tela cheia** para ganhar espaço.

O cliente de desktop também pode ser usado para testes locais com `bin/bymr-local.swf`.

<br>

## Ligar o servidor local

Você precisa do Docker com Compose v2, do Bun e de um ambiente de compilação ActionScript com Java e Apache Flex SDK.

1. Abra a raiz do repositório no VS Code com a extensão **ActionScript & MXML** e selecione o Flex SDK no seletor de SDK da extensão. Em **Tasks: Run Task**, execute **compile-local**. A tarefa usa `asconfig.local.json` e gera `bin/bymr-local.swf`. [Guia de compilação ActionScript](https://github.com/bym-refitted/backyard-monsters-refitted/wiki/Client-Recompilation-Guide)

2. Com o Docker em execução, use o terminal na raiz do repositório.

   ```sh
   cd server
   bun install --frozen-lockfile
   bun run build
   bun run web:prepare
   ```

   O comando `bun run build` cria `server/.env` com uma chave de sessão aleatória no primeiro uso. Preserve o arquivo se já tiver um banco. Se a porta `5432` estiver ocupada pelo PostgreSQL do computador, configure `DB_HOST_PORT=15432` em `server/.env` antes de subir os contêineres.

3. Suba o servidor, o PostgreSQL e o Redis. O serviço `db-init` prepara o esquema e aplica as migrações. O estado `Exited (0)` para esse serviço indica que a preparação terminou.

   ```sh
   docker compose up -d --build
   docker compose ps -a
   ```

4. Abra [o jogo local](http://localhost:3001/play/). O chat local usa a porta `3010`. Se a página não abrir, consulte os logs.

   ```sh
   docker compose logs --tail=100 web db-init
   ```

Para ligar novamente, execute `docker compose up -d` em `server/`. Para parar os serviços mantendo o banco, use `docker compose stop`. Depois de alterar o ActionScript, execute novamente **compile-local**, `bun run web:prepare` e `docker compose up -d --build`.

No Beekeeper Studio, escolha PostgreSQL e conecte em `localhost`, usando a porta `DB_HOST_PORT` ou `5432` quando ela não estiver configurada. Use `DB_NAME`, `DB_USER` e `DB_PASSWORD` de `server/.env`. As tabelas do jogo ficam no esquema `bym`, incluindo `bym."user"` para contas e `bym.save` para quintais.

### Guias adicionais

| Setup Type | Documentation |
|------------|---------------|
| 🖥️ **Server Setup** | [Server & Database Configuration](https://github.com/bym-refitted/backyard-monsters-refitted/wiki/Server-&-Database-Setup) |
| 🎮 **Client Setup** | [Client Recompilation Guide](https://github.com/bym-refitted/backyard-monsters-refitted/wiki/Client-Recompilation-Guide) |
| 🐳 **Docker Setup** | [Docker Configuration](https://github.com/bym-refitted/backyard-monsters-refitted/wiki/Docker-Setup) |
| 📱 **Android Setup** | [Android APK Compilation](https://github.com/bym-refitted/backyard-monsters-refitted/wiki/Android-APK-Setup) |

## Publicar em uma VPS

1. Aponte o DNS do jogo para a VPS e libere as portas TCP `80` e `443` para o Caddy atender as conexões. O servidor do jogo, o PostgreSQL, o Redis e o chat se comunicam pela rede privada do Docker.
2. Compile `bin/bymr-local.swf` a partir da mesma versão do projeto que será publicada. Se compilar em outro computador, copie o arquivo para `bin/` na VPS. O Docker inclui o SWF e o Ruffle na imagem de produção.
3. Em `server/`, copie `example.production.env` para `.env.production`. Configure `GAME_DOMAIN`, uma senha para `DB_PASSWORD`, uma chave aleatória para `SECRET_KEY` e os dados de SMTP. Use `openssl rand -hex 32` para gerar a chave. A porta SMTP `465` usa TLS implícito e a `587` usa STARTTLS.
4. Em `server/`, compile e inicie os contêineres.

   ```sh
   docker compose --env-file .env.production -f docker-compose.production.yml build web
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build --wait
   ```

Abra `https://<GAME_DOMAIN>/play/`. O perfil de produção usa HTTPS e sessões assinadas. O chat passa por `wss://<GAME_DOMAIN>/play/chat` e os links de recuperação abrem `/reset-password/`. Mantenha `REQUIRE_DISCORD=false` para permitir cadastro e login com e-mail e senha pelo site. Ative a exigência de Discord quando a instância já tiver a integração de verificação.

Para atualizar a VPS, faça um backup do PostgreSQL e repita a compilação e a subida dos contêineres. O `db-init` aplica as migrações antes de o servidor começar a atender.

## Moderação

Para conceder acesso à moderação a uma conta existente, execute em `server/`, substituindo `NOME_DO_JOGADOR` pelo nome usado no jogo.

```sh
docker compose exec web bun run role:set NOME_DO_JOGADOR moderator
```

Na VPS, inclua `--env-file .env.production -f docker-compose.production.yml` após `docker compose`. Use `player` no lugar de `moderator` para revogar a função. Atualize a página para carregar o menu de acordo com a permissão atual. O painel permite buscar jogadores, ajustar o Shiny de um quintal existente e arquivar ou restaurar contas. O arquivamento desativa o acesso e mantém o quintal salvo.

<br>

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

**Ready to contribute?** Please read our [Contributing Guidelines](./CONTRIBUTING.md) to get started.

<br>

## Preservation of digital heritage
- [Exemption to PCCPSACT](https://www.federalregister.gov/documents/2018/10/26/2018-23241/exemption-to-prohibition-on-circumvention-of-copyright-protection-systems-for-access-control), exemptions to the provision of the Digital Millennium Copyright Act (“DMCA”).
- [EFGAMP](https://efgamp.eu/), the European Federation of Video Game Archives, Museums and Preservation projects.
- [UNESCO PERSIST Programme](https://unescopersist.org/), helps ensure that digital information can continue to be accessed in the future.
- [The Internet Archive](https://archive.org/), a digital library of Internet sites and other cultural artifacts in digital form.
- [Flashpoint Archive](https://flashpointarchive.org/), the webgame preservation project.
- [Adobe Flash Player Archive](https://archive.org/download/flashplayerarchive/), the Adobe Inc. archive.org Flash Player Archive.
- [Stop Killing Games](https://www.stopkillinggames.com/) a campaign advocating for the legal right to preserve and play digital games.

<br />

## License [![GPL v3](https://img.shields.io/badge/GPL%20v3-blue)](http://www.gnu.org/licenses/gpl-3.0)

```
Backyard Monsters preservation project.
Copyright (C) 2025 | The Backyard Monsters Refitted team
See the GNU General Public License <https://www.gnu.org/licenses/>.
```
