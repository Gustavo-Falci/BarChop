# Design System do BarChop

Gera os arquivos do artefato **Design System** do BarChop no Claude, que alimenta o canvas do Claude Design. Os redesenhos de tela passam por esse canvas antes do código. A fonte é este repositório:

- **Tokens:** `tokens.json` sai de `packages/design-tokens`. Os nomes são as custom properties que `apps/web/app/tokens-css.ts` emite (`cor-*`, `raio-*`, `espaco-*`, `texto-*`, `sombra-*`, `borda-*`), com valor claro (`light`) e escuro (`dark`).
- **Componentes:** `components/bundle.js` e `bundle.css` são compilados com esbuild dos componentes reais de `apps/web/src/componentes`, os que estão em `caminhos.mts`.
  - O pacote é um IIFE que lê `window.React`/`window.ReactDOM` (React 18, dado pela página) e expõe `window.BarChop`.
  - `react/jsx-runtime` e `next/link` viram shims.
  - O `motion` vai junto.
  - `base.css` entra na frente: são as regras que `globals.css` e `tokens-css.ts` dão a toda página e que os tokens não declaram.
- **Prévias e READMEs** de cada componente, mais `index.d.ts`: saem de `cartoes.mts`.
- **Conteúdo escrito à mão:** o guia da marca (`README.md`) e a capa (`Cover/preview.html`), em `conteudo/`.
- **Fonte:** a Inter, de `font/Inter`, com a licença. A Clash Grotesk fica de fora: a licença da Fontshare não permite pô-la em plataforma de terceiros.

## Gerar

De `barchop/`:

```sh
pnpm design-system
```

Sai tudo em `scripts/design-system/saida/project/` (fora do git). Roda com o `tsx` da API e o esbuild que ele traz; nenhuma dependência nova.

## Publicar

A publicação é pelo Claude Code, com as ferramentas de artefato. O índice `project/design-system.json` mora no artefato: não sai daqui e é editado lá, por último.

1. **Mandar só o que mudou.** Na lista de arquivos do artefato do Design System, compare os `sha256` com os de `saida/project/`. Publique os diferentes num envio só. O `tokens.json` vai sempre inteiro.
2. **Atualizar o índice.** No `design-system.json`, troque o `lastChange` (quem, quando, de qual commit, o que mudou). Mexa em `libraries` só se o React mudar.
3. **Reinstalar no canvas.** O canvas guarda uma cópia, que não se atualiza sozinha:
   - copie para `project/ds/barchop/` os arquivos que mudaram (`tokens.json`, `README.md`, `components/bundle.js`, `bundle.css`, `index.d.ts` e, quando a página do sistema tiver gerado, `tokens.css`);
   - atualize a `version` do registro `barchop` em `designSystems` no `canvas.json`.

## Mudar

- **Componente novo no pacote:**
  1. Ponha o nome em `COMPONENTES` (`caminhos.mts`).
  2. Escreva o cartão em `cartoes.mts`: grupo, altura, a prévia com dados no formato real das props e o README tirado dos comentários do código. Sem cartão, o gerador para.
  3. Inclua os tipos no `index.d.ts`, dentro de `cartoes.mts`.
  4. Se o componente importar algo do Next além de `next/link`, `next/image` e `next/navigation`, crie o shim em `pacote.mts`.
- **Token novo:** entra em `packages/design-tokens`. A nota de uso vai no mapa `USO` de `tokens.mts`, e o gerador para se faltar alguma.
- **Guia da marca:** edite `conteudo/README.md`. Siga o formato do tipo Design System: sem título, regras que nomeiam tokens, e a seção "Não sincronizado" no fim.
