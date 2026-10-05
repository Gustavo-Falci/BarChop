# Plan: Site de marketing mínimo (home do SaaS)

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 1s — Site de marketing (mínimo, em paralelo à Onda 1)
**Complexity**: Medium

## Summary
A raiz `/` hoje dá 404: não existe página no host do site. Este marco cria o
route group `(marketing)` do `apps/web` (ADR-0006) com a home do SaaS, termos
e privacidade, todos estáticos, e liga o cadastro aos termos. O visitante
entende a promessa e cria a barbearia em `/painel/cadastro` sem falar com
ninguém.

## Decisões do dono (2026-10-05)
- **Preços**: sem tabela. A home diz "grátis durante o lançamento". `/precos`
  e os planos em `packages/config` (ADR-0007) ficam pra Onda 2, junto com a
  cobrança. Assim o site não promete limite que a API não aplica.
- **Promessa**: rascunho do Claude a partir da hipótese do PRD, que o dono
  ajusta na revisão do PR. Proposta:
  - Título: **"Sua barbearia agenda sozinha."**
  - Linha de apoio: "O cliente marca pelo link da sua barbearia, escolhe o
    profissional e recebe lembrete. Você para de responder 'tem horário?' no
    WhatsApp e perde menos horário pra falta."
- **Legal**: rascunho base de termos e privacidade (LGPD), marcado para
  revisão jurídica. Razão social, CNPJ e e-mail do encarregado ficam num
  lugar só, como dado a preencher.

### Limites do texto (o site só promete o que existe)
- Lembrete **por e-mail**. O WhatsApp oficial está em standby (Meta, ADR-0009), então a home não promete lembrete por WhatsApp.
- Sem números de prova social: o piloto ainda não mediu nada. Sem seção "prova" até existir dado real.
- Nada de caixa, comissão, relatório ou pagamento online (Ondas 2 e 3).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Rotas | `apps/web/app/(publico)/layout.tsx` | Route group com layout próprio; página em `app/`, tela em `src/` |
| Telas | `apps/web/src/telas/PerfilDaBarbearia.tsx` + `.module.css` | Componente em PT, CSS Module ao lado, tokens via `var(--…)` |
| Fontes/tema | `apps/web/app/layout.tsx`, `src/painel/tema.ts:43` | `var(--fonte-display)`/`var(--fonte-corpo)`; fora de `/painel` o script já força tema claro, então nada a fazer |
| Metadata | `app/(publico)/[slug]/lembrete/[token]/page.tsx:9` | `export const metadata: Metadata` em página server |
| Roteamento | `src/tenant/rota.ts`, `tests/tenant/rota.test.ts:107` | Raiz e reservados ficam pro site; `/painel/…` no www vira 308 pro `painel.` (links relativos funcionam) |
| Slugs | `packages/formato/src/slug.ts:11` | `termos`, `privacidade`, `gratis`, `precos` já reservados |
| Testes | `apps/web/tests/telas/perfil.test.tsx` | Vitest + Testing Library, `getByRole` com nome, descrições em PT |
| Erros/log | — | Páginas estáticas, sem chamada à API: não há erro nem log a tratar |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/web/app/(marketing)/layout.tsx` | CREATE | Cabeçalho (marca, Entrar, Criar barbearia) e rodapé (termos, privacidade) |
| `apps/web/app/(marketing)/page.tsx` | CREATE | Home em `/` com metadata própria |
| `apps/web/app/(marketing)/termos/page.tsx` | CREATE | Termos de uso |
| `apps/web/app/(marketing)/privacidade/page.tsx` | CREATE | Política de privacidade |
| `apps/web/src/site/CabecalhoDoSite.tsx` + css | CREATE | Navegação do site |
| `apps/web/src/site/RodapeDoSite.tsx` + css | CREATE | Links legais e ano |
| `apps/web/src/site/Home.tsx` + css | CREATE | Seções da home |
| `apps/web/src/site/DocumentoLegal.tsx` + css | CREATE | Moldura de texto longo, com aviso de rascunho e data de vigência |
| `apps/web/src/site/controlador.ts` | CREATE | Razão social, CNPJ, e-mail do encarregado num lugar só |
| `apps/web/src/site/LinkDeAcao.tsx` + css | CREATE | CTA como `<Link>` com o visual do `Botao` (o `Botao` é `<button>` e client) |
| `apps/web/src/telas/painel/CadastroDoDono.tsx` | UPDATE | "Ao criar, você concorda com os Termos e a Política de Privacidade" |
| `apps/web/app/robots.ts`, `app/sitemap.ts` | CREATE | Indexa só o site (`/`, `/termos`, `/privacidade`); bloqueia `/painel`. Lê `NEXT_PUBLIC_URL_DO_SITE` |
| `apps/web/app/layout.tsx` | UPDATE | `description` padrão vira a do SaaS |
| `apps/web/tests/site/*.test.tsx` | CREATE | Testes das telas novas |
| `apps/web/tests/telas/painel/cadastro*.test.tsx` | UPDATE | Links legais no cadastro |
| `barchop/docs/screens.md`, `docs/roadmap.md`, PRD | UPDATE | Estado do 1s |

## Tasks

### Task 1 — Home na raiz (PR `onda-1s-a`, conserta o 404)
- **Action**: TDD. Testes primeiro em `tests/site/home.test.tsx`: h1 com a promessa; CTA principal leva a `/painel/cadastro`; "Entrar" leva a `/painel/entrar`; seção de preço diz "grátis" e **não** mostra valor em R$; FAQ abre e fecha (`<details>`); nenhuma menção a lembrete por WhatsApp. Depois o layout `(marketing)`, cabeçalho, rodapé, `LinkDeAcao` e `Home`.
- **Seções**: (1) hero com a promessa e CTA; (2) a dor: WhatsApp, bloco de notas, horário duplicado, falta; (3) como funciona em 3 passos (cadastra e configura → compartilha o link → cliente agenda e recebe lembrete); (4) o que tem: agenda por profissional, página própria `<nome>.barchop.com.br`, lembrete com confirmar/cancelar, equipe com papéis, painel do dia; (5) preço "grátis durante o lançamento"; (6) FAQ curto (preciso instalar algo? o cliente precisa de app? quanto custa depois? meus dados?); (7) CTA final.
- **Mirror**: telas em `src/` + CSS Module; página em `app/` só monta. Server component: nada de `"use client"` no site.
- **Validate**: `pnpm --filter ./apps/web test`; `tsc --noEmit` no web; `next build` mostra `/` como estática (○); Chrome em `localhost:3000/` desktop e celular, e `teste1.localhost:3000/` continua abrindo a barbearia.

### Task 2 — Termos e privacidade + aceite no cadastro (PR `onda-1s-b`)
- **Action**: TDD. `DocumentoLegal` com aviso "texto em revisão" e data de vigência; `controlador.ts` com os dados a preencher; termos (serviço, conta do dono, responsabilidade pelos dados dos clientes da barbearia, disponibilidade, encerramento) e privacidade (LGPD: BarChop é **operador** dos dados dos clientes finais e **controlador** dos dados do dono; dados coletados, finalidade, Resend como suboperador de e-mail, OCI como hospedagem, retenção, direitos do titular, contato do encarregado). Cadastro ganha a linha de aceite com os dois links, abrindo em nova aba pra não perder o formulário.
- **Mirror**: `tests/telas/painel/` pro cadastro; `DocumentoLegal` com h1/h2 navegáveis.
- **Validate**: suíte web; Chrome nas duas páginas e no cadastro.

### Task 3 — robots, sitemap, metadata e docs (PR `onda-1s-c`)
- **Action**: `robots.ts` e `sitemap.ts` com a base de `NEXT_PUBLIC_URL_DO_SITE` (sem ela, sitemap vazio e robots sem `Sitemap:`); `description` do layout raiz; Open Graph básico na home. Docs: `screens.md` (Landing, Termos e privacidade ✅; Preços e Plano grátis movidos pra Onda 2), roadmap e PRD.
- **Mirror**: `siteDoAmbiente()` de `proxy.ts` pra ler a variável.
- **Validate**: `curl localhost:3000/robots.txt` e `/sitemap.xml`; testes unitários das duas funções.

## Validation
```bash
cd barchop
pnpm --filter ./apps/web test
pnpm --filter ./apps/web exec tsc --noEmit   # o type-check do turbo cai no prisma generate com a API rodando
pnpm --filter ./apps/web build               # / , /termos, /privacidade como ○ (estáticas)
pnpm lint
```
Depois, rodar de verdade no Chrome: `/`, `/termos`, `/privacidade`, CTA até o cadastro, `teste1.localhost:3000/` intacto, celular emulado.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Termos publicados com razão social e CNPJ em branco | Medium | Dados em `controlador.ts`; preencher entra como item no checklist do bloco G (produção), e o aviso "em revisão" fica até o jurídico |
| A home prometer o que não existe (WhatsApp, preço) | Medium | Teste que barra "WhatsApp" em lembrete e "R$" na seção de preço |
| O site puxar código do painel pro bundle (ADR-0006) | Low | Site importa só de `src/site` e tokens; conferir no output do build |
| A promessa não diferenciar do Barbeiro.app (open question) | Medium | Texto num componente só, fácil de trocar; dono revisa no PR |
| Página estática virar dinâmica por ler `headers()` | Low | Nada do site lê headers; o build confirma ○ |

## Acceptance
- [ ] `localhost:3000/` (e `barchop.com.br/` em produção) abre a home, não 404
- [ ] Visitante vai da home ao cadastro e cria a barbearia sem ajuda
- [ ] Termos e privacidade publicados e linkados no cadastro e no rodapé
- [ ] Nenhum preço em R$, nenhum lembrete por WhatsApp prometido
- [ ] Páginas estáticas; suítes, tsc, lint e build passam
- [ ] Rodado de verdade no Chrome, desktop e celular
