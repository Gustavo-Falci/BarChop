# Plan: Home nova — marco 1, linha de base (contador de visita → cadastro)

**Source PRD**: `.claude/prds/home-nova.prd.md`
**Selected Milestone**: 1 — Linha de base
**Complexity**: Medium (2 PRs)

## Summary
Antes de trocar a home, o servidor passa a contar, por dia, as visitas à home atual e os cadastros que vieram dela, sem cookie, sem IP gravado e sem ferramenta de terceiros. O dono do produto vê os números numa aba nova do suporte ("Números"). Isso dá a linha de base para comparar com a home nova (marco 5).

## Decisões de desenho
- **Só contagens agregadas por dia** (`dia`, `evento`, `total`). Nada que identifique a pessoa: sem IP, sem user agent, sem id. Por isso não precisa de banner nem consentimento.
- **Visita** = a home carregou no navegador com JS e mandou um aviso (`POST /site/visita`). Robôs que não rodam JS não contam. Recarregar a página na mesma aba não conta de novo (marca em `sessionStorage`, que não é cookie e não sai do navegador).
- **Cadastro da home** = os links "Criar barbearia" do corpo da home passam a levar `?origem=home`. O redirecionamento do www para o `painel.` já preserva a busca (`apps/web/src/tenant/rota.ts:64`). O cadastro manda `origem: "home"` junto, e a API conta depois de a barbearia nascer. Os links do cabeçalho e do rodapé (que aparecem em todas as páginas do site) não levam a marca.
- **Cadastro total** também é contado (qualquer origem), para ver que fração vem da home.
- **Contar nunca derruba o cadastro**: o incremento roda depois da transação do signup; se falhar, vai para o log e o cadastro responde 201 normalmente.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Rotas | `apps/api/src/routers/avisos.ts:40` | `registrarRotasX(app)`, schema JSON com `additionalProperties: false`, `as const` |
| Escopo público com limite | `apps/api/src/app.ts:199-204` | escopo `abertas` com `rateLimit` (`global: false`) e limites explícitos por rota |
| Limites | `apps/api/src/lib/limites.ts:149` (`contador`) | `createRateLimit` com chave prefixada por rota (`visita-ip:${ip}`) |
| Escopo do suporte | `apps/api/src/app.ts:276` | rotas do operador atrás de `autenticarSuporte` |
| Signup | `apps/api/src/routers/auth.ts:16` (`corpoSignup`) | campo opcional novo no schema, sem quebrar o corpo atual |
| Erros | `apps/api/src/lib/erro-negocio.ts`, `erro-http.ts` | regra de domínio → 422 `ErroDeNegocio`; contagem não lança |
| Banco | `packages/database/prisma/schema.prisma`, `migrations/20261109120000_pix_do_barchop` | model em PT, migração com timestamp e nome em snake_case |
| Cliente da API | `packages/api-client/src/suporte.ts:43`, `publico.ts:70`, `falso.ts` | método no cliente real + implementação no falso |
| Testes da API | `apps/api/tests/routers/auth-signup.test.ts` | `buildApp()` + `app.inject`, conferindo o banco com `prisma` |
| Tela do suporte | `apps/web/src/telas/suporte/AvisosDoSuporte.tsx`, `src/suporte/CascaDoSuporte.tsx:10` | tela em `telas/suporte`, aba nova em `ABAS`, página em `app/(painel)/painel/suporte/…/page.tsx` |
| Testes do web | `apps/web/tests/telas/suporte/avisos-do-suporte.test.tsx` | Testing Library com a API falsa |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` | UPDATE | model `ContagemDoSite` (`dia` Date, `evento` String, `total` Int; chave `[dia, evento]`) |
| `packages/database/prisma/migrations/<ts>_contagem_do_site/migration.sql` | CREATE | tabela nova |
| `apps/api/src/lib/contagem-do-site.ts` | CREATE | `contar(evento)` (upsert +1 no dia de hoje em America/Sao_Paulo) e `lerContagens(dias)`; eventos fechados: `visita_home`, `cadastro`, `cadastro_da_home` |
| `apps/api/src/routers/site.ts` | CREATE | `POST /site/visita` (corpo `{ pagina: "home" }`), 204 |
| `apps/api/src/lib/limites.ts` | UPDATE | limite da visita por IP (ex.: 20 por minuto) |
| `apps/api/src/app.ts` | UPDATE | `/site/visita` no escopo `abertas`; `/suporte/numeros` no escopo do suporte |
| `apps/api/src/routers/auth.ts` | UPDATE | `origem` opcional (`enum: ["home"]`) no `corpoSignup`; contar depois do signup |
| `apps/api/src/routers/suporte.ts` | UPDATE | `GET /suporte/numeros?dias=30`: por dia e totais (visitas, cadastros da home, cadastros, taxa) |
| `packages/types/src/…` | UPDATE | `NovaBarbearia.origem?`, tipo `NumerosDoSite` |
| `packages/api-client/src/publico.ts`, `barbeiro.ts`, `suporte.ts`, `falso.ts` | UPDATE | `contarVisita()`, `signup` com origem, `numeros()` |
| `apps/web/src/site/ContaVisita.tsx` | CREATE | componente client sem visual: na montagem, se a aba ainda não contou, manda o aviso (`keepalive`) e marca o `sessionStorage` |
| `apps/web/src/site/Home.tsx` | UPDATE | renderiza `ContaVisita`; links "Criar barbearia" do corpo com `?origem=home` |
| `apps/web/src/telas/painel/CadastroDoDono.tsx` | UPDATE | lê `origem` da busca (só aceita `home`) e manda no signup |
| `apps/web/src/telas/suporte/NumerosDoSuporte.tsx` (+ `.module.css`) | CREATE | aba "Números": 7 e 30 dias lado a lado (visitas, cadastros da home, taxa, cadastros totais) e a lista por dia; sem caixas empilhadas |
| `apps/web/app/(painel)/painel/suporte/numeros/page.tsx` | CREATE | página da aba |
| `apps/web/src/suporte/CascaDoSuporte.tsx` | UPDATE | aba "Números" em `ABAS` |
| testes (ver Tasks) | CREATE / UPDATE | — |

## Tasks

**PR A — contar (API + home + cadastro)**

### Task 1: tabela e biblioteca de contagem
- **Action**: model + migração; `contagem-do-site.ts` com `contar` (upsert incrementando, dia no fuso de São Paulo) e `lerContagens`.
- **Mirror**: libs em `apps/api/src/lib`, datas no fuso como `lib/horas.ts`.
- **Validate**: teste da lib (RED → GREEN): duas chamadas no mesmo dia somam 2; dias diferentes viram linhas diferentes; evento fora da lista não compila.

### Task 2: `POST /site/visita`
- **Action**: rota pública no escopo `abertas`, corpo `{ pagina: "home" }`, 204; limite por IP.
- **Mirror**: `avisos.ts` (schema), `limites.ts` (`contador`).
- **Validate**: `tests/routers/site-visita.test.ts` — 204 e contagem +1; corpo torto → 400 sem contar; acima do limite → 429.

### Task 3: origem no signup
- **Action**: `origem` opcional; após criar, `contar("cadastro")` e, se `origem === "home"`, `contar("cadastro_da_home")`; falha de contagem só vai para o log.
- **Mirror**: `auth.ts` (signup), `auth-signup.test.ts`.
- **Validate**: casos novos em `auth-signup.test.ts`: sem origem conta só `cadastro`; com `home` conta os dois; origem desconhecida → 400; contagem quebrada não impede o 201.

### Task 4: home avisa a visita e marca os links
- **Action**: `ContaVisita` na home; links do corpo com `?origem=home`; cliente da API (`contarVisita`, real + falso).
- **Validate**: `tests/site/conta-visita.test.tsx` — conta uma vez por aba (sessionStorage), não conta de novo ao remontar, erro de rede não aparece para o visitante; teste da home confere o `?origem=home` nos botões do corpo e não no cabeçalho.

### Task 5: cadastro manda a origem
- **Action**: `CadastroDoDono` lê `origem` da URL e repassa; tipos e cliente.
- **Validate**: `tests/telas/painel/cadastro-do-dono.test.tsx` — com `?origem=home` o signup recebe `origem: "home"`; com `?origem=outra` ou sem nada, não manda origem.

**PR B — ver (aba Números do suporte)**

### Task 6: `GET /suporte/numeros`
- **Action**: rota no escopo do suporte; `dias` entre 1 e 90 (padrão 30); devolve os dias (inclusive os zerados) e totais com a taxa (cadastros da home ÷ visitas; `null` sem visitas).
- **Mirror**: `suporte.ts` (`/suporte/solicitacoes`), `suporte.test.ts`.
- **Validate**: `tests/routers/suporte-numeros.test.ts` — sem token de suporte → recusado como o resto do escopo; números e taxa certos; dia sem nada aparece zerado.

### Task 7: aba "Números"
- **Action**: tela, página e aba na casca; cliente `numeros()` real + falso.
- **Mirror**: `AvisosDoSuporte.tsx`; telas horizontais e sem pilha de caixas (regras do painel).
- **Validate**: `tests/telas/suporte/numeros-do-suporte.test.tsx` — mostra 7 e 30 dias, a taxa e o estado sem visitas ("ainda sem visitas contadas"); revisão no navegador em 375 e 1440 px.

## Validation
```bash
# de barchop/
pnpm --filter @barchop/database exec prisma migrate dev --name contagem_do_site   # gera a migração (banco local)
pnpm --filter @barchop/api exec vitest run tests/lib/contagem-do-site.test.ts tests/routers/site-visita.test.ts tests/routers/auth-signup.test.ts tests/routers/suporte-numeros.test.ts
pnpm --filter @barchop/web exec vitest run tests/site tests/telas/painel/cadastro-do-dono.test.tsx tests/telas/suporte/numeros-do-suporte.test.tsx
pnpm --filter @barchop/api exec tsc --noEmit && pnpm --filter @barchop/web exec tsc --noEmit
npx eslint <arquivos tocados>
```
Só os testes afetados, mais tsc e lint (regra do projeto).

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Alguém inflar as visitas mandando avisos em massa | Média | Limite por IP; números tratados como sinal; dá para zerar a tabela sem afetar nada |
| Bloqueador de anúncio barrar o aviso da visita | Média | Rota no domínio da própria API e nome neutro (`/site/visita`); a subcontagem é igual antes e depois, então a comparação continua valendo |
| Cadastro feito em outra aba ou outro dia perde a origem | Média | Aceito: mede o caminho direto home → cadastro; o total de cadastros fica ao lado |
| Migração em produção | Baixa | Tabela nova, sem mexer nas existentes; `migrate deploy` no deploy do dono |
| Pouco tráfego, números pequenos | Alta | Mostrar volumes junto da taxa; comparar só com volume mínimo (pergunta aberta do PRD) |

## Acceptance
- [ ] Visitas à home e cadastros vindos dela são contados por dia, sem cookie e sem dado pessoal
- [ ] Cadastro nunca falha por causa da contagem
- [ ] O dono do produto vê 7 e 30 dias, com a taxa, na aba "Números" do suporte
- [ ] Testes afetados, tsc e lint passando; telas aprovadas no navegador
- [ ] Patterns mirrored, not reinvented
