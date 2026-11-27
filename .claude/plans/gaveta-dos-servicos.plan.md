# Plan: Gaveta nos serviços da página pública

**Source**: pedido do dono (conversa de 27/11), sem PRD
**Complexity**: Small (1 PR, só web)

## Summary
Na página pública da barbearia (`PerfilDaBarbearia`), uma categoria com 6 ou mais serviços mostra os 4 primeiros e guarda o resto atrás de "Ver mais N serviços"; aberto, o botão vira "Ver menos". Vale nas seções empilhadas, nas abas e na lista sem categoria. Limite fixo, sem configuração na Aparência.

## Regras decididas
- `LIMITE_VISIVEL = 4`; só guarda se sobrarem **2 ou mais** (5 serviços = mostra os 5).
- Ordem = a do dono (a que `agruparPorCategoria` já devolve); os 4 primeiros ficam.
- Cada categoria abre e fecha sozinha (`Set` de chaves abertas; chave = `grupo.titulo ?? ""`). Nas abas, o aberto persiste ao trocar e voltar.
- Escondidos não são renderizados; ao abrir entram na mesma `<ul>`, com fade + leve descida (`@keyframes`), desligado em `prefers-reduced-motion`.
- Botão abaixo do cartão: `type="button"`, `aria-expanded`, `aria-controls` (id da `<ul>`). Texto "Ver mais N serviços" ↔ "Ver menos".
- Abrir: foco vai pro link do primeiro serviço revelado. Fechar: foco no botão + `scrollIntoView({ block: "nearest" })`.
- A contagem ao lado do título segue o total.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Expandir | `apps/web/src/telas/painel/agenda/ListaDaAgenda.tsx:278` | `<button type="button" aria-expanded>` + render condicional |
| Ids | `apps/web/src/telas/PerfilDaBarbearia.tsx:78` | `useId()` já existente (`idDasAbas`) como prefixo |
| Movimento | `apps/web/src/telas/PerfilDaBarbearia.module.css:437` | bloco `prefers-reduced-motion: reduce` existente |
| Tests | `apps/web/tests/telas/perfil.test.tsx:57` | `criarApiClientFalso({ servicos })`, `salvarLayoutDosServicos("abas")`, `userEvent`, `within` |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/apps/web/tests/telas/perfil.test.tsx` | UPDATE | `describe("gaveta dos serviços")` (RED primeiro) |
| `barchop/apps/web/src/telas/PerfilDaBarbearia.tsx` | UPDATE | estado `abertas`, corte em `listaDe`, botão, foco |
| `barchop/apps/web/src/telas/PerfilDaBarbearia.module.css` | UPDATE | `.verMais` (botão texto, alvo ≥44px), `.revelado` (animação), reduced-motion |

## Tasks
### Task 1: Testes (RED)
- 4 serviços na categoria → sem botão "Ver mais".
- 5 serviços → os 5 visíveis, sem botão.
- 7 serviços → 4 links, botão "Ver mais 3 serviços" `aria-expanded="false"`; clica → 7 links, "Ver menos" `aria-expanded="true"`, foco no 5º; clica → 4 links, foco no botão.
- Duas categorias grandes: abrir uma não abre a outra.
- Abas: categoria com 7 tem gaveta; abre, troca de aba, volta → segue aberta.
- Lista sem categoria com 7 → mesma gaveta.
- Contagem "7 serviços" não muda ao abrir/fechar.
- **Validate**: `pnpm --filter web exec vitest run tests/telas/perfil.test.tsx` falha nos novos.

### Task 2: Implementação (GREEN)
- Constante e função pura `dividirServicos(servicos, aberta)` → `{ visiveis, guardados }` no próprio arquivo.
- `const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set())`; alternar cria `Set` novo (imutável).
- Ref do botão e do primeiro revelado; foco num `useEffect` disparado pela última ação (evita focar no primeiro render).
- **Validate**: teste verde.

### Task 3: CSS
- Botão no estilo texto/link da página (tokens de `packages/design-tokens`, conforme `docs/UI_UX_DESIGN_GUIDELINES.md`), alvo de toque ≥44px.
- `.revelado { animation: entrar 180ms ease-out }` com `opacity`/`translateY(-4px)`; `none` em reduced-motion.
- **Validate**: conferência visual no navegador (celular 390px e desktop).

## Validation
```bash
cd barchop
pnpm --filter web exec vitest run tests/telas/perfil.test.tsx
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Foco roubado no primeiro render | Baixa | efeito só reage a clique (ref da última ação) |
| Fechar com página rolada "pula" a tela | Média | `scrollIntoView({ block: "nearest" })` no botão |
| Categoria sem título colidir chave com outra | Baixa | chave `""` só existe quando não há categorias |

## Acceptance
- [ ] Testes novos verdes, antigos intactos
- [ ] tsc + lint limpos
- [ ] Conferido no navegador (celular e desktop, claro e escuro)
