# Plan: Expo 57 → 58 (substitui o #412 do Dependabot)

**Origem**: PR #412 do Dependabot (sobe só `expo` 57.0.18 → 58.0.26). O CI fica verde, mas não prova nada: o CI não monta o bundle do app, e o React e o React Native ficam nas versões do SDK 57.
**Complexidade**: Pequena/Média (um PR; o mobile ainda é a tela provisória, mas o React sobe junto no web)

## Summary
O Expo 58 pede versões exatas em `node_modules/expo/bundledNativeModules.json`: `react` 19.3.0, `react-dom` 19.3.0, `react-native` 0.88.1, `expo-status-bar` ~58.0.5. Com `node-linker=hoisted` (`barchop/.npmrc`) há um React só na raiz, então o web (Next 16.4.6, `motion` 14.14.0) passa a rodar no React 19.3.0. Next (`^19.0.0`) e motion (`^19.0.0`) aceitam. O risco real está no web, não no mobile.

Medido em 25/11: Expo 58 aceita Node `^26.0.0` (produção e CI usam Node 26). `@types/react` latest = 19.3.3, `@types/react-dom` latest = 19.3.0. O npm `latest` do `react` já é 19.3.1: o Expo quer **19.3.0 exato**, igual ao 19.2.3 de hoje.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Versões exatas | `barchop/apps/mobile/package.json`, `apps/web/package.json:26-27` | `react`/`react-dom`/`react-native` sem `^`/`~`; `expo*` com `~`; mobile e web na mesma versão do React |
| Dependabot | `.github/dependabot.yml:28-45` | comentário explica a amarração Expo ↔ React; `ignore` de react/react-dom/react-native e minor/major dos tipos |
| Substituir PR do Dependabot | #429 substituiu #411 | branch próprio `--no-track`, fechar o do Dependabot com comentário apontando o novo |
| Testes | `apps/web` vitest + Testing Library | rodar os do web (o React mudou por baixo de todos) |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/apps/mobile/package.json` | UPDATE | `expo ~58.0.26`, `expo-status-bar ~58.0.5`, `react 19.3.0`, `react-native 0.88.1`, `@types/react ~19.3.x` (o que o `expo install --fix` escolher) |
| `barchop/apps/web/package.json` | UPDATE | `react`/`react-dom` 19.3.0, `@types/react`/`@types/react-dom` ~19.3 |
| `barchop/pnpm-lock.yaml` | UPDATE | — |
| `.github/dependabot.yml` | UPDATE | comentário: Expo 58 quer react 19.3.0 e react-native 0.88.1 |
| `barchop/apps/mobile/*` (app.json, tsconfig, metro) | UPDATE só se o `expo install --check`/doctor pedir | — |

## Tasks
### Task 1: Branch e dependências do mobile
- `git switch -c expo-58 --no-track origin/main`.
- No `apps/mobile`: subir `expo` para ~58.0.26, `pnpm install`, depois `npx expo install --fix` (alinha react, react-native, expo-status-bar, tipos).
- **Validate**: `npx expo install --check` sem pendência; um React só em `node_modules` (`pnpm why react` / nenhum `react` aninhado).

### Task 2: Web acompanha
- `apps/web/package.json`: `react`/`react-dom` 19.3.0, tipos ~19.3. `pnpm install`.
- **Validate**: `pnpm --filter web type-check`, lint, testes do web (vitest), `next build`.

### Task 3: Mobile monta de verdade
- **Validate**: `pnpm --filter @barchop/mobile type-check` e `npx expo export --platform android` (e `ios`) no `apps/mobile`: prova que o Metro resolve os `@barchop/*` e que o renderer do RN 0.88.1 bate com o React 19.3.0. Abrir no Expo Go/emulador é bônus, não exigido.

### Task 4: Conferência visual do web
- Subir o web local e olhar home (cadeira 3D, névoa do topo) e painel Hoje (números com `popLayout`) no Chrome. Console sem erro novo de hidratação.

### Task 5: Docs e PR
- Comentário do `dependabot.yml`. PR `chore(deps): Expo 58 with React 19.3 and RN 0.88`. Fechar #412 com comentário apontando o PR novo.
- Depois do merge: RETOMAR AQUI no plano da onda 1 (web pede deploy; API não muda).

## Validation
```bash
cd barchop/apps/mobile && npx expo install --check && npx expo export --platform android
cd barchop && pnpm --filter @barchop/mobile type-check
cd barchop && pnpm --filter web type-check && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| React 19.3 muda algo no web (hidratação, Suspense, actions) | Média | testes do web + `next build` + conferência visual; Next e motion aceitam `^19` |
| `@types/react` 19.3 acusa tipo novo no web | Média | corrigir no PR; são tipos, não comportamento |
| Dois Reacts no `node_modules` (algum pacote puxa outra versão) | Baixa | `pnpm why react`; o hoisted resolve um só |
| Metro do Expo 58 muda resolução de monorepo | Baixa | `expo export` prova; ajustar `metro.config.js` se precisar |
| Expo 58 sai dos Node aceitos | Nenhuma | engines inclui `^26.0.0` |
| Web vai pra produção no React novo | Média | deploy do web é do dono, depois do merge; conferir no celular |

## Acceptance
- [ ] `expo install --check` limpo e `expo export` monta
- [ ] web: type-check, lint, testes e build verdes; conferência visual sem regressão
- [ ] `dependabot.yml` atualizado; #412 fechado com comentário
- [ ] CI verde no PR
