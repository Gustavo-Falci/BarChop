# Plan: Prisma 5.22 → 7 (substitui o #411 do Dependabot)

**Origem**: PR #411 do Dependabot (só sobe o CLI `prisma` para 7.10.1 e deixa o `@prisma/client` no 5: o CI falha em "Tipos, lint e testes" e em "Dependências com falha conhecida").
**Complexidade**: Média/Grande (um PR, mas mexe no acesso ao banco de toda a API)

## Summary
O Prisma 7 troca o motor em Rust por driver adapter (`@prisma/adapter-pg` sobre o `pg`). O cliente passa a ser gerado numa pasta nossa (`output` obrigatório, gerador `prisma-client`). A URL sai do `schema.prisma` para o `prisma.config.ts`, e o `.env` deixa de ser carregado sozinho. O schema e as migrations não mudam e não há migração de banco. O risco está em como o `pg` devolve erros, `@db.Date`/`@db.Time` e o pool.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Cliente único | `packages/database/src/index.ts` | singleton no `globalThis` fora de produção, `export *` do cliente |
| Erros do banco | `apps/api/src/plugins/erros.ts:41-80` | P2025→404, P2002→409, P2023→400; 23P01 + nome da constraint → 409 `horario_ocupado` |
| Deadlock | `apps/api/src/lib/transacao.ts:14` | 40P01 → repete uma vez |
| Bundle da API | `apps/api/tsup.config.ts` | `@barchop/*` entram no bundle, Prisma fica externo |
| Testes | `apps/api/tests/global-setup.ts`, `vitest.config.mts` | `.env.test` via dotenv, `migrate deploy` no banco `*_test` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/database/package.json` | UPDATE | `prisma@7`, `@prisma/client@7`, `@prisma/adapter-pg@7`, `dotenv` (dev) |
| `barchop/packages/database/prisma/schema.prisma` | UPDATE | gerador `prisma-client` (`output`, `moduleFormat = "cjs"`, `runtime = "nodejs"`); tirar `url` do datasource |
| `barchop/packages/database/prisma.config.ts` | CREATE | `defineConfig`: schema, migrations, `datasource.url` |
| `barchop/packages/database/src/index.ts` | UPDATE | `new PrismaClient({ adapter: new PrismaPg(...) })`, exportar do cliente gerado |
| `barchop/.gitignore` | UPDATE | ignorar `packages/database/src/generated/` |
| `barchop/apps/api/tsup.config.ts` | UPDATE | externos: `@prisma/client`, `@prisma/adapter-pg`, `pg` (sai o `.prisma/client`) |
| `barchop/apps/api/src/plugins/erros.ts` | UPDATE (se medir diferente) | formato novo do erro 23P01 |
| `barchop/apps/api/src/lib/transacao.ts` | UPDATE (se medir diferente) | formato novo do erro 40P01 |
| `barchop/apps/api/tests/erros.test.ts`, `tests/lib/transacao.test.ts` | UPDATE | os erros montados à mão passam a ter o formato novo |
| `barchop/infra/api.Dockerfile` | UPDATE | comentários do "motor" (sem binário nativo agora); conferir o estágio `migrar` com o config |
| `barchop/packages/database/README.md`, `packages/types/src/index.ts` | UPDATE | textos que citam `@prisma/client` / 5.22 |
| `barchop/pnpm-lock.yaml` | UPDATE | — |

## Tasks
### Task 0: Base verde na main
- Subir o Docker Desktop e o Postgres local. Rodar na `main` os testes de banco que importam (`erros`, `transacao`, `agendamentos-conflito`, `banco*`, `horarios`, `varias-pausas`, `disponibilidade`) para ter a base.
- **Validate**: todos verdes antes de mexer.

### Task 1: Dependências e gerador
- Branch `prisma-7` com `--no-track` a partir da `main`. Subir os três pacotes para 7.x e rodar `pnpm install`.
- Gerador `prisma-client` com `output = "../src/generated/prisma"`, `moduleFormat = "cjs"` (a API é CJS) e `runtime = "nodejs"`. Pôr `src/generated/` no `.gitignore`.
- `prisma.config.ts` com `import "dotenv/config"` (só o `.env` do pacote; não sobrescreve o `DATABASE_URL` do teste) e `url: process.env.DATABASE_URL ?? ""`, em vez de `env()`. O `env()` lança sem a variável, e o `prisma generate` do Docker e do CI roda sem banco.
- **Validate**: `pnpm --filter @barchop/database build` gera o cliente.

### Task 2: Cliente com adapter
- `index.ts`: `new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 })`. Os 5 s repetem o timeout do v5; sem isso o `pg` espera para sempre. Depois `export * from "./generated/prisma/client"`.
- **Validate**: `pnpm type-check` (API, web e pacotes) e `pnpm exec eslint apps packages`.

### Task 3: Medir os erros e ajustar (TDD)
- Com o banco real: os testes de conflito de horário (23P01) e de unique (P2002), um 404 (P2025) e um id não UUID (P2023). Ver que classe e que `code`/`meta` chegam pelo adapter.
- Ajustar `erros.ts` e `transacao.ts` ao formato medido: de preferência ler o SQLSTATE do campo estruturado, não da mensagem. Atualizar os testes de unidade com o formato novo.
- **Validate**: `erros.test.ts`, `transacao.test.ts` e `agendamentos-conflito.test.ts` verdes.

### Task 4: Datas, horas e o resto da API
- `@db.Date` e `@db.Time` (agenda, ciclos, horários) pelo `pg`. Rodar aqui (fuso de São Paulo) os testes de disponibilidade, horários, pausas, ciclos e assinaturas; o CI roda em UTC, e os dois fusos se cobrem.
- **Validate**: esses arquivos verdes localmente. A suíte inteira fica para o CI.

### Task 5: Bundle e imagem
- tsup: o cliente gerado é TS nosso e entra no bundle; `@prisma/client` (runtime), `@prisma/adapter-pg` e `pg` ficam externos.
- Montar a imagem `api` e a `migrar` local (`docker build --target ...`). Rodar `migrar` contra o banco local e a `api` com `/health` respondendo.
- **Validate**: `pnpm --filter @barchop/api build`; a imagem sobe e o `/health` responde 200.

### Task 6: PR
- PR "chore(deps): Prisma 7 com driver adapter", dizendo que substitui o #411. Depois do merge (só com "pode mergear"), fechar o #411 com um comentário.
- O deploy é da API e da imagem `migrar` (o dono faz). O web não usa o Prisma, e não há migration nova.

## Validation
```bash
cd barchop
pnpm --filter @barchop/database build
pnpm type-check
pnpm exec eslint apps packages
pnpm --filter @barchop/api exec vitest run tests/erros.test.ts tests/lib/transacao.test.ts tests/routers/agendamentos-conflito.test.ts tests/banco*.test.ts tests/routers/horarios.test.ts tests/routers/varias-pausas.test.ts
pnpm --filter @barchop/api build
docker build -f infra/api.Dockerfile --target api -t barchop-api:prisma7 .
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 23P01/40P01 chegam em outro formato e o "horário ocupado" vira 500 | Alta | Task 3 mede com banco real antes de ajustar; o teste de conflito concorrente prova |
| `@db.Date`/`@db.Time` lidos com deslocamento de fuso pelo `pg` | Média | testes da agenda em São Paulo (local) e UTC (CI) |
| Pool do `pg` (máx. 10, sem timeout) diferente do v5 | Média | `connectionTimeoutMillis: 5000`; 10 conexões dão para uma VM só |
| `prisma generate` sem `DATABASE_URL` no build | Média | `process.env ... ?? ""` no config, não `env()` |
| Cliente CJS gerado + tsup | Média | `moduleFormat = "cjs"`; o build e a imagem local provam |
| `?schema=public` ignorado pelo adapter | Baixa | `public` já é o padrão |
| Alguma 7.x mais nova mudou algo fora do guia de upgrade | Baixa | ler o changelog 7.1→7.10 na Task 1 |

## Acceptance
- [ ] #411 substituído por um PR com CI verde
- [ ] erros 404/409/400/`horario_ocupado` e retry de deadlock com o mesmo comportamento
- [ ] imagem da API e da migração montadas e funcionando local
- [ ] nenhuma migration nova
