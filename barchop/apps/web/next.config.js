const path = require("path");
const { cabecalhosDeSeguranca } = require("./cabecalhos-de-seguranca");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A imagem de produção (infra/web.Dockerfile) leva só o
  // .next/standalone: o server.js e o pedaço do node_modules que as
  // páginas usam, sem o pnpm install inteiro. A raiz do rastreio é a do
  // monorepo porque os @barchop/* moram fora de apps/web — com a raiz
  // padrão eles ficariam de fora. Por isso o server.js sai em
  // .next/standalone/apps/web/, e o .next/static vai copiado ao lado.
  // Sem o `X-Powered-By: Next.js`: quem varre a internet atrás de uma
  // versão vulnerável não precisa da nossa ajuda (SEC-022).
  poweredByHeader: false,
  // Os cabeçalhos de segurança em todas as rotas, estáticos inclusive
  // (SEC-003). A regra mora em cabecalhos-de-seguranca.js, testada.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: cabecalhosDeSeguranca(process.env.NEXT_PUBLIC_URL_DO_SITE, {
          urlDaApi: process.env.NEXT_PUBLIC_API_URL,
          producao: process.env.NODE_ENV === "production",
        }),
      },
    ];
  },
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
