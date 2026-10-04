/** @type {import('next').NextConfig} */
const nextConfig = {
  // Os pacotes internos publicam TypeScript cru (main aponta pro
  // src/index.ts), sem passo de build. Sem isso o Next não compila
  // o que vem de node_modules e quebra na primeira importação.
  // Em desenvolvimento cada barbearia abre em <slug>.localhost:3000 (o
  // Chrome resolve *.localhost sozinho). Sem isto o servidor de dev
  // recusa os arquivos dele pedidos de outro host que não o localhost.
  allowedDevOrigins: ["*.localhost"],
  transpilePackages: [
    "@barchop/types",
    "@barchop/design-tokens",
    "@barchop/scheduling",
  ],
};

module.exports = nextConfig;
