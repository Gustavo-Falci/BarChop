# Plan: Onda 0 — Casa arrumada

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 0 — Onda 0 — Casa arrumada
**Complexity**: Medium

## Summary
Deixar a base pronta para virar SaaS antes de crescer: documentação reescrita como produto multi-tenant, slugs que nunca colidem com rotas do sistema (e que o dono consegue trocar), nenhum agendamento criado ou movido para o passado, disponibilidade que conhece o "agora", e a Fase 4 da conta (trocar senha derruba sessões + esqueci a senha do barbeiro por e-mail). Tudo com `ecc:tdd-workflow` (commit RED, depois GREEN), numa branch `onda-0` com PR.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `barchop/apps/api/src/lib/padroes.ts:9` | Constantes `PADRAO_*` compartilhadas entre rotas, comentário explicando o porquê |
| Schema | `barchop/apps/api/src/routers/auth-cliente.ts:15` | JSON Schema `as const` no topo do router, `additionalProperties: false` |
| Errors | `barchop/apps/api/src/lib/erro-negocio.ts:7` | `ErroDeNegocio(mensagem, codigo)` → 422 com código estável em snake_case |
| Guard de regra | `barchop/apps/api/src/lib/agendamento-alteravel.ts:7` | Guarda pura que lança `ErroDeNegocio`, compara data/hora como string via `agoraNaBarbearia` |
| Auth | `barchop/apps/api/src/plugins/auth.ts:59` | Hook `onRequest` lê o banco a cada requisição; 401 via `Object.assign(new Error, {statusCode})` |
| Códigos | `barchop/apps/api/src/lib/codigos.ts:10` | `emitirCodigo`/`consumirCodigo` com `Finalidade` (`senha_barbeiro` já previsto) |
| Anti-enumeração | `barchop/apps/api/src/routers/auth-cliente.ts:31` | Resposta idêntica com ou sem conta |
| Migrations | `barchop/packages/database/prisma/migrations/20261001120000_codigo_verificacao` | SQL escrito à mão, aplicado com `migrate deploy` (nunca `migrate dev`) |
| Tests (API) | `barchop/apps/api/tests/routers/auth-cliente-senha.test.ts:1` | Vitest + `buildApp()` + `app.inject`, helpers em `tests/helpers/`, Postgres `barchop_test` |
| Tests (web) | `barchop/apps/web/tests/telas/painel/entrar-no-painel.test.tsx` | Vitest + Testing Library contra o dublê do `api-client` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/docs/product-brief.md` | UPDATE | Reescrever como SaaS (público, papéis, receita, ondas), apontando para o PRD |
| `barchop/docs/roadmap.md` | UPDATE | Reorganizar em ondas; histórico atual vira "Feito até 2026-10-02"; dívidas resolvidas saem |
| `barchop/docs/decisions.md` | UPDATE | ADRs: SaaS em ondas; tenant por subdomínio; pg-boss; WhatsApp Cloud API; Asaas; site em route group; fim do superpowers |
| `barchop/packages/formato/src/slug.ts` | CREATE | `PADRAO_SLUG` + `SLUGS_RESERVADOS` + `slugValido()` — compartilhado por API e web (e pelo middleware de subdomínio da Onda 1) |
| `barchop/packages/formato/src/index.ts` | UPDATE | Exportar slug |
| `barchop/apps/api/src/lib/padroes.ts` | UPDATE | `SCHEMA_SLUG` (`pattern` + `not: { enum: reservados }`) |
| `barchop/apps/api/src/routers/{auth,auth-cliente,barbearias,agendamentos,disponibilidade,servicos}.ts` | UPDATE | Trocar os 6 patterns duplicados por `SCHEMA_SLUG` |
| `barchop/apps/api/src/routers/barbearias.ts` | UPDATE | `GET /barbearias/me`; `PATCH /barbearias/me/slug` (409 se ocupado) |
| `barchop/apps/api/src/lib/agendamento-alteravel.ts` | UPDATE | `garantirFuturo(data, horaInicio)` |
| `barchop/apps/api/src/routers/agendamentos.ts`, `clientes-me.ts` | UPDATE | Chamar `garantirFuturo` no criar público e no remarcar |
| `barchop/apps/api/src/routers/disponibilidade.ts` | UPDATE | Dia: descarta horários ≤ agora (hoje) e dias passados; mês: hoje sem sobra e dias passados sem vaga |
| `barchop/packages/database/prisma/schema.prisma` + migration `20261002120000_senha_alterada_em` | UPDATE/CREATE | `senha_alterada_em timestamptz` em `cliente` e `barbeiro` |
| `barchop/apps/api/src/plugins/auth.ts` | UPDATE | Recusar token com `iat` anterior a `senhaAlteradaEm` (nos dois hooks) |
| `barchop/apps/api/src/routers/auth-cliente.ts` | UPDATE | Gravar `senhaAlteradaEm` ao definir senha |
| `barchop/apps/api/src/routers/auth.ts` | UPDATE | `POST /auth/codigo` (resposta uniforme) e `POST /auth/senha` (finalidade `senha_barbeiro`, grava `senhaAlteradaEm`); limites em `lib/limites.ts` |
| `barchop/apps/api/src/lib/canal.ts` | UPDATE (se preciso) | Destino e-mail para o código do barbeiro (log/memória; provedor real é Onda 1) |
| `barchop/packages/api-client/src/*` + dublê | UPDATE | `minhaBarbearia()`, `trocarSlug()`, `pedirCodigoBarbeiro()`, `definirSenhaBarbeiro()` |
| `barchop/apps/web/src/telas/painel/EntrarNoPainel.tsx` | UPDATE | Caminho "Esqueci a senha" (e-mail → código → nova senha) |
| `barchop/apps/web/src/telas/painel/Configuracoes*.tsx` | UPDATE | Ler via `GET /barbearias/me`; campo de link (slug) com troca; atualiza o slug salvo na sessão |
| `barchop/apps/web/src/telas/painel/*` (cadastro de barbearia) | UPDATE | Validar slug reservado no front com `slugValido()` |
| tests correspondentes em `apps/api/tests/**` e `apps/web/tests/**` | CREATE/UPDATE | RED antes de cada GREEN |

## Tasks
### Task 1: Docs do SaaS
- **Action**: reescrever `product-brief.md`, reorganizar `roadmap.md` em ondas, registrar ADRs em `decisions.md` (via `ecc:architecture-decision-records`), e reescrever `screens.md` como mapa de telas do SaaS por onda (✅ existe / 🔧 muda / 🆕 nova, com o equivalente no Barbeiro.app). `docs/superpowers/` fica como histórico, sem arquivos novos.
- **Mirror**: tom e formato dos docs atuais (português, "porquê" antes do "quê").
- **Validate**: leitura; links para `.claude/prds/barchop-saas.prd.md` e este plano.

### Task 2: Slugs reservados num lugar só
- **Action**: `packages/formato/src/slug.ts` com `PADRAO_SLUG = ^[a-z0-9-]{3,80}$` e `SLUGS_RESERVADOS` (`www`, `admin`, `api`, `app`, `painel`, `docs`, `blog`, `ajuda`, `suporte`, `status`, `mail`, `entrar`, `cadastro`, `precos`, `gratis`, `funcionalidades`, `comparar`, `sobre`, `termos`, `privacidade`, `barchop`, …). API usa `SCHEMA_SLUG` em todas as rotas; signup com slug reservado → 400. Conferir que nenhuma barbearia existente usa slug reservado.
- **Mirror**: `padroes.ts`, `packages/formato/src/email.ts`.
- **Validate**: `auth-signup.test.ts` (reservado → 400), teste unitário do `slug.ts`.

### Task 3: `GET /barbearias/me`
- **Action**: rota no escopo do barbeiro devolvendo o mesmo DTO do PATCH; Configurações do painel passa a ler por ela.
- **Mirror**: `barbearias.ts` (PATCH `/barbearias/me`), `serializar.ts`.
- **Validate**: `barbearias-me.test.ts` (200 com token, 401 sem, não vaza outra barbearia); teste da tela.

### Task 4: Trocar o slug
- **Action**: `PATCH /barbearias/me/slug { slug }` — 400 formato/reservado, 409 `slug_em_uso`, 200 com o novo slug. No painel, campo "Link da barbearia" em Configurações com prévia do link e atualização do slug guardado na sessão.
- **Mirror**: tratamento de P2002 → 409 em `plugins/erros.ts`.
- **Validate**: testes da rota (sucesso, em uso, reservado, igual ao atual) e da tela.

### Task 5: `garantirFuturo`
- **Action**: guarda ao lado de `garantirAlteravel`; chamada em `POST /barbearias/:slug/agendamentos` e em `.../remarcar` (destino). Criação manual pelo barbeiro **continua aceitando passado** (registro retroativo de walk-in) — decisão registrada no roteiro.
- **Mirror**: `agendamento-alteravel.ts` (comparação por string, `agoraNaBarbearia`).
- **Validate**: `agendamentos-publico.test.ts` e `clientes-me-remarcar.test.ts` com data passada → 422 `horario_passado`.

### Task 6: Disponibilidade conhece o "agora"
- **Action**: rota do dia descarta horários já passados hoje e devolve vazio para dia passado; rota do mês não marca hoje sem sobra nem dias passados.
- **Mirror**: `routers/disponibilidade.ts`, `lib/horas.ts`.
- **Validate**: `disponibilidade-dia.test.ts`, `disponibilidade-mes.test.ts` com relógio controlado (`vi.setSystemTime`).

### Task 7: Trocar a senha derruba sessões (Fase 4a)
- **Action**: migration à mão com `senha_alterada_em` (nullable) em `cliente` e `barbeiro`; `auth.ts` recusa token com `iat < floor(senhaAlteradaEm / 1000)`; definir senha grava o carimbo e emite token novo, que continua válido.
- **Mirror**: hook `autenticar`/`autenticarCliente` (já faz uma query por requisição).
- **Validate**: teste: token antigo → 401 depois da troca; token novo → 200.
- **Note**: precisa de `prisma generate` — **parar o `pnpm dev`** antes (Windows trava a DLL do Prisma → EPERM).

### Task 8: Esqueci a senha do barbeiro (Fase 4b)
- **Action**: `POST /auth/codigo { email }` → sempre 202; `POST /auth/senha { email, codigo, senha }` → 200 + token, ou 422 `codigo_invalido`; limites por IP e por e-mail. Tela `/painel/entrar` ganha "Esqueci a senha".
- **Mirror**: `auth-cliente.ts` (rotas `codigo`/`senha`), `lib/limites.ts`, tela `/[slug]/entrar`.
- **Validate**: `auth-barbeiro-senha.test.ts` (uniforme com/sem conta, código errado, expirado, reusado, derruba sessões); teste da tela.

### Task 9: Fechar a onda
- **Action**: tirar do roteiro as dívidas resolvidas, atualizar contagem das suítes, PRD linha 0 → `complete`, PR da branch `onda-0`.
- **Validate**: suítes verdes, `ecc:code-review` limpo.

## Validation
```bash
cd barchop
pnpm --filter @barchop/database migrate:deploy
pnpm --filter @barchop/database generate
pnpm type-check
pnpm test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Algum slug existente cair na lista de reservados | Low | Query no banco local antes; GR Barber é `gr-barber` |
| `prisma generate` com `pnpm dev` rodando → EPERM | High | Pedir para parar o dev antes da Task 7 |
| `iat` em segundos vs carimbo em ms rejeitar o token recém-emitido | Medium | Comparar no mesmo segundo arredondando para baixo; teste específico |
| Disponibilidade com relógio real deixar testes instáveis | Medium | `vi.setSystemTime` em todos os testes novos de tempo |
| Trocar o slug quebra links já enviados por WhatsApp | Medium | Aviso na tela; redirect do slug antigo fica para a Onda 1 (junto do subdomínio) |

## Acceptance
- [x] All tasks complete (Tasks 1–8 com RED/GREEN; Task 9 = esta revisão + docs; PR pendente de push)
- [x] Validation passes — type-check ok; API 367, web 458, api-client 54, formato 19 (lint: nenhum pacote tem script)
- [x] Patterns mirrored, not reinvented

## Desvios do plano
- `SCHEMA_SLUG` virou só `PADRAO_SLUG` (string) + `slugReservado()` checado no handler: reservado é regra de domínio, então 422 `slug_reservado`, e não 400 de schema.
- Task 3 e Task 4 saíram num ciclo só (mesma rota e mesma tela).
- Preparação extra nos testes da API: datas fixas de 2026-09 já tinham passado e cairiam no `garantirFuturo`; viraram datas relativas (`tests/helpers/datas.ts`) e, no mês, 2037 (calendário idêntico ao de 2026).
- A revisão achou e corrigiu um bug (trocar o link apagava edição não salva) e registrou três dívidas no roteiro.
