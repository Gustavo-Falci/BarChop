# Plan: Logo da barbearia com moldura no formato dela

**Source**: pedido do dono (2026-10-08), opção C da análise
**Complexity**: Medium — 2 PRs (API + migração; telas)

## Summary

O dono envia a logo na aba **Marca** das Configurações. No envio, o navegador
detecta o formato (redonda / quadrada / sem moldura), pré-seleciona e mostra a
prévia; o dono confirma ou troca. O formato fica gravado no banco, e a logo
aparece com a moldura certa em três lugares: página pública (sobre a capa, ao
lado do nome), topo do fluxo de agendar e marca do painel. Sem logo, tudo
continua como hoje (monograma, nome, inicial).

## Estado atual (achados)

- `barbearias.logo_url` existe (texto, só `http(s)`, via `PATCH /barbearias/me`),
  é serializado como `logoUrl`, mas **nenhuma tela usa nem escreve**.
- A aba Marca (`DadosDoNegocio.tsx:402`) só tem a capa.
- `redimensionarImagem` (`src/painel/redimensionar.ts`) regrava **tudo em
  JPEG** → apaga a transparência. Logo redonda precisa de alfa.
- A API já aceita png/jpeg/webp pelos bytes (`tipoPelosBytes`).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Rota de imagem | `apps/api/src/routers/imagens.ts:72-100` | `POST/DELETE /barbearias/me/capa`: `exigirPapel("dono")`, `lerImagem` com teto, chave sorteada `barbearias/<id>/capa/<uuid>.<ext>`, apaga a antiga sem falhar, `marcarAreas(["dados_do_negocio"])` |
| Chave → URL | `apps/api/src/lib/serializar.ts:67` | `capaUrl: capaChave ? urlDaImagem(capaChave) : null` |
| Regex de chave servida | `apps/api/src/routers/imagens.ts:182` | lista das pastas aceitas (`capa`, `equipe`, `servicos`) |
| Cliente da API | `packages/api-client/src/barbeiro.ts:465-480` | `enviarCapa(Blob)` com FormData campo `arquivo`; `removerCapa()` |
| Dublê | `packages/api-client/src/falso.ts:1232-1241` | `urlFalsa("capa")`, grava no `estado.perfil` |
| Campo de imagem | `apps/web/src/componentes/CampoDeImagem.tsx` | prévia, troca salva na hora, avisos por `codigo` do erro |
| Seletor | `apps/web/src/componentes/SeletorEmPilulas.tsx` | pílulas pra escolha única |
| Testes API | `apps/api/tests/routers/imagens.test.ts:41-135` | `describe("capa da barbearia")`, helper `multipart`/`enviar`, 401/403/413/422, troca apaga a antiga |
| Testes web | `apps/web/tests/telas/perfil-fachada.test.tsx` | `criarApiClientFalso`, `findByRole("img", { name })`, `within(banner)` |
| Migração | `packages/database/prisma/migrations/20261009120000_regras_de_agendamento` | pasta `AAAAMMDDhhmmss_nome/migration.sql`, SQL à mão |

## Decisões

- **Formato** = `"redonda" | "quadrada" | "livre"` (livre = sem moldura, a
  imagem inteira com `object-fit: contain`). Tipo `FormatoDaLogo` em
  `@barchop/types`.
- **Banco**: `logo_chave varchar(200)` + `logo_formato` (text com CHECK nos 3
  valores), ambos anuláveis; **remove `logo_url`** (nunca escrito por tela).
  `logoUrl` continua no JSON, agora montado da chave — nome estável pras telas.
- **Envio**: `POST /barbearias/me/logo` (multipart: `arquivo` + campo
  `formato`), teto 2 MB, pasta `logo/`. `DELETE /barbearias/me/logo`. Trocar só
  o formato: `PATCH /barbearias/me { logoFormato }` (sem reenviar arquivo).
  `logoUrl` sai do schema do PATCH.
- **Redimensionar a logo**: lado máximo 512, **WebP com alfa** (o navegador que
  não codifica WebP devolve PNG, que a API também aceita). Opção nova em
  `redimensionarImagem` (`tipo`), sem mudar o comportamento da capa/fotos.
- **Detecção** (`src/painel/formatoDaLogo.ts`, função pura sobre
  `{ width, height, data }`): proporção longe de 1:1 → `livre`; cantos
  transparentes e borda do círculo inscrito opaca → `redonda`; cantos opacos →
  `quadrada`; resto → `livre`. Roda no `ImageData` do canvas do próprio
  arquivo local (sem CORS).

## Files to Change

### PR 1 — API, tipos, cliente (migração)

| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` | UPDATE | `logoChave`, `logoFormato`; tira `logoUrl` |
| `packages/database/prisma/migrations/20261010120000_logo_da_barbearia/migration.sql` | CREATE | add colunas + CHECK; drop `logo_url` |
| `packages/database/schema.sql` | UPDATE | espelho do schema, se o repo o mantém atualizado |
| `packages/types/src/index.ts` | UPDATE | `FormatoDaLogo`; `logoFormato` em `BarbeariaSerializada` |
| `apps/api/src/lib/serializar.ts` | UPDATE | `logoUrl` da chave; `logoFormato` |
| `apps/api/src/routers/imagens.ts` | UPDATE | `POST/DELETE /barbearias/me/logo`; regex da chave com `logo` |
| `apps/api/src/routers/barbearias.ts` | UPDATE | PATCH: tira `logoUrl`, aceita `logoFormato` (enum) |
| `packages/api-client/src/barbeiro.ts` | UPDATE | `enviarLogo(Blob, formato)`, `removerLogo()`; `logoFormato` no PATCH |
| `packages/api-client/src/falso.ts` | UPDATE | dublês |
| `apps/api/tests/routers/imagens.test.ts` | UPDATE | `describe("logo da barbearia")` |
| `apps/api/tests/routers/barbearias-patch.test.ts` | UPDATE | troca casos de `logoUrl` por `logoFormato` |
| `apps/api/tests/lib/serializar.test.ts`, `barbearias-me.test.ts` | UPDATE | campos novos |

### PR 2 — Telas

| File | Action | Why |
|---|---|---|
| `apps/web/src/painel/redimensionar.ts` | UPDATE | opção `tipo` (jpeg padrão; webp pra logo) |
| `apps/web/src/painel/formatoDaLogo.ts` | CREATE | detecção pura |
| `apps/web/src/componentes/LogoDaBarbearia.tsx` + `.module.css` | CREATE | a logo na moldura do formato, em tamanhos `p/m/g`; usada nos 3 lugares e na prévia |
| `apps/web/src/telas/painel/configuracoes/CampoDaLogo.tsx` + css | CREATE | escolher arquivo → detectar → prévia com pílulas Redonda/Quadrada/Sem moldura → enviar; trocar formato depois; remover |
| `apps/web/src/telas/painel/configuracoes/DadosDoNegocio.tsx` | UPDATE | aba Marca: Logo antes da Capa |
| `apps/web/src/telas/PerfilDaBarbearia.tsx` + css | UPDATE | logo sobre a borda de baixo da capa, ao lado do nome |
| `apps/web/src/fluxo/BarraDaBarbearia.tsx` + css | UPDATE | logo pequena antes do nome |
| `apps/web/src/painel/SessaoDoPainel.tsx` | UPDATE | guarda `logoUrl/logoFormato` da `minhaBarbearia()` no contexto + `atualizarMarca` |
| `apps/web/src/painel/NavegacaoDoPainel.tsx` + css | UPDATE | logo no lugar do quadrado com a inicial (expandida e recolhida) |
| testes: `formato-da-logo.test.ts`, `campo-da-logo.test.tsx`, `perfil-fachada`, `barra-da-barbearia`, `navegacao-do-painel` | CREATE/UPDATE | |

## Tasks

1. **Migração + schema + tipos** — Validate: `prisma validate`, tsc dos pacotes.
2. **API**: serializar, rotas logo, PATCH `logoFormato` (TDD a partir de `imagens.test.ts`). Validate: testes de `imagens`, `barbearias-patch`, `serializar`, `barbearias-me`.
3. **api-client + dublê**. Validate: tsc + testes do api-client.
4. **Detecção** (TDD com `ImageData` sintético: círculo, quadrado, faixa larga, fundo branco).
5. **`LogoDaBarbearia`** + **`CampoDaLogo`** na aba Marca. Validate: teste do campo (detecta → pré-seleciona → envia com o formato; troca formato chama PATCH; remover).
6. **Três lugares**: perfil, barra do fluxo, painel. Validate: testes de cada um + navegador (claro/escuro, desktop/celular, logo redonda PNG transparente, quadrada, larga).

## Validation

```bash
# só os afetados (memória: testes-so-os-afetados)
pnpm --filter @barchop/api exec vitest run tests/routers/imagens.test.ts tests/routers/barbearias-patch.test.ts tests/lib/serializar.test.ts tests/routers/barbearias-me.test.ts
pnpm --filter @barchop/web exec vitest run <testes tocados>
pnpm -r exec tsc --noEmit
pnpm lint
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `logo_url` com dado em produção (escrito via API à mão) | Baixa | Nenhuma tela escrevia; a migração descarta. Se quiser zero risco, manter a coluna e só parar de usar — decidir antes do PR 1 |
| Deploy com migração | Certa | Aviso no PR e na mensagem: build da `api` + `migrar` antes do `web` |
| Detecção errar (logo redonda com fundo branco opaco) | Média | É só sugestão: o dono vê a prévia e troca nas pílulas |
| Safari não codifica WebP no canvas | Média | `toBlob` cai pra PNG sozinho; API aceita PNG |
| Logo grande demais no topo do painel recolhido (72px) | Baixa | `LogoDaBarbearia` com tamanho fixo e `object-fit: contain` |

## Acceptance

- [ ] Dono envia logo PNG redonda transparente → sugere "Redonda", prévia em círculo; pode trocar
- [ ] Página pública, topo do fluxo e painel mostram a logo na moldura escolhida, nos dois temas
- [ ] Sem logo, as três telas ficam iguais a hoje
- [ ] Capa e fotos continuam em JPEG (sem regressão)
- [ ] Testes afetados + tsc + lint verdes
