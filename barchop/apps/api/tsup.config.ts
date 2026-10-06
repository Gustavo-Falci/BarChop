import { defineConfig } from "tsup";

// A API não builda com `tsc` puro: os pacotes internos publicam
// TypeScript cru (main aponta pro src/index.ts), e o tsc recusa
// emitir arquivo que esteja fora do rootDir. O web escapa disso
// pelo transpilePackages e o mobile pelo Metro; aqui quem resolve
// é o bundler, que compila o source dos @barchop/* junto.
export default defineConfig({
  // O criar-suporte entra no bundle porque a imagem de produção não
  // leva o tsx nem o TypeScript: é a única porta pra criar a conta de
  // suporte na VM (`node dist/criar-suporte.js`).
  entry: {
    server: "src/server.ts",
    "criar-suporte": "scripts/criar-suporte.ts",
  },
  outDir: "dist",
  format: ["cjs"], // sem "type": "module" no package.json, o start roda CJS
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,

  // por padrão o tsup externaliza tudo que está em dependencies,
  // inclusive os workspace:* — o que derrubaria o build em produção,
  // já que lá não existe node_modules/@barchop com o TS cru.
  noExternal: [/^@barchop\//],

  // ...menos o Prisma, que vem de dentro do @barchop/database.
  // O client resolve os binários nativos do query engine em relação
  // à própria pasta do pacote, então tem que continuar externo.
  external: ["@prisma/client", ".prisma/client"],
});
