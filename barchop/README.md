# BarChop — monorepo

```
barchop/
├── apps/
│   ├── mobile/     # React Native + Expo — app do profissional (Onda 5)
│   ├── web/        # Next.js — página pública da barbearia, painel e site
│   └── api/        # Node.js + PostgreSQL — backend
├── packages/
│   ├── database/        # schema.sql + decisão de migration pendente
│   ├── types/            # interfaces TS espelhando o schema
│   ├── design-tokens/    # cores, tipografia, sombra — objetos JS puros
│   ├── scheduling/        # cálculo de horários disponíveis (regra de negócio pura)
│   └── config/            # tsconfig base compartilhado
├── pnpm-workspace.yaml
├── turbo.json
└── .npmrc                 # node-linker=hoisted, necessário pro Metro
```

## Por que essa divisão

- **`types`, `design-tokens`, `scheduling` não dependem de nenhum
  framework** — são só TypeScript puro, importáveis tanto pelo
  mobile (React Native) quanto pelo web (Next.js) quanto pela API.
- **`database` só é usado pela API.** Mobile e web nunca falam
  direto com o Postgres — sempre passam pela API.
- **`scheduling` é a peça mais importante de compartilhar**: é a
  regra "quais horários cabem" que precisa dar exatamente a mesma
  resposta em qualquer lugar que rodar. A fonte da verdade é sempre
  a chamada feita pela API (protegida também pela exclusion
  constraint do banco) — usar o mesmo pacote no client é só pra
  preview otimista, nunca pra validar de verdade.

## Setup inicial

```bash
corepack enable  # garante a versão certa do pnpm
pnpm install
pnpm dev          # roda mobile + web + api em paralelo via turbo
```

Cada app em `apps/` ainda precisa do scaffold da própria framework
por cima do `package.json` que já está aqui — veja o README de cada
um (`apps/mobile/README.md`, `apps/web/README.md`).

## Documentação

- [`docs/product-brief.md`](docs/product-brief.md) — problema, escopo do MVP, o fluxo central de agendamento
- [`docs/screens.md`](docs/screens.md) — as 23 telas mapeadas, por grupo
- [`docs/design-system.html`](docs/design-system.html) — identidade visual, abra no navegador (tem toggle de modo escuro)
- [`docs/decisions.md`](docs/decisions.md) — porquê de cada escolha técnica (monorepo, Fastify, Prisma, banco)
- [`docs/roadmap.md`](docs/roadmap.md) — o que falta, em ordem

## Pendências antes de codar de verdade

- [x] Framework HTTP da API: **Fastify**
- [x] ORM: **Prisma** (com a EXCLUDE constraint adicionada à mão na migration inicial — ver `packages/database/README.md`)
- [ ] Rodar o scaffold do Expo e do Next.js dentro de `apps/`
