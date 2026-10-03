// Lint compartilhado do monorepo. Um arquivo só, importado pelo
// eslint.config.mjs da raiz: o `tsc` estrito já pega tipo errado, então
// aqui ficam as regras que o compilador não vê — hooks do React fora de
// ordem, dependência esquecida no useEffect, variável que sobrou.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      "**/expo-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // `_` na frente marca o parâmetro que a assinatura exige e o corpo
      // não usa (os handlers do Fastify, por exemplo).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.tsx", "apps/web/**/*.ts", "apps/mobile/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Configs em CommonJS (next.config.js, metro.config.js).
    files: ["**/*.js", "**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);
