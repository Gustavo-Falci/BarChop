// Compila os componentes da onda B num IIFE que lê window.React / window.ReactDOM
// e expõe window.BarChop. Só lê o repo; escreve em saida/project/components/.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { AQUI, ARQUIVO_DO_COMPONENTE, COMPONENTES, REPO, SAIDA, WEB } from "./caminhos.mts";

// O esbuild que o tsx da API já traz (apps/api → tsx → esbuild): nenhuma dependência nova.
const daApi = createRequire(join(REPO, "apps/api/package.json"));
const esbuild = createRequire(daApi.resolve("tsx/package.json"))("esbuild");

// Barras normais: o caminho entra num `import` escrito em string.
const web = WEB.replace(/\\/g, "/");

// MarcaDeConfirmado usa `m` do motion, que só anima dentro de LazyMotion (o app dá isso no layout).
const entrada = [
  ...COMPONENTES.map((c) =>
    c === "MarcaDeConfirmado"
      ? `import { MarcaDeConfirmado as MarcaCrua } from "${web}/src/componentes/MarcaDeConfirmado.tsx";`
      : `import { ${c} } from "${web}/src/componentes/${ARQUIVO_DO_COMPONENTE[c] ?? c}.tsx";`,
  ),
  `import { LazyMotion, domAnimation } from "motion/react";`,
  `import { createElement } from "react";`,
  `function MarcaDeConfirmado(p) { return createElement(LazyMotion, { features: domAnimation }, createElement(MarcaCrua, p)); }`,
  `window.BarChop = { ${COMPONENTES.join(", ")} };`,
].join("\n");

const SHIMS = {
  react: "module.exports = window.React;",
  "react-dom": "module.exports = window.ReactDOM;",
  "react-dom/client": "module.exports = window.ReactDOM;",
  "react/jsx-runtime": `
    const R = window.React;
    function semFilhos(p, k) { const { children, ...r } = p || {}; if (k !== undefined) r.key = k; return [r, children]; }
    exports.Fragment = R.Fragment;
    exports.jsx = (t, p, k) => { const [r, c] = semFilhos(p, k); return c === undefined ? R.createElement(t, r) : R.createElement(t, r, c); };
    exports.jsxs = (t, p, k) => { const [r, c] = semFilhos(p, k); return R.createElement(t, r, ...(c || [])); };`,
  "next/link": `
    const R = window.React;
    exports.default = function Link({ href, prefetch, replace, scroll, shallow, passHref, legacyBehavior, ...r }) {
      return R.createElement("a", { href: typeof href === "string" ? href : (href && href.pathname) || "#", ...r });
    };
    exports.__esModule = true;`,
  "next/image": `
    const R = window.React;
    exports.default = function Image({ fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, ...r }) { return R.createElement("img", r); };
    exports.__esModule = true;`,
  "next/navigation": `
    exports.useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} });
    exports.usePathname = () => "/";
    exports.useSearchParams = () => new URLSearchParams();
    exports.useParams = () => ({});`,
};

const vistos = new Set();
const plugin = {
  name: "globais",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime|next\/.*)$/ }, (a) => {
      const nome = a.path === "react/jsx-dev-runtime" ? "react/jsx-runtime" : a.path;
      vistos.add(nome);
      return { path: nome, namespace: "shim" };
    });
    b.onLoad({ filter: /.*/, namespace: "shim" }, (a) => {
      const src = SHIMS[a.path];
      if (!src) throw new Error(`sem shim pra ${a.path}`);
      return { contents: src, loader: "js" };
    });
  },
};

const out = join(AQUI, "saida", "esbuild");
rmSync(out, { recursive: true, force: true });
const r = await esbuild.build({
  stdin: { contents: entrada, resolveDir: WEB, sourcefile: "entrada.ts", loader: "ts" },
  absWorkingDir: WEB,
  bundle: true,
  format: "iife",
  minify: true,
  jsx: "automatic",
  target: "es2020",
  outdir: out,
  entryNames: "bundle",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".module.css": "local-css", ".svg": "dataurl" },
  plugins: [plugin],
  metafile: true,
  logLevel: "warning",
  legalComments: "none",
});

const js = readFileSync(join(out, "bundle.js"), "utf8");
const css = existsSync(join(out, "bundle.css")) ? readFileSync(join(out, "bundle.css"), "utf8") : "";
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "BarChop", components: COMPONENTES.map((name) => ({ name })) })} */\n`;
if (/<\/script|<!--/i.test(js)) throw new Error("bundle.js tem </script ou <!--");
// base.css: o que app/globals.css e app/tokens-css.ts dão a toda página e os tokens não declaram.
const base = readFileSync(join(AQUI, "base.css"), "utf8");
if (/url\((?!["']?data:)/.test(css)) throw new Error("bundle.css aponta pra arquivo (url(...)): o pacote não leva arquivos");
mkdirSync(join(SAIDA, "components"), { recursive: true });
writeFileSync(join(SAIDA, "components", "bundle.js"), header + js);
writeFileSync(join(SAIDA, "components", "bundle.css"), base + "\n" + css);
rmSync(out, { recursive: true, force: true });

const pacotes = [
  ...new Set(
    Object.keys(r.metafile.inputs)
      .filter((p) => p.includes("node_modules"))
      .map((p) => {
        const s = p.split("node_modules/").pop()!.split("/");
        return s[0].startsWith("@") ? s.slice(0, 2).join("/") : s[0];
      }),
  ),
];
console.log("pacote:", ((header.length + js.length) / 1024) | 0, "KB de js,", ((base.length + css.length) / 1024) | 0, "KB de css");
console.log("trocados por shim:", [...vistos].join(", "), "· embutidos:", pacotes.join(", "));
