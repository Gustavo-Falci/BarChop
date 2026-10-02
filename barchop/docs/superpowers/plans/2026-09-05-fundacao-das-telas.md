# Fundação das telas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a camada que falta entre a API pronta e as 23 telas — cliente HTTP tipado, formatação compartilhada, tokens, primitivos e setup de teste — sem entregar nenhuma tela.

**Architecture:** Três pacotes novos em `packages/` (`formato`, `api-client`, mais os DTOs que migram pra `types`) consumidos por `apps/web`. O `api-client` recebe `fetch` e `obterToken` por parâmetro, então teste de tela nunca toca em rede e nunca sobe Postgres. A API perde a normalização de telefone e email para os pacotes e passa a importar de lá, mantendo um adaptador fino que traduz o erro do pacote no `ErroDeNegocio` que as rotas já respondem.

**Tech Stack:** pnpm workspaces + Turborepo, TypeScript 5.5 estrito, Vitest 4, Testing Library, Next 16 (App Router, React 19.2.3), CSS Modules, `next/font/local`.

**Spec:** `docs/superpowers/specs/2026-09-05-fundacao-das-telas-design.md`

## Global Constraints

- **Idioma do código:** identificadores, comentários e mensagens em português, como todo o repositório. A exceção já existente é o nome da pasta `routers/`.
- **Comentários explicam o porquê, não o quê.** É o padrão de `apps/api/src` inteiro; um comentário que descreve o que a linha faz não passa em review aqui.
- **Telefone tem um formato guardado só:** `(11) 99999-8888`. DDD obrigatório. `55` na frente cai em 12 ou 13 dígitos, não em 10 (DDD 55 é Santa Maria/RS). Assinante com 8 ou 9 dígitos; qualquer outra contagem é erro.
- **Códigos de erro da API, exatos:** `nao_autenticado`, `nao_encontrado`, `conflito`, `horario_ocupado`, `regra_de_negocio`, `requisicao_invalida`, `erro_interno`, `credenciais_invalidas`. O corpo é sempre `{ erro: string, mensagem?: string }`.
- **Versões fixadas pelo repositório:** `vitest` `^4.1.11`, `react`/`react-dom` `19.2.3`, `next` `^16.3.3`, `typescript` `^5.5.0`. Não subir nenhuma delas neste plano.
- **Pacotes internos publicam TypeScript cru** (`main` e `types` apontam pra `./src/index.ts`). Todo runner que os consome precisa transformá-los — no Vitest isso é `server.deps.inline: [/@barchop\//]`.
- **`apps/web/AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de escrever código de Next.** Vale pras tarefas 8, 10 e 11: confirme `next/font/local`, `next/font/google` e a forma dos route groups na documentação instalada antes de escrever, não de memória.
- **Nenhuma das 23 telas entra neste plano.** Nada de React Native.
- Comandos rodam da raiz do repositório: `C:\Users\gufal\OneDrive\Documentos\GitHub\BarChop\barchop`.

## Desvio consciente da spec

A spec pede um módulo por área do `api-client`, espelhando `routers/`
(`auth`, `auth-cliente`, `barbearias`, `servicos`, …). O plano agrupa em
três — `publico`, `barbeiro`, `cliente` — porque é assim que a API
autoriza: `app.ts` tem exatamente esses três recortes, e os dois escopos
protegidos recusam o token um do outro. Espelhar `routers/` deixaria
`servicos` com uma função que manda token e outra que não pode mandar,
no mesmo objeto — a distinção que mais importa pra quem chama ficaria
invisível. As telas continuam alcançando as 31 rotas.

---

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `packages/formato/src/telefone.ts` | Normaliza, formata e extrai dígitos de telefone; lança `TelefoneInvalido` |
| `packages/formato/src/email.ts` | Normaliza caixa e espaços de email |
| `packages/formato/src/erros.ts` | `TelefoneInvalido` — erro sem semântica de HTTP |
| `packages/formato/src/index.ts` | Superfície do pacote |
| `packages/api-client/src/requisicao.ts` | `criarRequisicao` — URL, cabeçalho, JSON, tradução de erro, gancho de 401 |
| `packages/api-client/src/erro.ts` | `ErroDaApi` |
| `packages/api-client/src/publico.ts` | Rotas sem token: perfil, serviços, disponibilidade, agendamento público, login/signup do cliente |
| `packages/api-client/src/barbeiro.ts` | Rotas do escopo protegido do barbeiro |
| `packages/api-client/src/cliente.ts` | Rotas do escopo `/clientes/me` |
| `packages/api-client/src/index.ts` | `criarApiClient` e os tipos públicos |
| `packages/api-client/src/falso.ts` | `criarApiClientFalso` |
| `apps/web/app/primitivos/page.tsx` | Vitrine dos primitivos; substitui a tela provisória |
| `apps/web/src/componentes/*.tsx` + `.module.css` | Botão, Campo, Cartão, Chip |
| `apps/web/src/sessao/armazenamento.ts` | Leitura e escrita dos dois tokens |
| `apps/web/src/sessao/cliente-da-api.ts` | Monta o `api-client` do app |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `apps/api/src/lib/telefone.ts` | Vira adaptador: reexporta o pacote traduzindo `TelefoneInvalido` em `ErroDeNegocio` |
| `apps/api/src/lib/email.ts` | Deletado; os três routers passam a importar de `@barchop/formato` |
| `apps/api/src/lib/serializar.ts` | Perde as interfaces pro `@barchop/types`, reexporta pra não quebrar importadores |
| `packages/types/src/index.ts` | Ganha os DTOs de resposta e os tipos compostos das rotas |
| `packages/design-tokens/src/index.ts` | Ganha `spacing`, `borderWidth`, `fontSize` |
| `apps/web/app/layout.tsx`, `globals.css`, `page.tsx` | Fonte, reset, e a saída da tela provisória |
| `docs/design-system.html` | Space Grotesk → Clash Grotesk |

---

### Task 1: `packages/formato` — telefone e email saem da API

**Files:**
- Create: `packages/formato/package.json`, `packages/formato/tsconfig.json`, `packages/formato/vitest.config.mts`, `packages/formato/src/erros.ts`, `packages/formato/src/telefone.ts`, `packages/formato/src/email.ts`, `packages/formato/src/index.ts`
- Create: `packages/formato/tests/telefone.test.ts`, `packages/formato/tests/email.test.ts`
- Modify: `apps/api/src/lib/telefone.ts` (vira adaptador), `apps/api/package.json` (dependência), `apps/api/src/routers/auth.ts:2`, `apps/api/src/routers/clientes.ts:2`, `apps/api/src/routers/clientes-me.ts:3` (import do email)
- Delete: `apps/api/src/lib/email.ts`, `apps/api/tests/lib/telefone.test.ts` (o conteúdo migra)
- Test: `apps/api/tests/lib/telefone-traducao.test.ts` (novo, prova a tradução do erro)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `normalizarTelefone(valor: string | null | undefined): string | null`, `normalizarTelefoneObrigatorio(valor: string): string`, `formatarTelefoneParcial(valor: string): string`, `apenasDigitos(valor: string): string`, `normalizarEmail(email: string | null | undefined): string | null`, `class TelefoneInvalido extends Error`.

- [ ] **Step 1: Criar o esqueleto do pacote**

`packages/formato/package.json`:

```json
{
  "name": "@barchop/formato",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@barchop/config": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^4.1.11"
  }
}
```

`packages/formato/tsconfig.json`:

```json
{
  "extends": "@barchop/config/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "noEmit": true,
    "declaration": false
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.mts"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/formato/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

// Pacote sem dependência de framework nem de banco — nada de setup.
export default defineConfig({});
```

Rodar: `pnpm install`

- [ ] **Step 2: Escrever os testes que falham**

`packages/formato/tests/telefone.test.ts` — é o conteúdo de `apps/api/tests/lib/telefone.test.ts`, com a classe trocada, mais dois casos que a API não precisava:

```ts
import { describe, expect, it } from "vitest";
import {
  apenasDigitos,
  formatarTelefoneParcial,
  normalizarTelefone,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "../src/index";

describe("normalizarTelefone", () => {
  it("guarda celular com DDD no formato do cadastro", () => {
    expect(normalizarTelefone("11999998888")).toBe("(11) 99999-8888");
  });

  it("guarda fixo com DDD no formato do cadastro", () => {
    expect(normalizarTelefone("1133334444")).toBe("(11) 3333-4444");
  });

  it("reduz as várias formas do mesmo número a uma só", () => {
    const formas = [
      "11999998888",
      "(11) 99999-8888",
      "(11)99999-8888",
      "11 99999 8888",
      "11-99999-8888",
      "+55 11 99999-8888",
      "+5511999998888",
      "5511999998888",
    ];

    for (const forma of formas) {
      expect(normalizarTelefone(forma)).toBe("(11) 99999-8888");
    }
  });

  it("não confunde o DDD 55 com o código do país", () => {
    expect(normalizarTelefone("5533334444")).toBe("(55) 3333-4444");
    expect(normalizarTelefone("551133334444")).toBe("(11) 3333-4444");
  });

  it("devolve null pra ausência, como o normalizarEmail faz", () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });

  it("recusa número sem DDD", () => {
    expect(() => normalizarTelefone("99999-8888")).toThrow(TelefoneInvalido);
  });

  it("recusa contagem de dígitos que não é telefone brasileiro", () => {
    expect(() => normalizarTelefone("12345")).toThrow(TelefoneInvalido);
    expect(() => normalizarTelefone("119999988889")).toThrow(TelefoneInvalido);
  });

  it("recusa telefone ausente quando ele é obrigatório", () => {
    expect(() => normalizarTelefoneObrigatorio("")).toThrow(TelefoneInvalido);
  });
});

describe("formatarTelefoneParcial", () => {
  // A tela chama isto a cada tecla. Lançar no meio da digitação
  // apagaria o campo do usuário antes de ele terminar de digitar — por
  // isso esta função nunca lança, e quem valida é o normalizar.
  it("formata enquanto o número ainda está incompleto", () => {
    expect(formatarTelefoneParcial("")).toBe("");
    expect(formatarTelefoneParcial("1")).toBe("(1");
    expect(formatarTelefoneParcial("11")).toBe("(11)");
    expect(formatarTelefoneParcial("119")).toBe("(11) 9");
    expect(formatarTelefoneParcial("1199999")).toBe("(11) 99999");
    expect(formatarTelefoneParcial("11999998")).toBe("(11) 99999-8");
  });

  it("chega no formato guardado quando o número fica completo", () => {
    expect(formatarTelefoneParcial("11999998888")).toBe("(11) 99999-8888");
    expect(formatarTelefoneParcial("1133334444")).toBe("(11) 3333-4444");
  });

  it("ignora o que não é dígito e o excedente", () => {
    expect(formatarTelefoneParcial("+55 (11) 99999-8888")).toBe(
      "(11) 99999-8888"
    );
    expect(formatarTelefoneParcial("119999988881234")).toBe("(11) 99999-8888");
  });
});

describe("apenasDigitos", () => {
  it("tira a pontuação pra comparação dígito a dígito", () => {
    expect(apenasDigitos("(11) 99999-8888")).toBe("11999998888");
  });
});
```

`packages/formato/tests/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizarEmail } from "../src/index";

describe("normalizarEmail", () => {
  it("reduz caixa e espaços à forma guardada", () => {
    expect(normalizarEmail("  Gu@Exemplo.COM ")).toBe("gu@exemplo.com");
  });

  it("devolve null pra ausência", () => {
    expect(normalizarEmail(null)).toBeNull();
    expect(normalizarEmail(undefined)).toBeNull();
    expect(normalizarEmail("")).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/formato test`
Esperado: FAIL — `Failed to resolve import "../src/index"`.

- [ ] **Step 4: Escrever o pacote**

`packages/formato/src/erros.ts`:

```ts
// Erro sem semântica de HTTP. O `ErroDeNegocio` da API estende
// `ErroHttp` e carrega status 422 — importar aquilo aqui traria o
// contrato HTTP inteiro pra dentro das telas. Quem traduz um no outro
// é o adaptador em apps/api/src/lib/telefone.ts.
export class TelefoneInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "TelefoneInvalido";
  }
}
```

`packages/formato/src/telefone.ts` — o corpo vem de `apps/api/src/lib/telefone.ts`, com a classe trocada e a função nova:

```ts
import { TelefoneInvalido } from "./erros";

// A coluna é VARCHAR e o par [barbeariaId, telefone] é único, então o
// Postgres compara caractere a caractere: sem normalizar,
// "11999998888", "(11) 99999-8888" e "+55 11 99999-8888" viram três
// clientes distintos da mesma pessoa na mesma barbearia. Isso furava a
// proteção do signup ("só define senha quem ainda não tem"), porque
// bastava reformatar o número pra ganhar outro cadastro reivindicável.
//
// Mesma função na gravação e na busca — igual ao normalizarEmail. Se só
// uma das pontas normalizar, ninguém acha o que a outra guardou. Agora
// vale também pras telas, que mandam pro mesmo campo.
const FORMATO_GUARDADO = "(AA) NNNNN-NNNN";

// 55 na frente de 12 ou 13 dígitos é o código do país, e sai. Em 10
// dígitos ele é DDD de verdade (Santa Maria, RS) e fica — por isso a
// checagem olha o comprimento, não só o prefixo.
function semCodigoDoPais(digitos: string): string {
  return (digitos.length === 12 || digitos.length === 13) &&
    digitos.startsWith("55")
    ? digitos.slice(2)
    : digitos;
}

export function normalizarTelefone(
  telefone: string | null | undefined
): string | null {
  if (!telefone) return null;

  const semPais = semCodigoDoPais(telefone.replace(/\D/g, ""));
  const ddd = semPais.slice(0, 2);
  const assinante = semPais.slice(2);

  // 9 dígitos é celular, 8 é fixo. Qualquer outra contagem não vira
  // `${FORMATO_GUARDADO}`, e gravar assim mesmo daria à chave única um
  // valor que nenhuma outra ponta consegue reproduzir.
  if (assinante.length !== 9 && assinante.length !== 8) {
    throw new TelefoneInvalido(
      `o telefone ${telefone} não tem DDD e número no formato brasileiro`
    );
  }

  const corte = assinante.length - 4;
  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

// Onde o schema já exige o campo, o `null` acima é inalcançável. Este
// wrapper torna isso um fato de tipo, em vez de um `!` no chamador com
// a prova escondida num comentário.
export function normalizarTelefoneObrigatorio(telefone: string): string {
  const normalizado = normalizarTelefone(telefone);

  if (!normalizado) {
    throw new TelefoneInvalido("o telefone é obrigatório");
  }

  return normalizado;
}

// Chamada a cada tecla digitada, e por isso nunca lança: um erro no
// meio da digitação apagaria o que a pessoa está escrevendo. Quem
// recusa é o normalizarTelefone, no envio.
export function formatarTelefoneParcial(valor: string): string {
  const digitos = semCodigoDoPais(valor.replace(/\D/g, "")).slice(0, 11);

  if (digitos.length === 0) return "";
  if (digitos.length === 1) return `(${digitos}`;
  if (digitos.length === 2) return `(${digitos})`;

  const ddd = digitos.slice(0, 2);
  const assinante = digitos.slice(2);

  // Onde cai o traço depende de o número ser fixo (8 dígitos, 4+4) ou
  // celular (9, 5+4), e no meio da digitação não dá pra saber qual dos
  // dois está sendo digitado. A regra: até 5 dígitos não há traço,
  // porque nenhum dos dois formatos tem traço aí; com exatamente 8 o
  // número é um fixo completo e ganha 4+4; qualquer outra contagem é
  // tratada como celular, que é a esmagadora maioria do que os clientes
  // digitam. O efeito colateral é um fixo pela metade aparecer como
  // "(11) 33334-44" até o oitavo dígito — transitório, e o alternativo
  // seria assumir fixo e piscar o traço no celular, que é o caso comum.
  if (assinante.length <= 5) return `(${ddd}) ${assinante}`;

  const corte = assinante.length === 8 ? 4 : 5;
  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

// Só os dígitos, pra comparar com o que o barbeiro digitou na busca. A
// coluna guarda pontuação, então procurar "999998888" cru nunca casaria
// com "(11) 99999-8888" — é preciso tirar a pontuação dos dois lados.
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}
```

`packages/formato/src/email.ts` — corpo idêntico ao de `apps/api/src/lib/email.ts`:

```ts
// A coluna é VARCHAR com índice único simples — sem citext e sem índice
// funcional, o Postgres compara caixa a caixa. Sem normalizar,
// "Gu@Exemplo.com" e "gu@exemplo.com" viram duas contas distintas, e
// quem cadastrou numa não entra pela outra. A mesma função na gravação
// e na busca, senão a busca nunca acha o que a gravação guardou.
export function normalizarEmail(
  email: string | null | undefined
): string | null {
  return email ? email.trim().toLowerCase() : null;
}
```

`packages/formato/src/index.ts`:

```ts
export { TelefoneInvalido } from "./erros";
export {
  apenasDigitos,
  formatarTelefoneParcial,
  normalizarTelefone,
  normalizarTelefoneObrigatorio,
} from "./telefone";
export { normalizarEmail } from "./email";
```

- [ ] **Step 5: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/formato test`
Esperado: PASS, com os casos de telefone e de email verdes.

- [ ] **Step 6: Escrever o teste do adaptador da API**

`apps/api/tests/lib/telefone-traducao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ErroDeNegocio } from "../../src/lib/erro-negocio";
import { normalizarTelefone } from "../../src/lib/telefone";

// O pacote lança um erro sem HTTP dentro. As rotas respondem 422 com
// `telefone_invalido` desde a fase 6, e existe teste de rota contando
// com isso — este arquivo é o que garante que a tradução continua
// acontecendo depois de a regra ter saído da API.
describe("adaptador de telefone da API", () => {
  it("traduz o erro do pacote no ErroDeNegocio que as rotas respondem", () => {
    try {
      normalizarTelefone("99999-8888");
      expect.unreachable("normalizarTelefone deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeNegocio);
      expect((erro as ErroDeNegocio).status).toBe(422);
      expect((erro as ErroDeNegocio).codigo).toBe("telefone_invalido");
    }
  });

  it("continua devolvendo o formato guardado pro caminho feliz", () => {
    expect(normalizarTelefone("+55 11 99999-8888")).toBe("(11) 99999-8888");
  });
});
```

- [ ] **Step 7: Rodar e ver PASSAR — é teste de caracterização**

Rodar: `pnpm --filter @barchop/api exec vitest run tests/lib/telefone-traducao.test.ts`
Esperado: PASS. Diferente dos outros testes deste plano, este não começa vermelho de propósito: ele descreve o comportamento que a API **já** tem, e existe pra falhar no Step 8 se a refatoração perder a tradução. Se ele falhar agora, pare — significa que o `ErroDeNegocio` já não sai como 422 com `telefone_invalido`, e a premissa da tarefa está errada.

- [ ] **Step 8: Trocar a API pelo adaptador**

Adicionar em `apps/api/package.json`, em `dependencies`:

```json
"@barchop/formato": "workspace:*",
```

Substituir `apps/api/src/lib/telefone.ts` inteiro por:

```ts
import { TelefoneInvalido } from "@barchop/formato";
import * as formato from "@barchop/formato";
import { ErroDeNegocio } from "./erro-negocio";

// A regra mora em @barchop/formato, porque as telas gravam no mesmo
// campo e precisam da mesma normalização. O que fica aqui é só a
// tradução: o pacote lança TelefoneInvalido, que não sabe o que é HTTP,
// e as rotas respondem 422 com `telefone_invalido` desde a fase 6.
function traduzindo<T>(executar: () => T): T {
  try {
    return executar();
  } catch (erro) {
    if (erro instanceof TelefoneInvalido) {
      throw new ErroDeNegocio(erro.message, "telefone_invalido");
    }
    throw erro;
  }
}

export function normalizarTelefone(
  telefone: string | null | undefined
): string | null {
  return traduzindo(() => formato.normalizarTelefone(telefone));
}

export function normalizarTelefoneObrigatorio(telefone: string): string {
  return traduzindo(() => formato.normalizarTelefoneObrigatorio(telefone));
}

// Não lança, então não passa pela tradução.
export const apenasDigitos = formato.apenasDigitos;
```

Trocar o import de email nos três routers — em `apps/api/src/routers/auth.ts:2`, `apps/api/src/routers/clientes.ts:2` e `apps/api/src/routers/clientes-me.ts:3`:

```ts
import { normalizarEmail } from "@barchop/formato";
```

Apagar `apps/api/src/lib/email.ts` e `apps/api/tests/lib/telefone.test.ts`.

Rodar: `pnpm install`

- [ ] **Step 9: Rodar a suíte inteira da API**

Rodar: `pnpm --filter @barchop/api test`
Esperado: PASS. A contagem muda — os 7 casos de `tests/lib/telefone.test.ts` foram pro pacote e entraram 2 do adaptador — e o número final não importa; o que importa é que a suíte está verde e que **nenhum arquivo de teste de rota foi editado**. Eles assertam o 400 do `pattern` do schema, não o 422, e por isso não enxergam a troca. Se algum teste de rota precisar de edição pra passar, pare: a tradução do erro está errada.

Rodar: `pnpm --filter @barchop/api type-check`
Esperado: sem erro.

- [ ] **Step 10: Commit**

```bash
git add packages/formato apps/api docs
git commit -m "refactor: move phone and email formatting into a shared package

The screens write to the same columns the API does, so the rule has to
be one implementation, not a second one that drifts. The API keeps a
thin adapter because the package throws an error that knows nothing
about HTTP, while the routes have answered 422 with telefone_invalido
since phase 6."
```

---

### Task 2: os DTOs de resposta mudam pra `@barchop/types`

**Files:**
- Modify: `packages/types/src/index.ts` (recebe os tipos), `apps/api/src/lib/serializar.ts` (importa e reexporta)
- Test: `apps/api/tests/lib/serializar.test.ts` (existente — deve continuar passando sem edição)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `BarbeariaSerializada`, `HorarioSerializado`, `ServicoSerializado`, `ClienteSerializado`, `AgendamentoServicoSerializado`, `AgendamentoSerializado`, `AgendamentoComCliente`, e os tipos compostos `PerfilPublicoBarbearia`, `SessaoBarbeiro`, `SessaoCliente`, `Disponibilidade`, `DisponibilidadeDoMes`.

- [ ] **Step 1: Escrever os tipos em `packages/types/src/index.ts`**

Acrescentar ao fim do arquivo (o `ClientePublico` e os dois inputs já existentes ficam onde estão):

```ts
// Os DTOs de resposta moram aqui, e não em apps/api, pelo mesmo motivo
// do ClientePublico acima: o serializador importa o tipo, então
// divergir os dois quebra o type-check em vez de quebrar uma tela.

export interface BarbeariaSerializada {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  logoUrl: string | null;
}

export interface HorarioSerializado {
  diaSemana: number; // 0 = domingo
  horaAbertura: string | null; // "HH:mm"
  horaFechamento: string | null;
  fechado: boolean;
}

export interface ServicoSerializado {
  id: string;
  nome: string;
  duracaoMinutos: number;
  // String, nunca number: o preço é Decimal no banco e passar por float
  // perderia centavo. Ver serializarServico.
  preco: string;
  ativo: boolean;
}

export type ClienteSerializado = ClientePublico;

export interface AgendamentoServicoSerializado {
  servicoId: string;
  nome: string;
  // Preço e duração congelados no dia do agendamento, não os de hoje.
  precoNoMomento: string;
  duracaoNoMomento: number;
}

export interface AgendamentoSerializado {
  id: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  horaFim: string;
  status: string;
  origem: string;
  observacoes: string | null;
  servicos: AgendamentoServicoSerializado[];
}

// As rotas do barbeiro devolvem o cliente junto porque a agenda mostra
// o nome em cada linha; as públicas nunca devolvem — quem sabe o
// telefone de alguém não pode puxar a agenda dessa pessoa.
export interface AgendamentoComCliente extends AgendamentoSerializado {
  cliente: ClienteSerializado;
}

// Resposta de GET /barbearias/:slug. O `barbeiros` é o que destrava o
// fluxo público inteiro: /disponibilidade e o POST público exigem
// barbeiroId, e esta é a única rota pública que o entrega.
export interface PerfilPublicoBarbearia extends BarbeariaSerializada {
  horarios: HorarioSerializado[];
  barbeiros: { id: string; nome: string }[];
}

export interface SessaoBarbeiro {
  token: string;
  barbeiro: { id: string; nome: string; email: string | null };
  barbearia: { id: string; nome: string; slug: string };
}

export interface SessaoCliente {
  token: string;
  cliente: ClienteSerializado;
}

export interface PerfilBarbeiro {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  barbeariaId: string;
}

// GET /barbearias/:slug/disponibilidade — horários de início livres.
export interface Disponibilidade {
  horarios: string[]; // "HH:mm"
}

// GET /barbearias/:slug/disponibilidade/mes — `true` no dia que tem
// pelo menos um horário livre. A rota não sabe que dia é hoje: quem
// desabilita o passado é a tela.
export interface DisponibilidadeDoMes {
  dias: Record<string, boolean>; // "YYYY-MM-DD" -> tem vaga
}
```

- [ ] **Step 2: Fazer o serializador importar em vez de declarar**

Em `apps/api/src/lib/serializar.ts`, trocar cada `export interface X {...}` (e o `export type ClienteSerializado`) por um import no topo e um reexport, mantendo as funções intactas:

```ts
import type {
  AgendamentoSerializado,
  AgendamentoServicoSerializado,
  BarbeariaSerializada,
  ClienteSerializado,
  HorarioSerializado,
  ServicoSerializado,
} from "@barchop/types";

// Reexportados porque routers/horarios.ts e os testes importam daqui.
// A declaração agora mora em @barchop/types, junto do que as telas
// consomem.
export type {
  AgendamentoSerializado,
  AgendamentoServicoSerializado,
  BarbeariaSerializada,
  ClienteSerializado,
  HorarioSerializado,
  ServicoSerializado,
};
```

O `import type { ClientePublico }` que existe hoje sai — `ClienteSerializado` já vem pronto do pacote.

- [ ] **Step 3: Rodar type-check e testes**

Rodar: `pnpm --filter @barchop/api type-check`
Esperado: sem erro. Se aparecer erro em `serializarAgendamentoComCliente`, o retorno dela deve passar a ser `AgendamentoComCliente` importado do pacote.

Rodar: `pnpm --filter @barchop/api test`
Esperado: PASS, mesma contagem da Task 1.

- [ ] **Step 4: Commit**

```bash
git add packages/types apps/api/src/lib/serializar.ts
git commit -m "refactor: move response DTOs into the shared types package

The screens need the shape of every response, and redeclaring it on the
front end is how the two drift in silence. Same pattern ClientePublico
already used: the serializer imports the type, so divergence breaks the
type-check instead of a screen."
```

---

### Task 3: `packages/api-client` — núcleo da requisição

**Files:**
- Create: `packages/api-client/package.json`, `tsconfig.json`, `vitest.config.mts`, `src/erro.ts`, `src/requisicao.ts`, `src/index.ts`
- Test: `packages/api-client/tests/requisicao.test.ts`

**Interfaces:**
- Consumes: os tipos da Task 2.
- Produces: `class ErroDaApi extends Error { status: number; codigo: string; mensagem: string }`, `interface OpcoesDoClient { baseUrl: string; obterToken?: () => string | null; aoExpirarSessao?: () => void; fetch?: typeof globalThis.fetch }`, `criarRequisicao(opcoes: OpcoesDoClient): Requisicao`, onde `Requisicao` é `<T>(caminho: string, init?: { metodo?: string; corpo?: unknown; query?: Record<string, string | string[] | undefined>; comToken?: boolean }) => Promise<T>`.

- [ ] **Step 1: Criar o esqueleto do pacote**

`packages/api-client/package.json`:

```json
{
  "name": "@barchop/api-client",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@barchop/types": "workspace:*"
  },
  "devDependencies": {
    "@barchop/config": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^4.1.11"
  }
}
```

`packages/api-client/tsconfig.json` e `vitest.config.mts`: idênticos aos da Task 1, Step 1 (mesmo `extends`, mesmo `include`, config vazia).

Rodar: `pnpm install`

- [ ] **Step 2: Escrever o teste que falha**

`packages/api-client/tests/requisicao.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { criarRequisicao, ErroDaApi } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("criarRequisicao", () => {
  it("monta a URL a partir da baseUrl e devolve o JSON", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ status: "ok" }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    const resposta = await requisicao<{ status: string }>("/health");

    expect(resposta).toEqual({ status: "ok" });
    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/health");
  });

  it("repete o mesmo parâmetro de query pra cada item de um array", async () => {
    // A API lê servicoIds como array e conta com ?servicoIds=a&servicoIds=b.
    const fetchFalso = vi.fn(async () => respostaJson({ horarios: [] }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/barbearias/gr/disponibilidade", {
      query: { barbeiroId: "b1", servicoIds: ["s1", "s2"] },
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr/disponibilidade?barbeiroId=b1&servicoIds=s1&servicoIds=s2"
    );
  });

  it("omite parâmetro undefined em vez de mandar a string 'undefined'", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ agendamentos: [] }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/clientes/me/agendamentos", {
      query: { de: "2026-09-01", ate: undefined },
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos?de=2026-09-01"
    );
  });

  it("manda o token no Authorization quando a rota pede", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({}));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-do-barbeiro",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/me", { comToken: true });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-barbeiro"
    );
  });

  it("não manda Authorization nas rotas públicas", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({}));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-que-nao-deve-vazar",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/barbearias/gr");

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("serializa o corpo como JSON e marca o método", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({}, 201));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await requisicao("/servicos", {
      metodo: "POST",
      corpo: { nome: "Corte" },
      comToken: false,
    });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ nome: "Corte" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("traduz o corpo de erro da API em ErroDaApi", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson(
        { erro: "horario_ocupado", mensagem: "esse horário já está ocupado" },
        409
      )
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/barbearias/gr/agendamentos")).rejects.toThrow(
      ErroDaApi
    );

    try {
      await requisicao("/barbearias/gr/agendamentos");
    } catch (erro) {
      const daApi = erro as ErroDaApi;
      expect(daApi.status).toBe(409);
      expect(daApi.codigo).toBe("horario_ocupado");
      expect(daApi.mensagem).toBe("esse horário já está ocupado");
    }
  });

  it("chama aoExpirarSessao no 401, e ainda lança", async () => {
    // O token vale 7 dias e o hook da API consulta o banco a cada
    // requisição, então 401 no meio da sessão é evento normal — a tela
    // precisa ser avisada pra limpar o token, não só ver a exceção.
    const aoExpirarSessao = vi.fn();
    const fetchFalso = vi.fn(async () =>
      respostaJson({ erro: "nao_autenticado" }, 401)
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      obterToken: () => "jwt-vencido",
      aoExpirarSessao,
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/me", { comToken: true })).rejects.toThrow(
      ErroDaApi
    );
    expect(aoExpirarSessao).toHaveBeenCalledTimes(1);
  });

  it("sobrevive a resposta de erro sem corpo JSON", async () => {
    // 500 de proxy, HTML de gateway: sem isto o JSON.parse estouraria e
    // a tela veria um SyntaxError em vez do status real.
    const fetchFalso = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 })
    );
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    try {
      await requisicao("/health");
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const daApi = erro as ErroDaApi;
      expect(daApi.status).toBe(502);
      expect(daApi.codigo).toBe("erro_interno");
    }
  });

  it("aceita 204 sem corpo", async () => {
    const fetchFalso = vi.fn(async () => new Response(null, { status: 204 }));
    const requisicao = criarRequisicao({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    await expect(requisicao("/health")).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: FAIL — `Failed to resolve import "../src/index"`.

- [ ] **Step 4: Implementar o núcleo**

`packages/api-client/src/erro.ts`:

```ts
// O corpo de erro da API é sempre { erro, mensagem? } — garantido pelo
// tratador central em apps/api/src/plugins/erros.ts. As telas ramificam
// no `codigo`, nunca no status solto: 409 pode ser telefone repetido
// (`conflito`) ou horário tomado (`horario_ocupado`), e a reação certa
// é diferente.
export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly mensagem: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem || codigo);
    this.name = "ErroDaApi";
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}
```

`packages/api-client/src/requisicao.ts`:

```ts
import { ErroDaApi } from "./erro";

export interface OpcoesDoClient {
  baseUrl: string;
  // Função, não valor: o token muda no meio da vida do client (login,
  // logout, expiração) e quem guarda é o app, não este pacote.
  obterToken?: () => string | null;
  aoExpirarSessao?: () => void;
  // Injetável pra o teste não precisar de rede nem de MSW.
  fetch?: typeof globalThis.fetch;
}

export interface OpcoesDaChamada {
  metodo?: string;
  corpo?: unknown;
  query?: Record<string, string | string[] | undefined>;
  comToken?: boolean;
}

export type Requisicao = <T>(
  caminho: string,
  opcoes?: OpcoesDaChamada
) => Promise<T>;

function montarQuery(query: OpcoesDaChamada["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query)) {
    if (valor === undefined) continue;
    // Array vira o mesmo parâmetro repetido — é o formato que o AJV do
    // Fastify lê como array em /disponibilidade.
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      params.append(chave, item);
    }
  }

  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function criarRequisicao(opcoes: OpcoesDoClient): Requisicao {
  const executar = opcoes.fetch ?? globalThis.fetch;

  return async function requisicao<T>(
    caminho: string,
    chamada: OpcoesDaChamada = {}
  ): Promise<T> {
    const cabecalhos: Record<string, string> = { Accept: "application/json" };

    if (chamada.corpo !== undefined) {
      cabecalhos["Content-Type"] = "application/json";
    }

    // Só onde a rota pede: mandar o token do barbeiro numa rota pública
    // não autentica nada e amplia o alcance de um token vazado.
    if (chamada.comToken) {
      const token = opcoes.obterToken?.();
      if (token) cabecalhos.Authorization = `Bearer ${token}`;
    }

    const resposta = await executar(
      `${opcoes.baseUrl}${caminho}${montarQuery(chamada.query)}`,
      {
        method: chamada.metodo ?? "GET",
        headers: cabecalhos,
        ...(chamada.corpo !== undefined
          ? { body: JSON.stringify(chamada.corpo) }
          : {}),
      }
    );

    if (resposta.status === 204) return null as T;

    // Corpo ilegível existe: 502 de proxy, HTML de gateway. Sem o
    // catch, o JSON.parse estouraria e a tela veria SyntaxError no
    // lugar do status.
    const corpo = await resposta
      .json()
      .catch(() => null as { erro?: string; mensagem?: string } | null);

    if (!resposta.ok) {
      if (resposta.status === 401) opcoes.aoExpirarSessao?.();

      throw new ErroDaApi(
        resposta.status,
        corpo?.erro ?? (resposta.status >= 500 ? "erro_interno" : "requisicao_invalida"),
        corpo?.mensagem ?? ""
      );
    }

    return corpo as T;
  };
}
```

`packages/api-client/src/index.ts` (por enquanto só o núcleo; as áreas entram nas próximas tarefas):

```ts
export { ErroDaApi } from "./erro";
export { criarRequisicao } from "./requisicao";
export type {
  OpcoesDaChamada,
  OpcoesDoClient,
  Requisicao,
} from "./requisicao";
```

- [ ] **Step 5: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: PASS — os dez casos do núcleo.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client
git commit -m "feat: add the api-client request core

fetch and the token both arrive by parameter: the first is what lets a
screen test run without a network or MSW, the second is what keeps the
package out of the session business, which differs per platform. Every
401 notifies before it throws, because a seven-day token plus a hook
that hits the database on each request makes mid-session 401 ordinary."
```

---

### Task 4: `api-client` — as rotas públicas

**Files:**
- Create: `packages/api-client/src/publico.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/tests/publico.test.ts`

**Interfaces:**
- Consumes: `criarRequisicao`, `Requisicao` (Task 3); os tipos da Task 2.
- Produces: `criarApiPublica(requisicao: Requisicao)` devolvendo `{ perfilDaBarbearia, servicos, disponibilidadeDoDia, disponibilidadeDoMes, agendar, signupCliente, loginCliente }` com as assinaturas do Step 2.

- [ ] **Step 1: Escrever o teste que falha**

`packages/api-client/tests/publico.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function clientComFetch(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api pública", () => {
  it("busca o perfil da barbearia pelo slug", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        id: "b1",
        nome: "GR Barber",
        slug: "gr-barber",
        telefone: null,
        endereco: null,
        logoUrl: null,
        horarios: [],
        barbeiros: [{ id: "bb1", nome: "Rafael" }],
      })
    );

    const perfil = await clientComFetch(fetchFalso).publico.perfilDaBarbearia(
      "gr-barber"
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber"
    );
    expect(perfil.barbeiros[0].nome).toBe("Rafael");
  });

  it("lista os serviços ativos da barbearia", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        servicos: [
          {
            id: "s1",
            nome: "Corte",
            duracaoMinutos: 30,
            preco: "40.00",
            ativo: true,
          },
        ],
      })
    );

    const servicos = await clientComFetch(fetchFalso).publico.servicos(
      "gr-barber"
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/servicos"
    );
    expect(servicos[0].preco).toBe("40.00");
  });

  it("pede os horários livres de um dia com os serviços escolhidos", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({ horarios: ["09:00", "09:15"] })
    );

    const horarios = await clientComFetch(
      fetchFalso
    ).publico.disponibilidadeDoDia("gr-barber", {
      barbeiroId: "bb1",
      data: "2026-09-10",
      servicoIds: ["s1", "s2"],
    });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/disponibilidade?barbeiroId=bb1&data=2026-09-10&servicoIds=s1&servicoIds=s2"
    );
    expect(horarios).toEqual(["09:00", "09:15"]);
  });

  it("pede o mapa do mês pro calendário", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({ dias: { "2026-09-10": true, "2026-09-11": false } })
    );

    const dias = await clientComFetch(fetchFalso).publico.disponibilidadeDoMes(
      "gr-barber",
      { barbeiroId: "bb1", mes: "2026-09", servicoIds: ["s1"] }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/disponibilidade/mes?barbeiroId=bb1&mes=2026-09&servicoIds=s1"
    );
    expect(dias["2026-09-11"]).toBe(false);
  });

  it("agenda pelo link público mandando nome e telefone", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson(
        {
          id: "a1",
          data: "2026-09-10",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "pendente",
          origem: "cliente",
          observacoes: null,
          servicos: [],
        },
        201
      )
    );

    const agendamento = await clientComFetch(fetchFalso).publico.agendar(
      "gr-barber",
      {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data: "2026-09-10",
        horaInicio: "09:00",
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      }
    );

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/agendamentos"
    );
    expect(init.method).toBe("POST");
    expect(agendamento.status).toBe("pendente");
  });

  it("entra na conta do cliente daquela barbearia", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        token: "jwt-cliente",
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: true,
        },
      })
    );

    const sessao = await clientComFetch(fetchFalso).publico.loginCliente(
      "gr-barber",
      { telefone: "(11) 99999-8888", senha: "segredo123" }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/auth/cliente/login"
    );
    expect(sessao.token).toBe("jwt-cliente");
  });

  it("cria a conta do cliente naquela barbearia", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson(
        {
          token: "jwt-novo",
          cliente: {
            id: "c2",
            nome: "Maria",
            telefone: "(11) 98888-7777",
            email: null,
            temConta: true,
          },
        },
        201
      )
    );

    const sessao = await clientComFetch(fetchFalso).publico.signupCliente(
      "gr-barber",
      { nome: "Maria", telefone: "(11) 98888-7777", senha: "segredo123" }
    );

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/barbearias/gr-barber/auth/cliente/signup"
    );
    expect(sessao.cliente.temConta).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/api-client exec vitest run tests/publico.test.ts`
Esperado: FAIL — `criarApiClient is not exported`.

- [ ] **Step 3: Implementar as rotas públicas e a fábrica**

`packages/api-client/src/publico.ts`:

```ts
import type {
  AgendamentoSerializado,
  Disponibilidade,
  DisponibilidadeDoMes,
  NovoAgendamentoPublicoInput,
  PerfilPublicoBarbearia,
  SessaoCliente,
  ServicoSerializado,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

export interface FiltroDoDia {
  barbeiroId: string;
  data: string; // "YYYY-MM-DD"
  servicoIds: string[];
}

export interface FiltroDoMes {
  barbeiroId: string;
  mes: string; // "YYYY-MM"
  servicoIds: string[];
}

export interface CredenciaisDoCliente {
  telefone: string;
  senha: string;
}

export interface NovaContaDeCliente extends CredenciaisDoCliente {
  nome: string;
}

// Nenhuma destas manda token: são as telas abertas pelo link do
// WhatsApp, e a API as registra fora dos dois escopos protegidos.
export function criarApiPublica(requisicao: Requisicao) {
  return {
    perfilDaBarbearia(slug: string): Promise<PerfilPublicoBarbearia> {
      return requisicao(`/barbearias/${slug}`);
    },

    async servicos(slug: string): Promise<ServicoSerializado[]> {
      // A API embrulha em { servicos }. Desembrulhar aqui poupa a tela
      // de conhecer o formato do envelope.
      const resposta = await requisicao<{ servicos: ServicoSerializado[] }>(
        `/barbearias/${slug}/servicos`
      );
      return resposta.servicos;
    },

    async disponibilidadeDoDia(
      slug: string,
      filtro: FiltroDoDia
    ): Promise<string[]> {
      const resposta = await requisicao<Disponibilidade>(
        `/barbearias/${slug}/disponibilidade`,
        { query: { ...filtro } }
      );
      return resposta.horarios;
    },

    async disponibilidadeDoMes(
      slug: string,
      filtro: FiltroDoMes
    ): Promise<Record<string, boolean>> {
      const resposta = await requisicao<DisponibilidadeDoMes>(
        `/barbearias/${slug}/disponibilidade/mes`,
        { query: { ...filtro } }
      );
      return resposta.dias;
    },

    agendar(
      slug: string,
      novo: NovoAgendamentoPublicoInput
    ): Promise<AgendamentoSerializado> {
      return requisicao(`/barbearias/${slug}/agendamentos`, {
        metodo: "POST",
        corpo: novo,
      });
    },

    signupCliente(
      slug: string,
      conta: NovaContaDeCliente
    ): Promise<SessaoCliente> {
      return requisicao(`/barbearias/${slug}/auth/cliente/signup`, {
        metodo: "POST",
        corpo: conta,
      });
    },

    loginCliente(
      slug: string,
      credenciais: CredenciaisDoCliente
    ): Promise<SessaoCliente> {
      return requisicao(`/barbearias/${slug}/auth/cliente/login`, {
        metodo: "POST",
        corpo: credenciais,
      });
    },
  };
}
```

Substituir `packages/api-client/src/index.ts` por:

```ts
import { criarApiPublica } from "./publico";
import { criarRequisicao, type OpcoesDoClient } from "./requisicao";

export { ErroDaApi } from "./erro";
export { criarRequisicao } from "./requisicao";
export type {
  OpcoesDaChamada,
  OpcoesDoClient,
  Requisicao,
} from "./requisicao";
export type {
  CredenciaisDoCliente,
  FiltroDoDia,
  FiltroDoMes,
  NovaContaDeCliente,
} from "./publico";

export function criarApiClient(opcoes: OpcoesDoClient) {
  const requisicao = criarRequisicao(opcoes);

  return {
    publico: criarApiPublica(requisicao),
  };
}

export type ApiClient = ReturnType<typeof criarApiClient>;
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: PASS — os do núcleo mais os sete daqui.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client
git commit -m "feat: add the public routes to the api-client

These are the five screens the WhatsApp link opens, plus the client's
login and signup, which are per barbershop because the API scopes them
by slug. The list endpoints unwrap their envelope here so no screen has
to know the shape of the wrapper."
```

---

### Task 5: `api-client` — as rotas do barbeiro

**Files:**
- Create: `packages/api-client/src/barbeiro.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/tests/barbeiro.test.ts`

**Interfaces:**
- Consumes: `Requisicao` (Task 3), a fábrica `criarApiClient` (Task 4).
- Produces: `criarApiBarbeiro(requisicao)` devolvendo `{ signup, login, meuPerfil, atualizarMeuPerfil, minhaBarbearia, atualizarMinhaBarbearia, horarios, salvarHorarios, servicos, criarServico, atualizarServico, desativarServico, clientes, criarCliente, cliente, atualizarCliente, agendamentosDoDia, agendamentosDoIntervalo, agendamento, criarAgendamento, atualizarAgendamento }`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/api-client/tests/barbeiro.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientAutenticado(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-barbeiro",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function urlEInit(fetchFalso: ReturnType<typeof vi.fn>) {
  return {
    url: fetchFalso.mock.calls[0][0] as string,
    init: fetchFalso.mock.calls[0][1] as RequestInit,
  };
}

describe("api do barbeiro", () => {
  it("faz login sem token e devolve a sessão", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        token: "jwt-do-barbeiro",
        barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
        barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
      })
    );

    const sessao = await clientAutenticado(fetchFalso).barbeiro.login({
      email: "rafael@gr.com",
      senha: "segredo123",
    });

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/auth/login");
    // Login não manda Authorization: não há sessão ainda, e mandar um
    // token velho aqui não faria diferença nenhuma pra API.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(sessao.barbearia.slug).toBe("gr-barber");
  });

  it("cria a barbearia e o primeiro barbeiro no signup", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson(
        {
          token: "jwt-novo",
          barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
          barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
        },
        201
      )
    );

    await clientAutenticado(fetchFalso).barbeiro.signup({
      barbearia: { nome: "GR Barber", slug: "gr-barber" },
      barbeiro: { nome: "Rafael", email: "rafael@gr.com", senha: "segredo123" },
    });

    expect(urlEInit(fetchFalso).url).toBe("https://api.exemplo.br/auth/signup");
  });

  it("lê o próprio perfil com o token", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        id: "bb1",
        nome: "Rafael",
        email: "rafael@gr.com",
        telefone: null,
        barbeariaId: "b1",
      })
    );

    await clientAutenticado(fetchFalso).barbeiro.meuPerfil();

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/me");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-barbeiro"
    );
  });

  it("grava os sete dias de horário de uma vez", async () => {
    // PUT, não PATCH: dia ausente do corpo vira fechado, e a API grava
    // a semana inteira ou nenhuma.
    const fetchFalso = vi.fn(async () => respostaJson({ horarios: [] }));

    await clientAutenticado(fetchFalso).barbeiro.salvarHorarios([
      { diaSemana: 1, horaAbertura: "09:00", horaFechamento: "18:00", fechado: false },
    ]);

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/horarios");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(
      JSON.stringify({
        horarios: [
          {
            diaSemana: 1,
            horaAbertura: "09:00",
            horaFechamento: "18:00",
            fechado: false,
          },
        ],
      })
    );
  });

  it("desativa serviço com DELETE, que é reversível na API", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        id: "s1",
        nome: "Corte",
        duracaoMinutos: 30,
        preco: "40.00",
        ativo: false,
      })
    );

    const servico = await clientAutenticado(fetchFalso).barbeiro.desativarServico(
      "s1"
    );

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/servicos/s1");
    expect(init.method).toBe("DELETE");
    expect(servico.ativo).toBe(false);
  });

  it("busca cliente por texto na query", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ clientes: [] }));

    await clientAutenticado(fetchFalso).barbeiro.clientes("99999");

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/clientes?busca=99999"
    );
  });

  it("lista a agenda de um dia", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ agendamentos: [] }));

    await clientAutenticado(fetchFalso).barbeiro.agendamentosDoDia("2026-09-10");

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/agendamentos?data=2026-09-10"
    );
  });

  it("lista a agenda de um intervalo", async () => {
    // A API recusa `data` junto com `de`/`ate` com 400, então as duas
    // formas são funções separadas em vez de um objeto com tudo opcional.
    const fetchFalso = vi.fn(async () => respostaJson({ agendamentos: [] }));

    await clientAutenticado(fetchFalso).barbeiro.agendamentosDoIntervalo(
      "2026-09-01",
      "2026-09-30"
    );

    expect(urlEInit(fetchFalso).url).toBe(
      "https://api.exemplo.br/agendamentos?de=2026-09-01&ate=2026-09-30"
    );
  });

  it("muda o status de um agendamento", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        id: "a1",
        data: "2026-09-10",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "concluido",
        origem: "barbeiro",
        observacoes: null,
        servicos: [],
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: false,
        },
      })
    );

    const agendamento = await clientAutenticado(
      fetchFalso
    ).barbeiro.atualizarAgendamento("a1", { status: "concluido" });

    const { url, init } = urlEInit(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1");
    expect(init.method).toBe("PATCH");
    expect(agendamento.cliente.nome).toBe("João");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/api-client exec vitest run tests/barbeiro.test.ts`
Esperado: FAIL — `Cannot read properties of undefined (reading 'login')`.

- [ ] **Step 3: Implementar**

`packages/api-client/src/barbeiro.ts`:

```ts
import type {
  AgendamentoComCliente,
  BarbeariaSerializada,
  ClienteSerializado,
  AgendamentoSerializado,
  HorarioSerializado,
  NovoAgendamentoBarbeiroInput,
  PerfilBarbeiro,
  SessaoBarbeiro,
  ServicoSerializado,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

export interface CredenciaisDoBarbeiro {
  email: string;
  senha: string;
}

export interface NovaBarbearia {
  barbearia: { nome: string; slug: string };
  barbeiro: { nome: string; email: string; senha: string };
}

export interface EdicaoDoPerfil {
  nome?: string;
  telefone?: string | null;
}

export interface EdicaoDaBarbearia {
  nome?: string;
  telefone?: string | null;
  endereco?: string | null;
  logoUrl?: string | null;
}

export interface NovoServico {
  nome: string;
  duracaoMinutos: number;
  preco: string; // string, nunca number — ver ServicoSerializado
}

export interface EdicaoDoServico extends Partial<NovoServico> {
  ativo?: boolean;
}

export interface NovoCliente {
  nome: string;
  telefone: string;
  email?: string | null;
}

export type EdicaoDoCliente = Partial<NovoCliente>;

export interface EdicaoDoAgendamento {
  status?: "pendente" | "confirmado" | "concluido" | "cancelado" | "no_show";
  observacoes?: string | null;
}

export interface ClienteComHistorico extends ClienteSerializado {
  agendamentos: AgendamentoSerializado[];
}

export function criarApiBarbeiro(requisicao: Requisicao) {
  return {
    // Sem token: não existe sessão ainda.
    signup(nova: NovaBarbearia): Promise<SessaoBarbeiro> {
      return requisicao("/auth/signup", { metodo: "POST", corpo: nova });
    },

    login(credenciais: CredenciaisDoBarbeiro): Promise<SessaoBarbeiro> {
      return requisicao("/auth/login", { metodo: "POST", corpo: credenciais });
    },

    meuPerfil(): Promise<PerfilBarbeiro> {
      return requisicao("/me", { comToken: true });
    },

    atualizarMeuPerfil(edicao: EdicaoDoPerfil): Promise<PerfilBarbeiro> {
      return requisicao("/me", {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    atualizarMinhaBarbearia(
      edicao: EdicaoDaBarbearia
    ): Promise<BarbeariaSerializada> {
      return requisicao("/barbearias/me", {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    async horarios(): Promise<HorarioSerializado[]> {
      const resposta = await requisicao<{ horarios: HorarioSerializado[] }>(
        "/barbearias/me/horarios",
        { comToken: true }
      );
      return resposta.horarios;
    },

    // PUT com a semana inteira: dia ausente do corpo vira fechado na
    // API, de propósito — "sem linha" e "fechado" seriam estados
    // diferentes pro cálculo de disponibilidade.
    async salvarHorarios(
      horarios: HorarioSerializado[]
    ): Promise<HorarioSerializado[]> {
      const resposta = await requisicao<{ horarios: HorarioSerializado[] }>(
        "/barbearias/me/horarios",
        { metodo: "PUT", corpo: { horarios }, comToken: true }
      );
      return resposta.horarios;
    },

    // Inclui os inativos: é desta lista que sai a tela de Serviços,
    // onde o barbeiro reativa o que desativou.
    async servicos(): Promise<ServicoSerializado[]> {
      const resposta = await requisicao<{ servicos: ServicoSerializado[] }>(
        "/servicos",
        { comToken: true }
      );
      return resposta.servicos;
    },

    criarServico(novo: NovoServico): Promise<ServicoSerializado> {
      return requisicao("/servicos", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    atualizarServico(
      id: string,
      edicao: EdicaoDoServico
    ): Promise<ServicoSerializado> {
      return requisicao(`/servicos/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    // Soft delete na API: some da lista pública, continua na do
    // barbeiro, e o histórico de quem já foi atendido sobrevive.
    desativarServico(id: string): Promise<ServicoSerializado> {
      return requisicao(`/servicos/${id}`, {
        metodo: "DELETE",
        comToken: true,
      });
    },

    async clientes(busca?: string): Promise<ClienteSerializado[]> {
      const resposta = await requisicao<{ clientes: ClienteSerializado[] }>(
        "/clientes",
        { query: { busca }, comToken: true }
      );
      return resposta.clientes;
    },

    criarCliente(novo: NovoCliente): Promise<ClienteSerializado> {
      return requisicao("/clientes", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    cliente(id: string): Promise<ClienteComHistorico> {
      return requisicao(`/clientes/${id}`, { comToken: true });
    },

    atualizarCliente(
      id: string,
      edicao: EdicaoDoCliente
    ): Promise<ClienteSerializado> {
      return requisicao(`/clientes/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    // Duas funções e não uma com tudo opcional: a API responde 400 se
    // `data` vier junto de `de`/`ate`, e 400 se vier só metade do par.
    async agendamentosDoDia(data: string): Promise<AgendamentoComCliente[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoComCliente[];
      }>("/agendamentos", { query: { data }, comToken: true });
      return resposta.agendamentos;
    },

    async agendamentosDoIntervalo(
      de: string,
      ate: string
    ): Promise<AgendamentoComCliente[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoComCliente[];
      }>("/agendamentos", { query: { de, ate }, comToken: true });
      return resposta.agendamentos;
    },

    agendamento(id: string): Promise<AgendamentoComCliente> {
      return requisicao(`/agendamentos/${id}`, { comToken: true });
    },

    criarAgendamento(
      novo: NovoAgendamentoBarbeiroInput
    ): Promise<AgendamentoComCliente> {
      return requisicao("/agendamentos", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    atualizarAgendamento(
      id: string,
      edicao: EdicaoDoAgendamento
    ): Promise<AgendamentoComCliente> {
      return requisicao(`/agendamentos/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },
  };
}
```

Em `packages/api-client/src/index.ts`, importar e acrescentar à fábrica:

```ts
import { criarApiBarbeiro } from "./barbeiro";
// ...
  return {
    publico: criarApiPublica(requisicao),
    barbeiro: criarApiBarbeiro(requisicao),
  };
```

E reexportar os tipos do módulo:

```ts
export type {
  ClienteComHistorico,
  CredenciaisDoBarbeiro,
  EdicaoDaBarbearia,
  EdicaoDoAgendamento,
  EdicaoDoCliente,
  EdicaoDoPerfil,
  EdicaoDoServico,
  NovaBarbearia,
  NovoCliente,
  NovoServico,
} from "./barbeiro";
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: PASS — núcleo, públicas e as do barbeiro.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client
git commit -m "feat: add the barber routes to the api-client

The day and range listings are separate functions because the API
answers 400 when data arrives alongside de/ate, and 400 again when only
half the pair does - one options object would have made both mistakes
reachable from the screen."
```

---

### Task 6: `api-client` — as rotas do cliente logado

**Files:**
- Create: `packages/api-client/src/cliente.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/tests/cliente.test.ts`

**Interfaces:**
- Consumes: `Requisicao`, `criarApiClient`.
- Produces: `criarApiCliente(requisicao)` devolvendo `{ meuCadastro, atualizarMeuCadastro, meusAgendamentos, cancelar, remarcar }`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/api-client/tests/cliente.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { criarApiClient } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AGENDAMENTO = {
  id: "a1",
  data: "2026-09-10",
  horaInicio: "09:00",
  horaFim: "09:30",
  status: "confirmado",
  origem: "cliente",
  observacoes: null,
  servicos: [],
};

function clientDoCliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-cliente",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("api do cliente logado", () => {
  it("lê o próprio cadastro pelo token", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({
        cliente: {
          id: "c1",
          nome: "João",
          telefone: "(11) 99999-8888",
          email: null,
          temConta: true,
        },
      })
    );

    const cliente = await clientDoCliente(fetchFalso).cliente.meuCadastro();

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me"
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-do-cliente"
    );
    expect(cliente.nome).toBe("João");
  });

  it("filtra o histórico por intervalo quando a tela pede", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({ agendamentos: [AGENDAMENTO] })
    );

    const agendamentos = await clientDoCliente(
      fetchFalso
    ).cliente.meusAgendamentos({ de: "2026-09-01" });

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos?de=2026-09-01"
    );
    expect(agendamentos).toHaveLength(1);
  });

  it("cancela um agendamento futuro", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({ agendamento: { ...AGENDAMENTO, status: "cancelado" } })
    );

    const agendamento = await clientDoCliente(fetchFalso).cliente.cancelar("a1");

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos/a1/cancelar"
    );
    expect(init.method).toBe("POST");
    expect(agendamento.status).toBe("cancelado");
  });

  it("remarca herdando os serviços quando nenhum é mandado", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaJson({ agendamento: AGENDAMENTO }, 201)
    );

    await clientDoCliente(fetchFalso).cliente.remarcar("a1", {
      data: "2026-09-12",
      horaInicio: "10:00",
    });

    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/clientes/me/agendamentos/a1/remarcar"
    );
    // servicoIds ausente é o que faz a API herdar os do agendamento
    // antigo; mandar undefined explícito viraria 400 no schema.
    expect(init.body).toBe(
      JSON.stringify({ data: "2026-09-12", horaInicio: "10:00" })
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/api-client exec vitest run tests/cliente.test.ts`
Esperado: FAIL — `Cannot read properties of undefined (reading 'meuCadastro')`.

- [ ] **Step 3: Implementar**

`packages/api-client/src/cliente.ts`:

```ts
import type {
  AgendamentoSerializado,
  ClienteSerializado,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

export interface EdicaoDoMeuCadastro {
  nome?: string;
  // Telefone fica de fora de propósito: é a chave do login e do upsert
  // do agendamento público, e a API responde 400 se ele vier.
  email?: string | null;
}

export interface FiltroDoHistorico {
  de?: string; // "YYYY-MM-DD"
  ate?: string;
}

export interface Remarcacao {
  data: string;
  horaInicio: string;
  // Ausente = herda os serviços do agendamento antigo. É o caminho
  // normal; mandar a lista serve pra quando o serviço antigo foi
  // desativado.
  servicoIds?: string[];
}

export function criarApiCliente(requisicao: Requisicao) {
  return {
    async meuCadastro(): Promise<ClienteSerializado> {
      const resposta = await requisicao<{ cliente: ClienteSerializado }>(
        "/clientes/me",
        { comToken: true }
      );
      return resposta.cliente;
    },

    async atualizarMeuCadastro(
      edicao: EdicaoDoMeuCadastro
    ): Promise<ClienteSerializado> {
      const resposta = await requisicao<{ cliente: ClienteSerializado }>(
        "/clientes/me",
        { metodo: "PATCH", corpo: edicao, comToken: true }
      );
      return resposta.cliente;
    },

    async meusAgendamentos(
      filtro: FiltroDoHistorico = {}
    ): Promise<AgendamentoSerializado[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoSerializado[];
      }>("/clientes/me/agendamentos", { query: { ...filtro }, comToken: true });
      return resposta.agendamentos;
    },

    async cancelar(id: string): Promise<AgendamentoSerializado> {
      const resposta = await requisicao<{ agendamento: AgendamentoSerializado }>(
        `/clientes/me/agendamentos/${id}/cancelar`,
        { metodo: "POST", comToken: true }
      );
      return resposta.agendamento;
    },

    // Uma transação só na API: cancela o antigo e cria o novo, ou nada
    // acontece. A tela chama isto, nunca cancelar+agendar em sequência.
    async remarcar(
      id: string,
      remarcacao: Remarcacao
    ): Promise<AgendamentoSerializado> {
      const resposta = await requisicao<{ agendamento: AgendamentoSerializado }>(
        `/clientes/me/agendamentos/${id}/remarcar`,
        { metodo: "POST", corpo: remarcacao, comToken: true }
      );
      return resposta.agendamento;
    },
  };
}
```

Em `packages/api-client/src/index.ts`, acrescentar `cliente: criarApiCliente(requisicao)` à fábrica e reexportar `EdicaoDoMeuCadastro`, `FiltroDoHistorico` e `Remarcacao`.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: PASS — as quatro áreas verdes.

Rodar: `pnpm --filter @barchop/api-client type-check`
Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client
git commit -m "feat: add the logged-in client routes to the api-client

Rescheduling is one call because the API does it in one transaction:
cancel the old and create the new, or neither. A screen that cancelled
and then booked would leave the client with nothing whenever the second
call failed."
```

---

### Task 7: `criarApiClientFalso`

**Files:**
- Create: `packages/api-client/src/falso.ts`
- Modify: `packages/api-client/src/index.ts`
- Test: `packages/api-client/tests/falso.test.ts`

**Interfaces:**
- Consumes: `ApiClient` (Task 4), os tipos das Tasks 4-6.
- Produces: `criarApiClientFalso(estado?: EstadoFalso): ApiClient & { estado: EstadoFalso }`, com `EstadoFalso { perfil, servicos, horariosLivres, diasComVaga, agendamentos, cliente, sessao }`.

- [ ] **Step 1: Escrever o teste que falha**

`packages/api-client/tests/falso.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "../src/index";

describe("criarApiClientFalso", () => {
  it("devolve o perfil semeado, no formato do client real", async () => {
    const falso = criarApiClientFalso();

    const perfil = await falso.publico.perfilDaBarbearia("gr-barber");

    expect(perfil.slug).toBe("gr-barber");
    // O fluxo público inteiro precisa deste id — é a razão de a fase 6
    // existir.
    expect(perfil.barbeiros).toHaveLength(1);
  });

  it("aceita estado semeado pelo teste da tela", async () => {
    const falso = criarApiClientFalso({
      horariosLivres: ["09:00", "14:30"],
    });

    const horarios = await falso.publico.disponibilidadeDoDia("gr-barber", {
      barbeiroId: "bb1",
      data: "2026-09-10",
      servicoIds: ["s1"],
    });

    expect(horarios).toEqual(["09:00", "14:30"]);
  });

  it("guarda o que foi agendado, pra tela seguinte enxergar", async () => {
    const falso = criarApiClientFalso();

    const agendamento = await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "09:00",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });

    expect(falso.estado.agendamentos).toContainEqual(agendamento);
  });

  it("lança ErroDaApi, e não Error cru, quando o slug não existe", async () => {
    // Se o falso lançasse outra coisa, o teste de tela que trata erro
    // passaria contra o dublê e quebraria contra a API real.
    const falso = criarApiClientFalso();

    await expect(
      falso.publico.perfilDaBarbearia("nao-existe")
    ).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("responde horario_ocupado quando o horário já foi tomado", async () => {
    const falso = criarApiClientFalso({ horariosLivres: ["09:00"] });
    const agendar = () =>
      falso.publico.agendar("gr-barber", {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data: "2026-09-10",
        horaInicio: "09:00",
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      });

    await agendar();

    try {
      await agendar();
      expect.unreachable("o segundo agendamento deveria ter sido recusado");
    } catch (erro) {
      expect((erro as ErroDaApi).codigo).toBe("horario_ocupado");
      expect((erro as ErroDaApi).status).toBe(409);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/api-client exec vitest run tests/falso.test.ts`
Esperado: FAIL — `criarApiClientFalso is not exported`.

- [ ] **Step 3: Implementar o dublê**

`packages/api-client/src/falso.ts`:

```ts
import type {
  AgendamentoComCliente,
  AgendamentoSerializado,
  ClienteSerializado,
  NovoAgendamentoBarbeiroInput,
  NovoAgendamentoPublicoInput,
  PerfilPublicoBarbearia,
  ServicoSerializado,
} from "@barchop/types";
import { ErroDaApi } from "./erro";
import type { CredenciaisDoCliente, NovaContaDeCliente } from "./publico";
import type { NovoServico } from "./barbeiro";

export interface EstadoFalso {
  perfil: PerfilPublicoBarbearia;
  servicos: ServicoSerializado[];
  horariosLivres: string[];
  diasComVaga: Record<string, boolean>;
  agendamentos: AgendamentoSerializado[];
  cliente: ClienteSerializado;
}

const PERFIL_PADRAO: PerfilPublicoBarbearia = {
  id: "b1",
  nome: "GR Barber",
  slug: "gr-barber",
  telefone: "(11) 3333-4444",
  endereco: "Rua das Tesouras, 123",
  logoUrl: null,
  horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAbertura: diaSemana === 0 ? null : "09:00",
    horaFechamento: diaSemana === 0 ? null : "18:00",
    fechado: diaSemana === 0,
  })),
  barbeiros: [{ id: "bb1", nome: "Rafael" }],
};

const CLIENTE_PADRAO: ClienteSerializado = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-8888",
  email: null,
  temConta: true,
};

const SERVICOS_PADRAO: ServicoSerializado[] = [
  { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true },
  { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true },
];

// Dublê com estado em memória. Existe pra teste de tela rodar sem rede
// e sem Postgres; o que ele NÃO faz é provar que a API real responde
// assim — os tipos compartilhados pegam divergência de forma, não de
// comportamento.
export function criarApiClientFalso(semente: Partial<EstadoFalso> = {}) {
  // Cópia de toda lista, tanto do padrão quanto da semente: o dublê faz
  // `push` em `agendamentos` e em `servicos`, e sem a cópia dois testes
  // do mesmo arquivo veriam o estado um do outro — o padrão é um só
  // objeto de módulo, e a semente costuma ser reaproveitada.
  const estado: EstadoFalso = {
    perfil: semente.perfil ?? PERFIL_PADRAO,
    servicos: [...(semente.servicos ?? SERVICOS_PADRAO)],
    horariosLivres: [...(semente.horariosLivres ?? ["09:00", "09:30", "10:00"])],
    diasComVaga: { ...(semente.diasComVaga ?? {}) },
    agendamentos: [...(semente.agendamentos ?? [])],
    cliente: semente.cliente ?? CLIENTE_PADRAO,
  };

  function exigirSlug(slug: string): void {
    // Mesmo 404 que o findUniqueOrThrow da API produz.
    if (slug !== estado.perfil.slug) {
      throw new ErroDaApi(404, "nao_encontrado", "barbearia não encontrada");
    }
  }

  function duracaoDe(servicoIds: string[]): number {
    return servicoIds.reduce((total, id) => {
      const servico = estado.servicos.find((s) => s.id === id);
      return total + (servico?.duracaoMinutos ?? 0);
    }, 0);
  }

  function somarMinutos(hora: string, minutos: number): string {
    const [h, m] = hora.split(":").map(Number);
    const total = h * 60 + m + minutos;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
      total % 60
    ).padStart(2, "0")}`;
  }

  function novoAgendamento(entrada: {
    data: string;
    horaInicio: string;
    servicoIds: string[];
    origem: string;
    observacoes?: string;
  }): AgendamentoSerializado {
    // A trava do banco não deixa dois ativos no mesmo horário; o dublê
    // reproduz isso porque a tela precisa saber tratar horario_ocupado
    // mesmo tendo acabado de ver o horário como livre.
    //
    // Sem o barbeiroId na comparação: a trava real é por barbeiro, e
    // esta é por data e hora. Com um barbeiro por barbearia, que é o
    // MVP, dá no mesmo; com dois, o dublê recusa o que a API aceitaria.
    // Registrado nas dívidas da spec.
    const conflito = estado.agendamentos.some(
      (a) =>
        a.data === entrada.data &&
        a.horaInicio === entrada.horaInicio &&
        a.status !== "cancelado"
    );
    if (conflito) {
      throw new ErroDaApi(409, "horario_ocupado", "esse horário já está ocupado");
    }

    const agendamento: AgendamentoSerializado = {
      id: `a${estado.agendamentos.length + 1}`,
      data: entrada.data,
      horaInicio: entrada.horaInicio,
      horaFim: somarMinutos(entrada.horaInicio, duracaoDe(entrada.servicoIds)),
      status: "pendente",
      origem: entrada.origem,
      observacoes: entrada.observacoes ?? null,
      servicos: entrada.servicoIds.map((servicoId) => {
        const servico = estado.servicos.find((s) => s.id === servicoId);
        return {
          servicoId,
          nome: servico?.nome ?? "Serviço",
          precoNoMomento: servico?.preco ?? "0.00",
          duracaoNoMomento: servico?.duracaoMinutos ?? 0,
        };
      }),
    };

    estado.agendamentos.push(agendamento);
    return agendamento;
  }

  function comCliente(
    agendamento: AgendamentoSerializado
  ): AgendamentoComCliente {
    return { ...agendamento, cliente: estado.cliente };
  }

  return {
    estado,

    publico: {
      async perfilDaBarbearia(slug: string) {
        exigirSlug(slug);
        return estado.perfil;
      },
      async servicos(slug: string) {
        exigirSlug(slug);
        return estado.servicos.filter((servico) => servico.ativo);
      },
      async disponibilidadeDoDia(slug: string) {
        exigirSlug(slug);
        return estado.horariosLivres;
      },
      async disponibilidadeDoMes(slug: string) {
        exigirSlug(slug);
        return estado.diasComVaga;
      },
      // Os tipos vêm dos mesmos que o client real usa, e não de um
      // subconjunto escrito à mão: com um subconjunto, o objeto literal
      // do teste com `cliente` dentro viraria erro de propriedade
      // excedente, e afrouxar o tipo esconderia divergência de verdade.
      async agendar(slug: string, novo: NovoAgendamentoPublicoInput) {
        exigirSlug(slug);
        return novoAgendamento({ ...novo, origem: "cliente" });
      },
      async signupCliente(slug: string, conta: NovaContaDeCliente) {
        exigirSlug(slug);
        estado.cliente = { ...estado.cliente, nome: conta.nome, temConta: true };
        return { token: "jwt-falso-cliente", cliente: estado.cliente };
      },
      async loginCliente(slug: string, _credenciais: CredenciaisDoCliente) {
        exigirSlug(slug);
        return { token: "jwt-falso-cliente", cliente: estado.cliente };
      },
    },

    barbeiro: {
      async signup() {
        return {
          token: "jwt-falso-barbeiro",
          barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
          barbearia: {
            id: estado.perfil.id,
            nome: estado.perfil.nome,
            slug: estado.perfil.slug,
          },
        };
      },
      async login() {
        return {
          token: "jwt-falso-barbeiro",
          barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
          barbearia: {
            id: estado.perfil.id,
            nome: estado.perfil.nome,
            slug: estado.perfil.slug,
          },
        };
      },
      async meuPerfil() {
        return {
          id: "bb1",
          nome: "Rafael",
          email: "rafael@gr.com",
          telefone: null,
          barbeariaId: estado.perfil.id,
        };
      },
      async atualizarMeuPerfil(edicao: { nome?: string }) {
        return {
          id: "bb1",
          nome: edicao.nome ?? "Rafael",
          email: "rafael@gr.com",
          telefone: null,
          barbeariaId: estado.perfil.id,
        };
      },
      async atualizarMinhaBarbearia(edicao: { nome?: string }) {
        estado.perfil = { ...estado.perfil, ...edicao };
        return estado.perfil;
      },
      async horarios() {
        return estado.perfil.horarios;
      },
      async salvarHorarios(horarios: EstadoFalso["perfil"]["horarios"]) {
        estado.perfil = { ...estado.perfil, horarios };
        return horarios;
      },
      async servicos() {
        return estado.servicos;
      },
      async criarServico(novo: NovoServico) {
        const servico = {
          id: `s${estado.servicos.length + 1}`,
          ...novo,
          ativo: true,
        };
        estado.servicos.push(servico);
        return servico;
      },
      async atualizarServico(id: string, edicao: Partial<ServicoSerializado>) {
        const indice = estado.servicos.findIndex((s) => s.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "serviço não encontrado");
        }
        estado.servicos[indice] = { ...estado.servicos[indice], ...edicao };
        return estado.servicos[indice];
      },
      async desativarServico(id: string) {
        return this.atualizarServico(id, { ativo: false });
      },
      async clientes() {
        return [estado.cliente];
      },
      async criarCliente(novo: { nome: string; telefone: string }) {
        estado.cliente = { ...estado.cliente, ...novo };
        return estado.cliente;
      },
      async cliente(id: string) {
        if (id !== estado.cliente.id) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        return { ...estado.cliente, agendamentos: estado.agendamentos };
      },
      async atualizarCliente(id: string, edicao: Partial<ClienteSerializado>) {
        estado.cliente = { ...estado.cliente, ...edicao };
        return estado.cliente;
      },
      async agendamentosDoDia(data: string) {
        return estado.agendamentos
          .filter((a) => a.data === data)
          .map(comCliente);
      },
      async agendamentosDoIntervalo(de: string, ate: string) {
        return estado.agendamentos
          .filter((a) => a.data >= de && a.data <= ate)
          .map(comCliente);
      },
      async agendamento(id: string) {
        const achado = estado.agendamentos.find((a) => a.id === id);
        if (!achado) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        return comCliente(achado);
      },
      async criarAgendamento(novo: NovoAgendamentoBarbeiroInput) {
        return comCliente(novoAgendamento({ ...novo, origem: "barbeiro" }));
      },
      async atualizarAgendamento(
        id: string,
        edicao: { status?: string; observacoes?: string | null }
      ) {
        const indice = estado.agendamentos.findIndex((a) => a.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        estado.agendamentos[indice] = {
          ...estado.agendamentos[indice],
          ...edicao,
        };
        return comCliente(estado.agendamentos[indice]);
      },
    },

    cliente: {
      async meuCadastro() {
        return estado.cliente;
      },
      async atualizarMeuCadastro(edicao: Partial<ClienteSerializado>) {
        estado.cliente = { ...estado.cliente, ...edicao };
        return estado.cliente;
      },
      async meusAgendamentos() {
        return estado.agendamentos;
      },
      async cancelar(id: string) {
        const indice = estado.agendamentos.findIndex((a) => a.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        estado.agendamentos[indice] = {
          ...estado.agendamentos[indice],
          status: "cancelado",
        };
        return estado.agendamentos[indice];
      },
      async remarcar(
        id: string,
        remarcacao: { data: string; horaInicio: string; servicoIds?: string[] }
      ) {
        const antigo = estado.agendamentos.find((a) => a.id === id);
        if (!antigo) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        // Cancela antes de criar, na mesma ordem da transação da API —
        // é o que permite remarcar pra um horário que sobrepõe o
        // próprio agendamento.
        await this.cancelar(id);
        return novoAgendamento({
          data: remarcacao.data,
          horaInicio: remarcacao.horaInicio,
          servicoIds:
            remarcacao.servicoIds ?? antigo.servicos.map((s) => s.servicoId),
          origem: "cliente",
        });
      },
    },
  };
}
```

Em `packages/api-client/src/index.ts`, acrescentar:

```ts
export { criarApiClientFalso } from "./falso";
export type { EstadoFalso } from "./falso";
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/api-client test`
Esperado: PASS — o pacote inteiro, dublê incluído.

Rodar: `pnpm --filter @barchop/api-client type-check`
Esperado: sem erro. Duas correções previsíveis, e o que **não** fazer em cada uma:

- Se o TypeScript reclamar que o falso não é atribuível a `ApiClient`, ajuste a assinatura do falso — nunca afrouxe o tipo do client real.
- Se der erro de `this` em `desativarServico` (que chama `this.atualizarServico`) ou em `remarcar` (que chama `this.cancelar`), extraia os dois ajudantes como funções locais acima do objeto devolvido, ao lado do `novoAgendamento`. Não troque o tipo por `any` nem anote `this` à mão.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client
git commit -m "feat: add an in-memory fake of the api-client

Screen tests need a double that fails the way the real thing fails: it
throws ErroDaApi, answers 404 for an unknown slug, and refuses a second
booking on a taken slot with horario_ocupado - the one error a correct
screen still meets, because the database lock catches the race after
availability already said yes."
```

---

### Task 8: tokens ampliados e a fonte Clash Grotesk

**Files:**
- Modify: `packages/design-tokens/src/index.ts`, `apps/web/app/tokens-css.ts`, `docs/design-system.html`
- Create: `apps/web/app/fontes/ClashGrotesk-Bold.woff2`, `apps/web/app/fontes/ClashGrotesk-Semibold.woff2`, `apps/web/app/fontes/LICENCA-CLASH-GROTESK.txt`, `apps/web/app/fontes/index.ts`
- Test: `packages/design-tokens` não tem suíte; a verificação é o type-check e a página `/primitivos` da Task 10.

**Interfaces:**
- Consumes: nada.
- Produces: `spacing`, `borderWidth`, `fontSize` exportados de `@barchop/design-tokens`; `clashGrotesk` e `inter` exportados de `apps/web/app/fontes/index.ts` como objetos de `next/font`.

- [ ] **Step 1: Copiar os arquivos de fonte e a licença**

```bash
mkdir -p apps/web/app/fontes
cp "/c/Users/gufal/Downloads/ClashGrotesk_Complete/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Bold.woff2" apps/web/app/fontes/
cp "/c/Users/gufal/Downloads/ClashGrotesk_Complete/ClashGrotesk_Complete/Fonts/WEB/fonts/ClashGrotesk-Semibold.woff2" apps/web/app/fontes/
cp "/c/Users/gufal/Downloads/ClashGrotesk_Complete/ClashGrotesk_Complete/License/FFL.txt" apps/web/app/fontes/LICENCA-CLASH-GROTESK.txt
```

Só estes dois pesos: são os que o token de display usa (700) e o único vizinho que o design system pede em título menor (600). O `.gitignore` não cobre `.woff2` — confira com `git status` que os três arquivos aparecem.

- [ ] **Step 2: Ampliar os tokens**

Acrescentar em `packages/design-tokens/src/index.ts`, depois de `radius`:

```ts
// Escala de espaçamento em múltiplos de 4, que é o que o design system
// usa em todas as telas. Sem token, cada tela repetiria o número solto.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// 2px é a borda da assinatura neobrutalista; 1px fica pras divisórias
// internas de lista, que com 2px virariam grade.
export const borderWidth = {
  hairline: 1,
  padrao: 2,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  display: 40,
} as const;
```

- [ ] **Step 3: Levar os tokens novos pro CSS**

Em `apps/web/app/tokens-css.ts`, importar `borderWidth, fontSize, spacing` junto de `colors, radius` e acrescentar, no mesmo formato do `varsDeRaio`:

```ts
const varsDeEspaco = Object.entries(spacing)
  .map(([nome, valor]) => `  --espaco-${nome}: ${valor}px;`)
  .join("\n");

const varsDeBorda = Object.entries(borderWidth)
  .map(([nome, valor]) => `  --borda-${nome}: ${valor}px;`)
  .join("\n");

const varsDeTexto = Object.entries(fontSize)
  .map(([nome, valor]) => `  --texto-${nome}: ${valor}px;`)
  .join("\n");
```

E incluir as três no bloco `:root` do `cssDeTokens`, logo depois de `${varsDeRaio}`.

- [ ] **Step 4: Declarar as fontes**

Antes de escrever, confirme a API em `node_modules/next/dist/docs/` — `AGENTS.md` avisa que este Next difere do que você aprendeu.

`apps/web/app/fontes/index.ts`:

```ts
import localFont from "next/font/local";
import { Inter } from "next/font/google";

// Clash Grotesk é self-hosted: a licença Indie do Fontshare permite, e
// o arquivo em app/fontes é o que o next/font empacota. Ver
// LICENCA-CLASH-GROTESK.txt ao lado.
export const clashGrotesk = localFont({
  src: [
    { path: "./ClashGrotesk-Semibold.woff2", weight: "600", style: "normal" },
    { path: "./ClashGrotesk-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-display",
  display: "swap",
});

// Inter vem pelo next/font/google, que baixa no build e serve do
// próprio domínio — nenhuma requisição do visitante vai pro Google.
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--fonte-corpo",
  display: "swap",
});
```

- [ ] **Step 5: Corrigir a divergência no design system**

Em `docs/design-system.html`, na seção de tipografia (por volta da linha 166), trocar `Space Grotesk 700 · títulos, números, botões` por `Clash Grotesk 700 · títulos, números, botões`. Rodar `grep -n "Space Grotesk" docs/design-system.html` e trocar toda ocorrência — inclusive dentro de `font-family` no CSS embutido.

- [ ] **Step 6: Verificar**

Rodar: `pnpm --filter @barchop/web type-check`
Esperado: sem erro.

Rodar: `grep -rn "Space Grotesk" docs/ packages/ apps/`
Esperado: nenhuma saída.

- [ ] **Step 7: Commit**

```bash
git add packages/design-tokens apps/web docs/design-system.html
git commit -m "feat: add spacing, border and text tokens, and install Clash Grotesk

The design system uses a 4-based spacing scale and a 2px border on all
23 screens; without tokens each screen would repeat the bare number.
Clash Grotesk settles the font divergence in the design system's favour
of the tokens file, and ships self-hosted with its licence alongside."
```

---

### Task 9: setup de teste do `apps/web` (e o script que não derruba o mobile)

**Files:**
- Create: `apps/web/vitest.config.mts`, `apps/web/tests/setup.ts`
- Modify: `apps/web/package.json`, `apps/mobile/package.json`
- Test: `apps/web/tests/fumaça.test.tsx` (prova que o setup funciona; some na Task 10)

**Interfaces:**
- Consumes: nada.
- Produces: `pnpm --filter @barchop/web test` rodando Testing Library com jsdom; `turbo run test` verde no monorepo inteiro.

- [ ] **Step 1: Instalar as dependências de teste**

```bash
pnpm --filter @barchop/web add -D vitest@^4.1.11 @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Configurar o Vitest**

`apps/web/vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Os pacotes internos publicam TypeScript cru (main aponta pro
    // src/index.ts). Sem isto o Vitest os trataria como JS pronto.
    server: { deps: { inline: [/@barchop\//] } },
  },
});
```

`apps/web/tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Escrever o teste de fumaça**

`apps/web/tests/fumaca.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { colors } from "@barchop/design-tokens";

// Existe só pra provar que o setup renderiza JSX, enxerga os pacotes
// internos e tem os matchers do jest-dom. Sai na Task 10, quando os
// primitivos trouxerem testes de verdade.
describe("setup de teste do web", () => {
  it("renderiza JSX e enxerga os pacotes do monorepo", async () => {
    const falso = criarApiClientFalso();
    const perfil = await falso.publico.perfilDaBarbearia("gr-barber");

    render(<h1 style={{ color: colors.light.ink }}>{perfil.nome}</h1>);

    expect(screen.getByRole("heading")).toHaveTextContent("GR Barber");
  });
});
```

- [ ] **Step 4: Acrescentar os scripts**

Em `apps/web/package.json`, dentro de `scripts`:

```json
"test": "vitest run",
```

**Sem script `lint`.** `next lint` foi removido no Next 16 — confirmado
em `node_modules/next/dist/cli/`, que tem `next-build`, `next-dev`,
`next-start` e nenhum `next-lint`. O `apps/api` também não tem `lint`, e
o `turbo run lint` simplesmente pula pacote sem o script. Montar ESLint
aqui é escopo próprio, não desta fase.

Acrescentar `"@barchop/api-client": "workspace:*"` e `"@barchop/formato": "workspace:*"` em `dependencies`.

Em `apps/mobile/package.json`, dentro de `scripts`:

```json
"test": "vitest run --passWithNoTests",
```

O mobile não ganha Testing Library nem transform de RN: escrever setup pra uma suíte vazia é escopo do sub-projeto D. O script existe só pra o `turbo run test` da raiz não falhar por script ausente.

Rodar: `pnpm install`

- [ ] **Step 5: Rodar**

Rodar: `pnpm --filter @barchop/web test`
Esperado: PASS — o teste de fumaça.

Rodar: `pnpm test` (na raiz)
Esperado: PASS em `@barchop/api`, `@barchop/api-client`, `@barchop/formato`, `@barchop/scheduling`, `@barchop/web`; `@barchop/mobile` passa sem testes.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/mobile
git commit -m "test: set up Vitest and Testing Library on the web app

turbo run test at the root has been running against apps with no test
script since the scaffold. The mobile app gets passWithNoTests rather
than a React Native harness with nothing to run - that setup belongs to
the sub-project that writes the first RN screen."
```

---

### Task 10: primitivos do web, route groups e a saída da tela provisória

**Files:**
- Create: `apps/web/src/componentes/Botao.tsx` + `Botao.module.css`, `Campo.tsx` + `Campo.module.css`, `Cartao.tsx` + `Cartao.module.css`, `Chip.tsx` + `Chip.module.css`
- Create: `apps/web/app/(painel)/layout.tsx`, `apps/web/app/(publico)/layout.tsx`, `apps/web/app/primitivos/page.tsx`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`
- Delete: `apps/web/app/page.tsx` (tela provisória), `apps/web/tests/fumaca.test.tsx`
- Test: `apps/web/tests/componentes/botao.test.tsx`, `apps/web/tests/componentes/campo.test.tsx`

**Interfaces:**
- Consumes: tokens da Task 8, fontes da Task 8, `formatarTelefoneParcial` da Task 1.
- Produces: `<Botao variante="primario" | "fantasma" | "contorno">`, `<Campo rotulo formato?="telefone">`, `<Cartao>`, `<Chip tom="acento" | "neutro">`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/web/tests/componentes/botao.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Botao } from "../../src/componentes/Botao";

describe("Botao", () => {
  it("é um button acessível pelo texto", () => {
    render(<Botao>Confirmar agendamento</Botao>);
    expect(
      screen.getByRole("button", { name: "Confirmar agendamento" })
    ).toBeInTheDocument();
  });

  it("chama o onClick", async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Salvar</Botao>);

    await userEvent.click(screen.getByRole("button"));

    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("não dispara quando está carregando", async () => {
    // A tela de confirmação chama uma rota que cria agendamento; dois
    // cliques seriam duas tentativas, e a segunda voltaria
    // horario_ocupado por culpa da primeira.
    const aoClicar = vi.fn();
    render(
      <Botao onClick={aoClicar} carregando>
        Confirmar
      </Botao>
    );

    const botao = screen.getByRole("button");
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });
});
```

`apps/web/tests/componentes/campo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Campo } from "../../src/componentes/Campo";

describe("Campo", () => {
  it("associa o rótulo ao input", () => {
    render(<Campo rotulo="Nome" />);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("formata telefone enquanto se digita", async () => {
    // A API guarda "(11) 99999-8888" e recusa qualquer outra forma com
    // 400. Formatar no campo é o que impede o erro de chegar lá.
    render(<Campo rotulo="Telefone" formato="telefone" />);

    const input = screen.getByLabelText("Telefone");
    await userEvent.type(input, "11999998888");

    expect(input).toHaveValue("(11) 99999-8888");
  });

  it("mostra o erro e marca o input como inválido", () => {
    render(<Campo rotulo="Telefone" erro="informe o DDD" />);

    const input = screen.getByLabelText("Telefone");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("informe o DDD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/web test`
Esperado: FAIL — `Failed to resolve import "../../src/componentes/Botao"`.

- [ ] **Step 3: Escrever os primitivos**

`apps/web/src/componentes/Botao.module.css`:

```css
.botao {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--espaco-sm);
  padding: var(--espaco-sm) var(--espaco-lg);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-md);
  font-family: var(--fonte-display), system-ui, sans-serif;
  font-size: var(--texto-md);
  font-weight: 700;
  cursor: pointer;
  /* Sombra offset, sem desfoque: a assinatura neobrutalista do design
     system. O translate no :active faz o botão "afundar" nela. */
  box-shadow: 0 4px 0 var(--cor-ink);
  transition: transform 80ms ease, box-shadow 80ms ease;
}

.botao:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 0 0 var(--cor-ink);
}

.botao:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primario {
  background: var(--cor-accent);
  color: var(--cor-dark);
}

.fantasma {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--cor-ink);
}

.contorno {
  background: var(--cor-surface);
  color: var(--cor-ink);
}
```

`apps/web/src/componentes/Botao.tsx`:

```tsx
"use client";

import type { ButtonHTMLAttributes } from "react";
import estilos from "./Botao.module.css";

type Variante = "primario" | "fantasma" | "contorno";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  carregando?: boolean;
}

export function Botao({
  variante = "primario",
  carregando = false,
  disabled,
  children,
  ...resto
}: Props) {
  return (
    <button
      // `disabled` e não só um estilo: a tela de confirmação cria
      // agendamento, e o segundo clique voltaria horario_ocupado por
      // culpa do primeiro.
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`${estilos.botao} ${estilos[variante]}`}
      {...resto}
    >
      {children}
    </button>
  );
}
```

`apps/web/src/componentes/Campo.module.css`:

```css
.campo {
  display: flex;
  flex-direction: column;
  gap: var(--espaco-xs);
}

.rotulo {
  font-size: var(--texto-sm);
  font-weight: 600;
  color: var(--cor-inkSoft);
}

.entrada {
  padding: var(--espaco-sm) var(--espaco-md);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-sm);
  background: var(--cor-surface);
  color: var(--cor-ink);
  font-family: var(--fonte-corpo), system-ui, sans-serif;
  font-size: var(--texto-md);
}

.entrada[aria-invalid="true"] {
  border-color: #b3261e;
}

.erro {
  font-size: var(--texto-xs);
  color: #b3261e;
}
```

`apps/web/src/componentes/Campo.tsx`:

```tsx
"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { formatarTelefoneParcial } from "@barchop/formato";
import estilos from "./Campo.module.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  rotulo: string;
  erro?: string;
  formato?: "telefone";
  onChange?: (valor: string) => void;
}

export function Campo({ rotulo, erro, formato, onChange, ...resto }: Props) {
  const id = useId();
  const [valor, setValor] = useState("");

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className={estilos.entrada}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        value={valor}
        onChange={(evento) => {
          // A API guarda um formato só e recusa os outros com 400.
          // Formatar aqui é o que evita o erro no envio; a validação
          // que lança continua sendo o normalizarTelefone.
          const proximo =
            formato === "telefone"
              ? formatarTelefoneParcial(evento.target.value)
              : evento.target.value;
          setValor(proximo);
          onChange?.(proximo);
        }}
        {...resto}
      />
      {erro ? (
        <span className={estilos.erro} id={`${id}-erro`}>
          {erro}
        </span>
      ) : null}
    </div>
  );
}
```

`apps/web/src/componentes/Cartao.tsx` e `Cartao.module.css`:

```tsx
import type { ReactNode } from "react";
import estilos from "./Cartao.module.css";

export function Cartao({ children }: { children: ReactNode }) {
  return <div className={estilos.cartao}>{children}</div>;
}
```

```css
.cartao {
  padding: var(--espaco-md);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-lg);
  background: var(--cor-surface);
  box-shadow: 0 4px 0 var(--cor-ink);
}
```

`apps/web/src/componentes/Chip.tsx` e `Chip.module.css`:

```tsx
import type { ReactNode } from "react";
import estilos from "./Chip.module.css";

export function Chip({
  children,
  tom = "acento",
}: {
  children: ReactNode;
  tom?: "acento" | "neutro";
}) {
  return <span className={`${estilos.chip} ${estilos[tom]}`}>{children}</span>;
}
```

```css
.chip {
  display: inline-block;
  padding: var(--espaco-xs) var(--espaco-md);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-pill);
  font-size: var(--texto-sm);
  font-weight: 600;
}

.acento {
  background: var(--cor-accent);
  color: var(--cor-dark);
}

.neutro {
  background: var(--cor-paperSoft);
  color: var(--cor-inkSoft);
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/web test`
Esperado: PASS — os três do Botao e os três do Campo, mais o de fumaça, que ainda existe.

- [ ] **Step 5: Montar os route groups, a vitrine e a saída da tela provisória**

Confirme a forma dos route groups em `node_modules/next/dist/docs/` antes de escrever.

`apps/web/app/(publico)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

// O fluxo do cliente é sempre claro, mesmo com o sistema em escuro: é
// uma página que chega por link de WhatsApp pra quem não conhece o
// produto. Ver docs/design-system.html.
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
```

`apps/web/app/(painel)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

// O painel acompanha o tema do sistema — o design system tem as seis
// telas nos dois modos. A troca manual entra junto do painel, no
// sub-projeto C.
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
```

`apps/web/app/primitivos/page.tsx`:

```tsx
import { Botao } from "../../src/componentes/Botao";
import { Campo } from "../../src/componentes/Campo";
import { Cartao } from "../../src/componentes/Cartao";
import { Chip } from "../../src/componentes/Chip";

// Vitrine dos primitivos. Existe porque esta fase não entrega tela
// nenhuma e, sem ela, não haveria como ver o resultado rodando. Sai
// quando o painel chegar, no sub-projeto C.
export default function Primitivos() {
  return (
    <main style={{ display: "grid", gap: 24, padding: 24, maxWidth: 480 }}>
      <h1>Primitivos</h1>

      <Cartao>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Botao>Confirmar agendamento</Botao>
          <Botao variante="contorno">Cancelar</Botao>
          <Botao variante="fantasma">Ver detalhes</Botao>
          <Botao carregando>Enviando…</Botao>
        </div>
      </Cartao>

      <Cartao>
        <Campo rotulo="Nome" placeholder="João Silva" />
        <Campo rotulo="Telefone" formato="telefone" />
        <Campo rotulo="Telefone sem DDD" erro="informe o DDD" />
      </Cartao>

      <Cartao>
        <Chip>09:00</Chip> <Chip tom="neutro">concluído</Chip>
      </Cartao>
    </main>
  );
}
```

Reescrever `apps/web/app/layout.tsx` pra aplicar as fontes:

```tsx
import type { Metadata } from "next";

import { clashGrotesk, inter } from "./fontes";
import { cssDeTokens } from "./tokens-css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BarChop",
  description: "Agenda de barbearia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${clashGrotesk.variable} ${inter.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssDeTokens }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

Encolher `apps/web/app/globals.css` pra reset, corpo e fonte — as regras `.chip`, `.grade` e `.subtitulo` saem com a tela provisória:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--cor-paper);
  color: var(--cor-ink);
  font-family: var(--fonte-corpo), Inter, system-ui, -apple-system, sans-serif;
  font-size: var(--texto-md);
}

h1,
h2,
h3 {
  margin: 0;
  font-family: var(--fonte-display), system-ui, sans-serif;
  letter-spacing: -0.02em;
}
```

Apagar `apps/web/app/page.tsx` e `apps/web/tests/fumaca.test.tsx`.

- [ ] **Step 6: Verificar rodando**

Rodar: `pnpm --filter @barchop/web test`
Esperado: PASS — Botao e Campo; o de fumaça saiu.

Rodar: `pnpm --filter @barchop/web build`
Esperado: build sem erro, com as rotas `/primitivos` listadas.

Rodar: `pnpm --filter @barchop/web dev` e abrir `http://localhost:3000/primitivos`
Esperado: os quatro primitivos desenhados com borda de 2px, sombra offset e a Clash Grotesk nos títulos e botões.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the web primitives, the route groups and drop the placeholder screen

The primitives page exists because this phase ships no screen: without
it there would be nothing to look at running. The button disables while
loading rather than only looking disabled - the confirmation screen
creates an appointment, and the second click would come back as
horario_ocupado caused by the first."
```

---

### Task 11: sessão do web e a fábrica do client no app

**Files:**
- Create: `apps/web/src/sessao/armazenamento.ts`, `apps/web/src/sessao/cliente-da-api.ts`, `apps/web/.env.local.example`
- Test: `apps/web/tests/sessao/armazenamento.test.ts`, `apps/web/tests/sessao/cliente-da-api.test.ts`

**Interfaces:**
- Consumes: `criarApiClient`, `ErroDaApi` (Tasks 3-6).
- Produces: `sessaoDoBarbeiro` e `sessaoDoCliente(slug)`, ambos com `{ ler(): string | null; gravar(token: string): void; limpar(): void }`; `apiDoBarbeiro()` e `apiDoCliente(slug)`, cada um devolvendo um `ApiClient` já ligado ao armazenamento certo.

- [ ] **Step 1: Escrever os testes que falham**

`apps/web/tests/sessao/armazenamento.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { sessaoDoBarbeiro, sessaoDoCliente } from "../../src/sessao/armazenamento";

describe("armazenamento de sessão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("guarda e lê o token do barbeiro", () => {
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    expect(sessaoDoBarbeiro.ler()).toBe("jwt-barbeiro");
  });

  it("guarda o token do cliente por barbearia", () => {
    // O login do cliente é POST /barbearias/:slug/auth/cliente/login —
    // o token vale numa barbearia só, e uma chave única faria o token
    // de uma vazar pro fluxo de outra.
    sessaoDoCliente("gr-barber").gravar("jwt-gr");
    sessaoDoCliente("outra").gravar("jwt-outra");

    expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-gr");
    expect(sessaoDoCliente("outra").ler()).toBe("jwt-outra");
  });

  it("nunca mistura a identidade do barbeiro com a do cliente", () => {
    // Os dois escopos da API recusam o token um do outro; guardar na
    // mesma chave faria a primeira tela que misturasse as duas receber
    // 401 sem explicação.
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    expect(sessaoDoCliente("gr-barber").ler()).toBeNull();
  });

  it("limpa o token", () => {
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    sessaoDoBarbeiro.limpar();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });
});
```

`apps/web/tests/sessao/cliente-da-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDoBarbeiro } from "../../src/sessao/cliente-da-api";
import { sessaoDoBarbeiro } from "../../src/sessao/armazenamento";

describe("api do barbeiro ligada à sessão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("limpa o token guardado quando a API responde 401", async () => {
    // Token de 7 dias com hook que consulta o banco a cada requisição:
    // 401 no meio da sessão é evento normal, e a tela precisa voltar
    // pro login com o armazenamento já limpo.
    sessaoDoBarbeiro.gravar("jwt-vencido");

    const fetchFalso = vi.fn(
      async () =>
        new Response(JSON.stringify({ erro: "nao_autenticado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );

    const api = apiDoBarbeiro(fetchFalso as unknown as typeof globalThis.fetch);

    await expect(api.meuPerfil()).rejects.toThrow();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `pnpm --filter @barchop/web test`
Esperado: FAIL — `Failed to resolve import "../../src/sessao/armazenamento"`.

- [ ] **Step 3: Implementar**

`apps/web/src/sessao/armazenamento.ts`:

```ts
// Duas identidades, dois tokens. Os escopos da API recusam o token um
// do outro (autenticar rejeita payload de cliente e vice-versa), então
// guardar na mesma chave faria a primeira tela que misturasse as duas
// receber 401 sem explicação.
//
// localStorage é legível por XSS. A alternativa — cookie httpOnly posto
// por route handler do Next — obrigaria a proxiar a API inteira, e está
// registrada como dívida na spec desta fase.
export interface Sessao {
  ler(): string | null;
  gravar(token: string): void;
  limpar(): void;
}

function sessaoNaChave(chave: string): Sessao {
  return {
    ler() {
      // No servidor não existe localStorage, e o layout do painel roda
      // lá antes de hidratar.
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(chave);
    },
    gravar(token: string) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(chave, token);
    },
    limpar() {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(chave);
    },
  };
}

export const sessaoDoBarbeiro = sessaoNaChave("sessao.barbeiro");

// Por barbearia, porque o login do cliente é por barbearia: o token que
// vale em /barbearias/gr-barber não vale na de ninguém mais.
export function sessaoDoCliente(slug: string): Sessao {
  return sessaoNaChave(`sessao.cliente.${slug}`);
}
```

`apps/web/src/sessao/cliente-da-api.ts`:

```ts
import { criarApiClient } from "@barchop/api-client";
import { sessaoDoBarbeiro, sessaoDoCliente } from "./armazenamento";

// A URL da API muda por ambiente e é lida no cliente, então precisa do
// prefixo NEXT_PUBLIC_. O padrão é o dev local descrito no README da
// API.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export function apiDoBarbeiro(fetchInjetado?: typeof globalThis.fetch) {
  return criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessaoDoBarbeiro.ler(),
    // Limpar aqui, e não em cada tela: o 401 chega de qualquer chamada,
    // e uma tela que esquecesse deixaria um token morto no navegador.
    aoExpirarSessao: () => sessaoDoBarbeiro.limpar(),
    fetch: fetchInjetado,
  }).barbeiro;
}

// Devolve o client inteiro, e não só `.cliente` como o de cima: o fluxo
// público usa `publico` antes de existir conta, e a mesma tela precisa
// de `cliente` depois do login. Separar em duas fábricas obrigaria a
// tela a saber de qual delas pedir cada chamada.
export function apiDoCliente(
  slug: string,
  fetchInjetado?: typeof globalThis.fetch
) {
  const sessao = sessaoDoCliente(slug);

  return criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessao.ler(),
    aoExpirarSessao: () => sessao.limpar(),
    fetch: fetchInjetado,
  });
}
```

`apps/web/.env.local.example`:

```
# URL da API. O prefixo NEXT_PUBLIC_ é obrigatório: quem lê é o
# navegador, não o servidor do Next.
NEXT_PUBLIC_API_URL=http://localhost:3333
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `pnpm --filter @barchop/web test`
Esperado: PASS — componentes e sessão.

- [ ] **Step 5: Rodar tudo e fechar a fase**

Rodar: `pnpm test` (raiz)
Esperado: PASS em todos os pacotes; mobile passa sem testes.

Rodar: `pnpm type-check` (raiz)
Esperado: sem erro em nenhum pacote.

Rodar: `pnpm build` (raiz)
Esperado: API e web constroem.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: wire the web session storage into the api-client

Two tokens under separate keys, and the client's one keyed by slug,
because the API scopes a client login to a single barbershop and the two
auth scopes reject each other's tokens. The 401 hook clears storage
centrally so no screen can forget and leave a dead token behind."
```

---

## Como verificar a fase inteira

1. `pnpm test` na raiz — verde nos pacotes e no `apps/web`; `apps/mobile` passa sem testes.
2. `pnpm type-check` na raiz — sem erro, com os DTOs morando em `@barchop/types` e a API importando de lá.
3. `pnpm --filter @barchop/api test` — a API continua verde depois de perder a normalização; os testes de rota não mudaram uma linha.
4. `pnpm --filter @barchop/web dev` e abrir `/primitivos` — os quatro primitivos com a Clash Grotesk, borda de 2px e sombra offset, em claro e escuro.
5. `grep -rn "Space Grotesk" docs/ packages/ apps/` — sem saída.
