# Plan: G1 — infra de produção (código em `barchop/infra/`)

**Source**: `.claude/plans/onda-1-agenda-que-funciona.plan.md` (bloco G, RETOMAR AQUI de 2026-10-07) e `barchop/docs/roadmap.md` (dívidas marcadas pro G)
**Selected Milestone**: Onda 1, Task G1, parte 1 (código no repo; subir na VM fica pra parte 2)
**Complexity**: Medium

## Summary

Tudo que a VM precisa pra rodar o BarChop, versionado no repo e sem segredo nenhum: imagens da API e do web, compose com Postgres, migração, backup diário e Caddy com certificado coringa por DNS-01 na Cloudflare. As imagens são montadas na própria VM (Ubuntu ARM/aarch64), então nada aqui depende de arquitetura. A parte 2 (clonar na VM, preencher o `.env`, subir) fica num roteiro, pra depois.

## Fatos do código que moldam o plano

- **Worker no processo da API** (`apps/api/src/server.ts:9-12`): api+worker = **um** serviço. Separar seria outro entrypoint; fora do escopo.
- **API sobe na 3333 fixa** (`server.ts:77`) e tem `GET /health` (`apps/api/src/app.ts:215`).
- **Bundle da API** é `tsup` com os `@barchop/*` embutidos e o Prisma externo (`apps/api/tsup.config.ts`); o `start` não lê `.env`, de propósito: variáveis vêm do container.
- **`criar-suporte` roda com `tsx` sobre o TS** (`apps/api/package.json`); na imagem de produção não há `tsx` nem fonte. A conta de suporte de produção está na lista do G, então o script precisa entrar no bundle.
- **Web** sem `output: "standalone"` (`apps/web/next.config.js`); `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_URL_DO_SITE` são embutidos no build (`apps/web/.env.local.example`), então a imagem do web é por ambiente (build args).
- **SSR chama a API** só em `app/(publico)/[slug]/layout.tsx` (perfil da barbearia, `GET /barbearias/:slug`, sem limite por IP hoje). O site de marketing não chama a API do navegador, então o apex não precisa entrar em `ORIGENS_PERMITIDAS`.
- **`api` é slug reservado** (`packages/formato/src/slug.ts:13`): a API fica em `api.barchop.com.br`.
- **Postgres de dev é 18**: a imagem de produção fica no 18 também. No 18 o volume monta em `/var/lib/postgresql` (não mais em `.../data`).
- **Prisma** sem `binaryTargets` (`packages/database/prisma/schema.prisma`): gerando dentro da imagem, na VM, sai o engine arm64 sozinho. `prisma` é devDependency, então quem roda `migrate deploy` é um alvo de build próprio.
- **Sem Docker neste PC.** Build das imagens, Caddy e compose só são provados na VM.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Comentários | `apps/api/tsup.config.ts`, `apps/api/.env.example` | Comentário em português explicando o **porquê** de cada escolha, não o quê |
| Variáveis | `apps/api/.env.example` | Cada variável documentada, comentada quando opcional, dizendo o que acontece sem ela |
| Segredos | `apps/api/.env.example:12-14` | Produção recebe do container, nunca de arquivo no repo |
| Testes | `apps/api/tests`, `apps/web` (Vitest) | Só as duas mudanças de app ganham teste/verificação; infra não tem RED/GREEN |

Não há Dockerfile, compose nem Caddyfile no repo: não existe padrão de infra a copiar.

## PRs

### G1a — app pronto pra empacotar (testável aqui, segue o combinado: push+PR+merge com testes verdes)

| File | Action | Why |
|---|---|---|
| `barchop/apps/web/next.config.js` | UPDATE | `output: "standalone"` + `outputFileTracingRoot` na raiz do monorepo |
| `barchop/apps/api/tsup.config.ts` | UPDATE | `scripts/criar-suporte.ts` como segunda entrada (sai `dist/criar-suporte.js`) |
| `barchop/apps/api/scripts/criar-suporte.ts` | UPDATE | Comentário do uso em produção. Sem script `criar-suporte:prod`: a imagem não tem pnpm, roda `node dist/criar-suporte.js` direto |

**Validar:** `pnpm --filter @barchop/web build` e `node .next/standalone/apps/web/server.js` com `.next/static` e `public` copiados: páginas abrem **com** CSS e JS; `pnpm --filter @barchop/api build` gera as duas entradas; tsc + lint + testes afetados de web e api.

### G1b — `barchop/infra/` (só config; validação completa só na VM)

| File | Action | Why |
|---|---|---|
| `barchop/.dockerignore` | CREATE | Contexto do build é `barchop/`; fora `node_modules`, `.next`, `dist`, `.env*`, `.arquivos`, `.turbo` |
| `barchop/infra/api.Dockerfile` | CREATE | Alvos `build`, `migrar` e `api` (runtime) |
| `barchop/infra/web.Dockerfile` | CREATE | Build com args `NEXT_PUBLIC_*`, runtime standalone |
| `barchop/infra/caddy/Dockerfile` | CREATE | `xcaddy build --with github.com/caddy-dns/cloudflare` |
| `barchop/infra/caddy/Caddyfile` | CREATE | Certificado do apex + coringa, rotas, log sem token do lembrete |
| `barchop/infra/compose.yaml` | CREATE | postgres, migrar, api, web, caddy, backup |
| `barchop/infra/backup/backup.sh` | CREATE | `pg_dump` diário com retenção de N dias |
| `barchop/infra/.env.example` | CREATE | Toda variável que a produção exige, sem valores |
| `barchop/infra/README.md` | CREATE | Roteiro da parte 2 (ver Tarefa 7) |

## Tasks

### Tarefa 1 (G1a): web standalone
- **Action**: `output: "standalone"`, `outputFileTracingRoot: path.join(__dirname, "../..")`. Comentar por que a raiz (pnpm workspace + `transpilePackages`).
- **Validate**: build + `server.js` local servindo `/`, `/painel/entrar` e uma página de barbearia com estilo.

### Tarefa 2 (G1a): `criar-suporte` no bundle
- **Action**: entrada nova no tsup. O script lê `SENHA_DO_SUPORTE` do ambiente como hoje.
- **Validate**: `dist/criar-suporte.js` existe e só depende de `@prisma/client` e de módulos do Node.

**Feito (PR #56).** G1b na branch `onda-1-bloco-g1b` (em cima do G1a): install filtrado + build da API e do web provados num clone limpo neste PC; o filtro não reduz nada com `node-linker=hoisted` (instala os 830 pacotes, Expo junto — imagem maior). Token da Cloudflare precisa de **Zone:Read + DNS:Edit**. Os dois PRs ficam abertos até o compose rodar na VM; ajustes vão na própria branch.

### Tarefa 3: imagem da API
- **Action**: base `node:22-bookworm-slim` (Debian, não Alpine, por causa do Prisma) com `openssl`; pnpm 9 por corepack (igual ao `packageManager`); `pnpm install --frozen-lockfile --filter @barchop/api...` (sem puxar o `apps/mobile`/Expo); `prisma generate` dentro da imagem; `tsup`. Alvo `migrar`: `prisma migrate deploy` e sai. Alvo `api`: `node dist/server.js`, usuário sem root, `NODE_ENV=production`. Se o `pnpm deploy --prod` perder o `.prisma/client` gerado, copiar o `node_modules` da instalação filtrada (imagem maior, sem surpresa).
- **Mirror**: comentários no estilo do `tsup.config.ts`.

### Tarefa 4: imagem do web
- **Action**: mesma base; `--filter @barchop/web...`; `ARG NEXT_PUBLIC_API_URL`, `ARG NEXT_PUBLIC_URL_DO_SITE` antes do `next build`; runtime copia `standalone`, `.next/static` e `public`; `HOSTNAME=0.0.0.0`, `PORT=3000`.

### Tarefa 5: Caddy
- **Action**:
  - Imagem com `xcaddy` + `caddy-dns/cloudflare`.
  - Global `acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}` e e-mail do ACME.
  - `api.barchop.com.br` → `api:3333`; `barchop.com.br, *.barchop.com.br` → `web:3000`. O coringa não cobre o apex: os dois nomes no certificado.
  - O Caddy já repassa o `Host` original (o `proxy.ts` decide por ele) e põe `X-Forwarded-For`: um salto = `PROXIES_CONFIAVEIS=1`.
  - **Dívida do roadmap:** o token do lembrete passa na URL (`/<slug>/lembrete/<token>` no web, `/lembretes/<token>` na API). Log de acesso com o `uri` filtrado (trocar o token por `***`), ou sem log de acesso.
  - Só 80, 443 e 443/udp publicados. 5432, 3333 e 3000 nunca.
  - Alias de rede `api.barchop.com.br` no serviço caddy: o SSR do web resolve a API por dentro da rede do compose, com TLS válido, sem sair pelo IP público.

### Tarefa 6: compose, Postgres e backup
- **Action**:
  - `postgres:18` com volume em `/var/lib/postgresql` e healthcheck `pg_isready`.
  - `migrar` depende do postgres saudável; `api` depende de `migrar` com `service_completed_successfully`.
  - `restart: unless-stopped` nos de longa duração.
  - `backup`: imagem `postgres:18`, laço diário de `pg_dump -Fc` num volume próprio, apaga os mais velhos que N dias (padrão 14).
  - Variáveis: `env_file: .env` na API; build args do web saem do mesmo `.env`.
- **Limite conhecido:** backup no mesmo disco da VM não sobrevive à perda do disco. Copiar pro bucket da OCI quando o bucket existir (anotar no roadmap).

### Tarefa 7: `.env.example` e roteiro
- **Action**:
  - `.env.example`: `POSTGRES_*`, `DATABASE_URL` (host `postgres`), `JWT_SECRET`, `CANAL_DE_MENSAGEM=email` + `RESEND_API_KEY` + `EMAIL_REMETENTE`, `ARMAZENAMENTO=s3` + `S3_*` + `URL_PUBLICA_DAS_IMAGENS`, `PROXIES_CONFIAVEIS=1`, `ORIGENS_PERMITIDAS`, `URL_DAS_BARBEARIAS`, `URL_DO_PAINEL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_URL_DO_SITE`, `CLOUDFLARE_API_TOKEN`, e-mail do ACME.
  - `README.md` (parte 2): clonar, `cp .env.example .env` e preencher **na VM**, liberar 80/443 **também no iptables do Ubuntu da OCI** (a imagem vem com regras que recusam, mesmo com a security list aberta), `docker compose up -d --build`, criar a conta de suporte, restaurar um backup (testar uma vez), atualizar (pull + `up -d --build`).

## Validation

```bash
# G1a, neste PC
pnpm --filter @barchop/web build
pnpm --filter @barchop/api build
pnpm --filter @barchop/web exec tsc --noEmit
pnpm --filter @barchop/api exec tsc --noEmit
pnpm lint
# + testes afetados (web e api)

# G1b, só na VM (parte 2)
docker compose -f infra/compose.yaml config
docker compose -f infra/compose.yaml build
docker compose -f infra/compose.yaml run --rm caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f infra/compose.yaml up -d
curl -I https://api.barchop.com.br/health
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| G1b não roda neste PC (sem Docker) | Certa | G1a validado aqui; G1b provado na VM ou com Docker Desktop instalado (ver pergunta abaixo) |
| Bucket S3 não existe: em produção a API não sobe sem `ARMAZENAMENTO=s3` | Certa | **Bloqueia a parte 2, não este PR.** Criar bucket + Customer Secret Key antes de subir |
| `pnpm deploy` perde o Prisma Client gerado | Média | Copiar `node_modules` da instalação filtrada |
| Prisma/OpenSSL no ARM | Baixa | Debian slim + `openssl` + `generate` na própria VM |
| Assets 404 no standalone | Média | Copiar `.next/static` e `public`; checado no G1a |
| Token do lembrete no log do Caddy | Certa sem filtro | Filtro do `uri` (Tarefa 5) |
| SSR saindo pelo IP público da VM | Média | Alias de rede `api.barchop.com.br` no caddy |
| Backup no mesmo disco | Certa | Anotado; cópia pro bucket depois |
| iptables da OCI recusando 80/443 | Alta | Passo explícito no roteiro |

## Acceptance

- [ ] G1a: web standalone serve páginas com CSS/JS; `dist/` com as duas entradas; tsc, lint e testes verdes; mergeado
- [ ] G1b: arquivos em `infra/` revisados; nenhum segredo no repo; roteiro da parte 2 escrito
- [ ] Parte 2 (depois): `docker compose up` na VM, `https://api.barchop.com.br/health` 200, certificado do apex e do coringa emitidos
