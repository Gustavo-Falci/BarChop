# @barchop/mobile

App do barbeiro — React Native + Expo.

## Setup

O scaffold do Expo já está aqui (`App.tsx`, `app.json`, `assets/`,
`tsconfig.json`), ao lado do `package.json` e do `metro.config.js`
ajustados pro monorepo. Na raiz:

```bash
pnpm install
pnpm --filter @barchop/mobile dev
```

## Consumindo os pacotes internos

```ts
import { calcularHorariosDisponiveis } from "@barchop/scheduling";
import { colors } from "@barchop/design-tokens";
import type { Agendamento } from "@barchop/types";
```
