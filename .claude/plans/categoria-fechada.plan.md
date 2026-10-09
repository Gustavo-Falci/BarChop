# Plan: Categoria do serviço em lista fechada

**Source**: pedido do dono em 2026-10-09 ("transformar a categoria em opções selecionáveis e não deixar mais o campo livre")
**Complexity**: Medium (migração com conversão de dados + 2 PRs)

## Summary
A categoria do serviço deixa de ser texto livre (`VARCHAR(60)`, origem do "CEBELO" na página pública) e vira uma lista fechada no padrão da ADR-0007: valores em `@barchop/formato`, CHECK no banco, rótulos nas telas. A migração converte o texto que já existe por palavra-chave; o que não casar fica sem categoria. O painel troca o campo de texto por pílulas, e a página pública e a lista do painel agrupam na ordem da lista, com ícone por valor.

## Decisões (dono, 2026-10-09)
- Lista, nesta ordem (é a ordem das seções na página): `cabelo` Cabelo · `barba` Barba · `combo` Combo · `sobrancelha` Sobrancelha · `quimica` Química e tratamentos · `infantil` Infantil.
- Continua opcional: sem categoria = `null`, vai pro fim ("Outros serviços" na página, "Sem categoria" no painel).
- Dados atuais: converter por palavra-chave; não casou = `NULL` (o "CEBELO" cai aqui e o dono escolhe no painel).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Lista fechada | `packages/formato/src/pagina.ts:7` (`COMODIDADES`), `:35` (`FORMATOS_DA_LOGO`) | `as const` + tipo derivado, comentário dizendo onde mora o CHECK |
| CHECK na migration | `packages/database/prisma/migrations/20261010120000_logo_da_barbearia/migration.sql` | SQL escrito à mão (o `migrate dev` quer derrubar `agendamento.periodo`), bloco "Desfazer", `migrate deploy` |
| Teste lista = CHECK | `apps/api/tests/routers/pagina-da-barbearia.test.ts:70` | grava todos os valores da lista, valor de fora rejeita |
| Validação na API | `apps/api/src/routers/barbearias.ts:53` | `enum: [...LISTA]` no schema do Fastify |
| Tipo espelhado | `packages/types/src/index.ts:94` (`FormatoDaLogo`) | união escrita à mão com comentário apontando a lista |
| Rótulos | `apps/web/src/formato/pagina.ts:6` | `Record<Valor, string>` + `rotuloDa…(valor)` com `?? valor` |
| Seleção | `apps/web/src/componentes/SeletorEmPilulas.tsx` | rádios em pílula, `flex-wrap` (cabe no 375) |
| Testes | `apps/api/tests/routers/servicos*.test.ts`, `apps/web/tests/painel/listas.test.ts`, `apps/web/tests/telas/painel/servicos.test.tsx`, `apps/web/tests/telas/pagina-rica.test.tsx` | vitest, commit RED depois GREEN |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/formato/src/pagina.ts` | UPDATE | `CATEGORIAS_DE_SERVICO` + `CategoriaDeServico` |
| `packages/database/prisma/migrations/2026101012…_categoria_fechada/migration.sql` | CREATE | converte o texto e põe o CHECK |
| `packages/types/src/index.ts` | UPDATE | `categoria: CategoriaDeServico \| null` |
| `apps/api/src/routers/servicos.ts` | UPDATE | `enum` no POST/PATCH; sai o `limparTextoOpcional` da categoria |
| `apps/api/tests/routers/servicos*.test.ts` | UPDATE | valor da lista grava, texto livre → 400, CHECK = lista |
| `apps/api/tests/lib/serializar.test.ts`, `routers/pagina-da-barbearia.test.ts` | UPDATE | fixtures com valor da lista |
| `packages/api-client/src/barbeiro.ts`, `falso.ts` (+ `tests/pagina.test.ts`) | UPDATE | tipo e dublê validando contra a lista |
| `apps/web/src/formato/pagina.ts` | UPDATE | `ROTULO_DA_CATEGORIA` + `rotuloDaCategoria` |
| `apps/web/src/telas/painel/CadastroDeServico.tsx` | UPDATE | `Campo` vira `SeletorEmPilulas` ("Sem categoria" + 6), linha própria |
| `apps/web/src/fluxo/categorias.ts` | UPDATE | agrupa na ordem da lista, título = rótulo; sai a normalização de texto |
| `apps/web/src/fluxo/iconeDaCategoria.tsx` | UPDATE | `Record<CategoriaDeServico, Icone>` no lugar das regex |
| `apps/web/src/painel/listas.ts` | UPDATE | mesma ordem da lista, título = rótulo |
| testes web citados acima + `escolha-de-servicos.test.tsx`, `servicos-descricao-foto.test.tsx` | UPDATE | fixtures e comportamento novos |
| `barchop/docs/screens.md` | UPDATE | campo de categoria descrito como seleção |

## Tasks

### PR 1 — API e banco (com MIGRAÇÃO)
**Task 1: lista no formato.** `CATEGORIAS_DE_SERVICO = ["cabelo","barba","combo","sobrancelha","quimica","infantil"] as const`.

**Task 2: migration (escrita à mão).** Numa transação:
1. `UPDATE servico SET categoria = CASE … END WHERE categoria IS NOT NULL`, comparando o texto sem acento e em minúsculas (`lower(translate(...))`); a primeira regra que casa ganha:
   - `combo|pacote|\+| e barba|barba e ` → `combo`
   - `infantil|kids|crianca` → `infantil`
   - `sobrancelha` → `sobrancelha`
   - `tratamento|hidrata|pigment|platinad|luzes|quimica|relaxa|progressiva|selagem|estetica|pele` → `quimica`
   - `barba|bigode|navalha` → `barba`
   - `corte|cabelo|degrade|tesoura|maquina` → `cabelo`
   - senão `NULL`
2. `ADD CONSTRAINT servico_categoria_check CHECK (categoria IN (…))`.
Bloco "Desfazer": `DROP CONSTRAINT` (a conversão não volta, o texto original some — registrar no comentário).
- **Validate**: no banco local, antes de aplicar, gravar categorias de amostra ("Cortes", "Cabelo e barba", "CEBELO", "Sobrancelha", "Hidratação", "Infantil", "Barba") e conferir o resultado depois do `migrate deploy`.

**Task 3 (RED→GREEN): API.** `categoria` com `enum: [...CATEGORIAS_DE_SERVICO, null]` no POST e no PATCH; "cabelo" grava, "Cabelo"/"CEBELO" → 400, `null` tira. Teste CHECK = lista no estilo de `pagina-da-barbearia.test.ts:70`.

**Task 4: tipos e dublê.** `CategoriaDeServico` em `@barchop/types`, `barbeiro.ts`, `falso.ts` recusando valor de fora como a API.

### PR 2 — Telas
**Task 5 (RED→GREEN): agrupamentos.** `fluxo/categorias.ts` e `painel/listas.ts` agrupam na ordem de `CATEGORIAS_DE_SERVICO`, título pelo rótulo; sem categoria no fim. Testes de ordem ("barba" cadastrada antes de "cabelo" aparece depois).

**Task 6: ícone por valor.** cabelo/infantil → tesoura, barba → navalha, sobrancelha/quimica → gota, combo → coroa.

**Task 7 (RED→GREEN): cadastro.** Pílulas "Sem categoria · Cabelo · Barba · Combo · Sobrancelha · Química e tratamentos · Infantil", em linha própria abaixo de nome/duração/preço; edição semeia o valor; envia `null` em "Sem categoria".
- **Validate**: ver no navegador em 375 e 1440 (aprovação visual do dono antes do merge).

## Validation
```bash
pnpm --filter @barchop/database migrate:deploy
pnpm --filter @barchop/api test -- servicos serializar pagina-da-barbearia
pnpm --filter @barchop/api-client test
pnpm --filter @barchop/web test -- listas servicos pagina-rica escolha-de-servicos
pnpm -r --no-bail type-check && pnpm -r lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Deploy do PR 1 sem o PR 2: o campo livre do painel manda texto e a API devolve 400 | Alta se deployar no meio | Mergear os dois e só então deployar (o dono avisado) |
| `migrar` velho no deploy (lição do #97) | Média | Tem migration: rebuildar o `migrar` |
| Conversão errada de algum texto real | Baixa | O pior caso é ficar `NULL` e o dono escolher no painel |
| O texto original some (não dá pra desfazer a conversão) | Certa | Aceito: o texto livre é justamente o que sai; registrado no "Desfazer" |
| 7 pílulas no celular | Baixa | `flex-wrap` já existe; conferir no 375 |

## Acceptance
- [ ] Página pública sem "CEBELO"; seções na ordem da lista com ícone certo
- [ ] Painel: categoria escolhida por pílula, sem campo de texto
- [ ] API recusa valor de fora; CHECK no banco igual à lista (teste)
- [ ] Testes afetados + type-check + lint limpos
