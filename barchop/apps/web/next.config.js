/** @type {import('next').NextConfig} */
const nextConfig = {
  // Os pacotes internos publicam TypeScript cru (main aponta pro
  // src/index.ts), sem passo de build. Sem isso o Next não compila
  // o que vem de node_modules e quebra na primeira importação.
  transpilePackages: [
    "@barchop/types",
    "@barchop/design-tokens",
    "@barchop/scheduling",
  ],
};

module.exports = nextConfig;
