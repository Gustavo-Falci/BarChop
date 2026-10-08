# Plan: Painel v2 — Listas

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 5 — Listas
**Complexity**: Medium

## Summary
Serviços, Clientes e Equipe passam a usar as peças do marco 1 que ainda não têm uso em tela: `PilulasDeFiltro` (filtro com contagem e cor) e `Tabela` com `grupos`. Serviços agrupa por categoria com a faixa de preço de cada grupo; Clientes troca as faixas feitas à mão por pílulas com contagem **contada no servidor** (hoje só "Todos" tem número, porque as outras filtram o que está carregado); Equipe ganha pílulas por situação. A única mudança de API é o filtro/contagem por faixa em `GET /clientes`. Paginação continua "Carregar mais" (decidido no marco 1).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `apps/web/src/telas/painel/ListaDeServicos.tsx:51` | tela em PascalCase português, CSS Module irmão, comentário dizendo o porquê |
| Filtro | `apps/web/src/componentes/PilulasDeFiltro.tsx:20` | `opcoes: { valor, rotulo, contagem?, tom? }`, um ativo por vez, `aria-pressed` |
| Grupos | `apps/web/src/componentes/Tabela.tsx:19` | `grupos: { id, titulo, resumo?, linhas }[]`; grupo vazio não aparece; vazio só quando todos estão |
| Conta pura | `apps/web/src/painel/metricas.ts` | regra da tela em função pura testada à parte, a tela só desenha |
| Data de hoje na API | `apps/api/src/lib/horas.ts:91` | `agoraNaBarbearia()` no fuso `America/Sao_Paulo`; `dataParaDate` pra comparar com coluna `date` |
| Consulta | `apps/api/src/routers/clientes.ts:140` | `onde` sempre com `barbeariaId` do token; `count` com o mesmo `onde` da página |
| Errors (web) | `apps/web/src/telas/painel/ListaDeClientes.tsx:241` | `Aviso` com `erro.mensagem` ou frase em português; falha de "carregar mais" ao lado do botão |
| Tests API | `apps/api/tests/routers/clientes.test.ts` | Vitest + banco de teste real, `describe` por rota, `it` em frase |
| Tests tela | `apps/web/tests/telas/painel/servicos.test.tsx` | Testing Library com dublê da API, consulta por papel; esperar conteúdo carregado antes de procurar o botão |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/src/painel/listas.ts` | CREATE | contas puras: agrupar serviços por categoria, faixa de preço, situação do membro |
| `apps/web/tests/painel/listas.test.ts` | CREATE | testes das contas puras |
| `apps/web/src/telas/painel/ListaDeServicos.tsx` + `.module.css` | UPDATE | pílulas + grupos por categoria + busca por nome + coluna "Onde aparece" |
| `apps/web/tests/telas/painel/servicos.test.tsx` | UPDATE | grupos, pílulas, busca |
| `apps/api/src/routers/clientes.ts` | UPDATE | `?faixa=recentes\|sumidos` e `contagens` na resposta |
| `packages/types/src/index.ts` | UPDATE | `FaixaDeCliente`, `PaginaDeClientes.contagens` |
| `packages/api-client/src/*` (+ dublê do web) | UPDATE | `clientes(busca, cursor, faixa)` |
| `apps/api/tests/routers/clientes.test.ts` | UPDATE | filtro e contagens por faixa |
| `apps/web/src/telas/painel/ListaDeClientes.tsx` + `.module.css` | UPDATE | `PilulasDeFiltro` com contagem do servidor, faixa na URL, coluna "Situação" |
| `apps/web/tests/telas/painel/clientes.test.tsx` | UPDATE | pílulas com número, troca de faixa pede à API |
| `apps/web/src/telas/painel/ListaDaEquipe.tsx` + `.module.css` | UPDATE | pílulas por situação, nome + e-mail na mesma célula, coluna "Situação" |
| `apps/web/tests/telas/painel/equipe.test.tsx` | UPDATE | filtros e situação |
| `barchop/docs/screens.md`, PRD, este plano, RETOMAR AQUI | UPDATE | docs do fim do marco |

## Tasks

Cinco PRs, TDD (commit RED `test: … (RED)` e GREEN `feat: …`), push + PR, aprovação visual do dono (375 e 1440) antes de mergear tela.

### PR 5a — Serviços por categoria
#### Task 5a.1: contas puras
- **Action**: `agruparPorCategoria(servicos)` → grupos na ordem em que a categoria aparece pela primeira vez na lista da API (ativos antes, nome asc), **"Sem categoria" sempre por último**; `faixaDePreco(servicos)` → "R$ 40,00" quando min = max, "R$ 40,00 a R$ 60,00" senão; `resumoDoGrupo` → "2 serviços · R$ 40,00 a R$ 60,00". Grupo só com inativos ainda aparece (atenuado pela linha).
- **Mirror**: `metricas.ts` + `formatarPreco` de `ItemDeServico`.
- **Validate**: `pnpm --filter @barchop/web test -- tests/painel/listas.test.ts`
#### Task 5a.2: tela
- **Action**:
  - Apoio do cabeçalho vira a frase de contagem: "5 serviços · 4 no agendamento" (some a `LINHAS_PARA_CONTAR`).
  - `CampoDeBusca` "Filtrar por nome" (local, sem ida à API).
  - `PilulasDeFiltro`: **Todos N** · **No agendamento N** (ativos) · **Fora do agendamento N** (inativos, tom `atencao`).
  - `Tabela` com `grupos`; colunas Nome · Duração · Preço · Onde aparece · seta. "Onde aparece": ativo = "Site e painel", inativo = "Fora do agendamento". Descrição sai da tabela (fica no cadastro) — categoria vira o título do grupo.
  - Vazios: sem serviço (o de hoje); filtro/busca sem resultado → "Nenhum serviço neste filtro." + "Ver todos".
- **Mirror**: `ListaDeServicos.tsx` atual (permissão `ehDono`, seta, chip "inativo" dentro do botão da linha).
- **Validate**: `tests/telas/painel/servicos.test.tsx` + tsc + lint.

### PR 5b — API: faixa de cliente no servidor
#### Task 5b.1
- **Action**: `GET /clientes?faixa=recentes|sumidos` (ausente = todos). Hoje = `agoraNaBarbearia().data`. **recentes** = tem agendamento com `data >= hoje − 30`; **sumidos** = não tem agendamento com `data >= hoje − 90` (inclui quem nunca veio). Mesma regra que a tela usa hoje sobre `MAX(data)` (qualquer status, inclusive futuro) — não muda o significado, só onde a conta acontece. Resposta ganha `contagens: { todos, recentes, sumidos }`, todas com a **mesma busca**; `total` continua sendo o da faixa pedida (o "X de Y" do carregar mais). Cursor e ordem iguais.
- **Mirror**: `onde` + `count` em `clientes.ts:140-173`; `some`/`none` na relação de agendamentos do Prisma.
- **Validate**: `pnpm --filter @barchop/api test -- tests/routers/clientes.test.ts` — faixa filtra; contagens batem com busca; cliente de outra barbearia nunca conta; borda exata de 30 e 90 dias; cursor dentro da faixa.
#### Task 5b.2
- **Action**: tipo `FaixaDeCliente = "todos" | "recentes" | "sumidos"` e `contagens` em `@barchop/types`; `barbeiro.clientes(busca, cursor, faixa)` no api-client e no dublê.
- **Validate**: tsc em todo o monorepo.

### PR 5c — Clientes com pílulas
- **Action**:
  - `PilulasDeFiltro` "Filtrar clientes": **Todos N** · **Vieram em 30 dias N** (tom `ok`) · **Sem registro em 90 dias N** (tom `atencao`), números das `contagens`.
  - Faixa vai pra URL (`?faixa=`, junto da `busca`) e pra requisição: trocar faixa descarta o acumulado (mesmo efeito da busca), e "Carregar mais" passa a valer dentro da faixa. Some o filtro local `faixaDe`.
  - Coluna "Situação" com `Chip` pequeno: "Veio em 30 dias" (ok) / "Sem registro em 90 dias" (atenção) / nada no meio. "Último agendamento" continua.
  - Contagem e vazios atuais mantidos (frases de busca/faixa).
- **Mirror**: `ListaDeClientes.tsx` (debounce, `replace`, dois efeitos de reset).
- **Validate**: `tests/telas/painel/clientes.test.tsx` — pílula mostra número do servidor; clicar pede `faixa` à API; carregar mais leva a faixa.

### PR 5d — Equipe com pílulas
- **Action**:
  - `situacaoDoMembro(membro)` em `listas.ts`: `inativo` > `convite` (pendente) > `ativo`.
  - `PilulasDeFiltro`: **Todos N** · **Atendem N** (ativos com `atende`) · **Convites pendentes N** (tom `atencao`) · **Inativos N**. Pílula com 0 continua (contagem diz que não há).
  - Apoio: "N pessoas · N atendem".
  - Colunas: Nome (nome + e-mail embaixo, como o concorrente) · Papel · Telefone · Atende · Situação (`Chip` pequeno: "Ativo" ok / "Convite pendente" atenção / "Inativo" neutro) · seta. Some a coluna E-mail.
- **Mirror**: `ListaDaEquipe.tsx` atual.
- **Validate**: `tests/telas/painel/equipe.test.tsx` + `listas.test.ts`.

### PR 5e — Docs
- **Action**: `docs/screens.md` (três telas), PRD marco 5 `complete` com PRs, este plano marcado, RETOMAR AQUI.

## Validation
```bash
cd barchop
pnpm --filter @barchop/web test -- tests/painel/listas.test.ts tests/telas/painel/servicos.test.tsx tests/telas/painel/clientes.test.tsx tests/telas/painel/equipe.test.tsx
pnpm --filter @barchop/api test -- tests/routers/clientes.test.ts
pnpm -r type-check
pnpm lint
```
Visual: Chrome DevTools do ECC, conta `teste1`, 375px e 1440px, tema escuro (e claro numa passada), antes de cada merge de tela.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Contagem por faixa pesada em carteira grande (3 `count` com `some`/`none`) | L | índice `[clienteId]` já existe; piloto tem centenas de clientes |
| "Hoje" diferente entre API e tela perto da meia-noite | L | API decide com `agoraNaBarbearia` (fuso da casa); tela só mostra o que veio |
| Filtro local de Serviços/Equipe divergir da contagem | L | contagens e filtro saem da mesma função pura |
| Todos os serviços sem categoria (GR Barber) = um grupo só "Sem categoria" | M | com um grupo só, decidir no visual se o título aparece — perguntar ao dono |
| Clientes em produção mudar sem deploy da API junto | M | 5b entra antes; deploy da API e do web no mesmo ciclo do 5c |

## Acceptance
- [x] PRs 5a–5e mergeados (#79 serviços, #80 API das faixas, #81 clientes, #82 equipe, `docs-marco-5-listas`)
- [x] Testes tocados passando; tsc e lint limpos (`packages/formato` já falhava no `tests/regras.test.ts` antes do marco — não mexido)
- [x] Pílulas de Clientes com número de verdade nas três faixas
- [x] Aprovação visual do dono nas três telas (375 e 1440)
- [x] Patterns mirrored, not reinvented

## Diferenças do previsto
- Clientes: a coluna "Situação" não entrou — "Último agendamento" já diz "Sem registro nos últimos 90 dias", e o chip repetiria.
- Serviços: com todos sem categoria, o grupo único "Sem categoria" continua com título (o dono não pediu pra esconder).
- A faixa de Clientes vive em estado local semeado pela URL (como a busca): o dublê de navegação não devolve a query nova.
