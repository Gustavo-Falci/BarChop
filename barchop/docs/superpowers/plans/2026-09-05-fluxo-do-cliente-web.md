# Fluxo do cliente na web — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as oito telas do fluxo do cliente sob `/[slug]` — perfil, os quatro passos de agendar, confirmação, entrar e minha conta — em cima da fundação que já está na `main`.

**Architecture:** Cada passo é uma rota, e o que foi escolhido viaja na query string; nome e telefone ficam em `sessionStorage`. Toda tela é client component e fala com a API pelo `api-client`, entregue por um provider no layout de `[slug]` — o mesmo provider recebe `criarApiClientFalso()` em teste. Cada `page.tsx` é server component e existe só para pôr a tela dentro de um `<Suspense>`, que o Next 16 exige de quem lê `useSearchParams`.

**Tech Stack:** Next 16 (App Router, React 19.2.3), CSS Modules, Vitest 4 + Testing Library, `@barchop/api-client`, `@barchop/formato`, `@barchop/design-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-05-fluxo-do-cliente-web-design.md`

## Global Constraints

- **Idioma do código:** identificadores, comentários e mensagens em português. Comentário explica o **porquê**, nunca o quê — é o padrão do repositório inteiro.
- **Telefone:** um formato só, `(11) 99999-8888`, com DDD. Formatar com `formatarTelefoneParcial` enquanto digita; qualquer outra forma volta 400 da API.
- **Erros:** ramificar em `ErroDaApi.codigo`, nunca no status solto. Códigos existentes: `nao_autenticado`, `nao_encontrado`, `conflito`, `horario_ocupado`, `regra_de_negocio`, `requisicao_invalida`, `erro_interno`.
- **O passado é responsabilidade destas telas.** O calendário desabilita dias anteriores a hoje; a lista de horários, quando a data é hoje, descarta os que já passaram. A API não sabe que dia é hoje e o `garantirFuturo` não existe.
- **Datas são `"YYYY-MM-DD"` e horas `"HH:mm"`**, strings, do jeito que a API fala. Toda formatação para exibição usa `timeZone: "UTC"` — `new Date("2026-09-09")` é meia-noite UTC, e formatar isso no fuso de São Paulo mostraria dia 8.
- **Nada de fake timers.** O instante entra por parâmetro (`agora`), com `new Date()` como padrão, exatamente como o `agoraNaBarbearia` da API. Além de a spec pedir, `@testing-library/user-event` usa timers por dentro e trava sob `vi.useFakeTimers()` sem configuração extra — e os testes de data e de horário clicam.
- **`useSearchParams` exige `<Suspense>` acima** em rota pré-renderizada (Next 16). Toda `page.tsx` deste plano é um server component que só envolve a tela.
- **Nenhuma tela importa `apiDoCliente` direto** — sempre pelo provider, senão o teste precisa de rede.
- **Versões fixadas:** `next` `^16.3.3`, `react` `19.2.3`, `vitest` `^4.1.11`. Não subir nenhuma.
- **`apps/web/AGENTS.md`** manda ler `node_modules/next/dist/docs/` antes de escrever código de Next. Já foram conferidos: `useSearchParams` (e a regra do Suspense), `useParams`, `useRouter`, e `params` como `Promise` em server components.
- Comandos rodam de `C:\Users\gufal\OneDrive\Documentos\GitHub\BarChop\barchop`.

---

## Estrutura de arquivos

**Rotas** (`apps/web/app/(publico)/[slug]/`): `layout.tsx` monta o provider; `page.tsx`, `agendar/page.tsx`, `agendar/data/page.tsx`, `agendar/horario/page.tsx`, `agendar/dados/page.tsx`, `agendar/confirmar/page.tsx`, `entrar/page.tsx`, `minha-conta/page.tsx` — cada um com três linhas: importa a tela e a envolve em `<Suspense>`.

**Telas** (`apps/web/src/telas/`): `PerfilDaBarbearia`, `EscolhaDeServicos`, `EscolhaDaData`, `EscolhaDoHorario`, `DadosDoCliente`, `Confirmacao`, `Entrar`, `MinhaConta`. Todas `"use client"`.

**Infra do fluxo** (`apps/web/src/`): `api/ProvedorDaApi.tsx` e `api/useRequisicao.ts`; `fluxo/passos.ts` (a query), `fluxo/usePassoDoFluxo.ts` (validação e redirecionamento), `fluxo/dadosDoCliente.ts` (`sessionStorage`); `formato/datas.ts`.

**Componentes** (`apps/web/src/componentes/`): `Calendario`, `ListaDeHorarios`, `ItemDeServico`, `Resumo`, `Aviso` — cada um com seu `.module.css`, ao lado dos quatro que já existem.

---

### Task 1: provider da API, `useRequisicao` e o dublê de navegação

**Files:**
- Create: `apps/web/src/api/ProvedorDaApi.tsx`, `apps/web/src/api/useRequisicao.ts`, `apps/web/app/(publico)/[slug]/layout.tsx`, `apps/web/tests/ajudantes/navegacao.ts`
- Modify: `apps/web/tests/setup.ts`
- Test: `apps/web/tests/api/useRequisicao.test.tsx`

**Interfaces:**
- Consumes: `criarApiClientFalso`, `ApiClient`, `ErroDaApi` de `@barchop/api-client`; `apiDoCliente` de `src/sessao/cliente-da-api`.
- Produces: `<ProvedorDaApi valor?={ApiDoFluxo}>`, `useApi(): ApiDoFluxo`, `useRequisicao<T>(chamada: () => Promise<T>, deps: unknown[]): { dados: T | null; carregando: boolean; erro: ErroDaApi | null; recarregar: () => void }`, e o ajudante de teste `navegacaoFalsa` (com `slug`, `query`, `push`, `replace`, `redefinir`).

- [ ] **Step 1: Dublê de navegação, com estado que o teste controla**

`apps/web/tests/ajudantes/navegacao.ts`:

```ts
import { vi } from "vitest";

// As telas leem a URL pelos hooks do Next, que não existem fora do
// roteador. Este módulo guarda o estado que o mock devolve, e o
// setup.ts é quem faz o vi.mock — o mock precisa ser içado pro topo do
// módulo, e um helper importado não seria içado junto.
export const navegacaoFalsa = {
  slug: "gr-barber",
  query: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  redefinir(entrada: { slug?: string; query?: Record<string, string> } = {}) {
    this.slug = entrada.slug ?? "gr-barber";
    this.query = new URLSearchParams(entrada.query ?? {});
    this.push.mockClear();
    this.replace.mockClear();
  },
};
```

- [ ] **Step 2: Ligar o mock no setup**

Acrescentar ao fim de `apps/web/tests/setup.ts`:

```ts
import { vi } from "vitest";
import { navegacaoFalsa } from "./ajudantes/navegacao";

// next/navigation só funciona dentro do roteador do Next. O mock vive
// aqui, e não em cada arquivo de teste, porque o vi.mock é içado pro
// topo do módulo em que aparece.
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: navegacaoFalsa.slug }),
  useSearchParams: () => navegacaoFalsa.query,
  useRouter: () => ({
    push: navegacaoFalsa.push,
    replace: navegacaoFalsa.replace,
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));
```

- [ ] **Step 3: Escrever o teste que falha**

`apps/web/tests/api/useRequisicao.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { useApi } from "../../src/api/ProvedorDaApi";
import { useRequisicao } from "../../src/api/useRequisicao";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function TelaDeProva() {
  const api = useApi();
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.publico.perfilDaBarbearia("gr-barber"),
    []
  );

  if (carregando) return <p>carregando</p>;
  if (erro) return <p>erro: {erro.codigo}</p>;
  return (
    <div>
      <h1>{dados?.nome}</h1>
      <button onClick={recarregar}>recarregar</button>
    </div>
  );
}

describe("useRequisicao", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("mostra carregando e depois os dados", async () => {
    render(
      <ProvedorDaApi valor={criarApiClientFalso()}>
        <TelaDeProva />
      </ProvedorDaApi>
    );

    expect(screen.getByText("carregando")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent("GR Barber")
    );
  });

  it("entrega o ErroDaApi pra tela decidir pelo código", async () => {
    const falso = criarApiClientFalso();
    function TelaQueFalha() {
      const api = useApi();
      const { erro } = useRequisicao(
        () => api.publico.perfilDaBarbearia("nao-existe"),
        []
      );
      return <p>{erro ? `erro: ${erro.codigo}` : "sem erro"}</p>;
    }

    render(
      <ProvedorDaApi valor={falso}>
        <TelaQueFalha />
      </ProvedorDaApi>
    );

    await waitFor(() =>
      expect(screen.getByText("erro: nao_encontrado")).toBeInTheDocument()
    );
  });

  it("recarregar refaz a chamada", async () => {
    const falso = criarApiClientFalso();
    render(
      <ProvedorDaApi valor={falso}>
        <TelaDeProva />
      </ProvedorDaApi>
    );

    await waitFor(() => screen.getByRole("heading"));
    falso.estado.perfil = { ...falso.estado.perfil, nome: "Outro nome" };
    await userEvent.click(screen.getByRole("button", { name: "recarregar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent("Outro nome")
    );
  });

  it("erro que não é da API não vira erro de código", async () => {
    // Rede caída, bug de tela: precisa aparecer como falha, não como
    // "carregando" pra sempre.
    function TelaQueQuebra() {
      const { erro, carregando } = useRequisicao(() => {
        throw new Error("boom");
      }, []);
      return <p>{carregando ? "carregando" : `erro: ${erro?.codigo}`}</p>;
    }

    render(
      <ProvedorDaApi valor={criarApiClientFalso()}>
        <TelaQueQuebra />
      </ProvedorDaApi>
    );

    await waitFor(() =>
      expect(screen.getByText("erro: erro_interno")).toBeInTheDocument()
    );
    expect(ErroDaApi).toBeDefined();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/api/useRequisicao.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/api/ProvedorDaApi"`.

- [ ] **Step 5: Implementar o provider**

`apps/web/src/api/ProvedorDaApi.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { apiDoCliente } from "../sessao/cliente-da-api";

// O que as telas do fluxo enxergam: as rotas públicas e as do cliente
// logado. `apiDoCliente` devolve o client inteiro justamente porque a
// mesma tela pode precisar das duas — pública antes de existir conta,
// do cliente depois do login.
export type ApiDoFluxo = ReturnType<typeof apiDoCliente>;

const Contexto = createContext<ApiDoFluxo | null>(null);

// `valor` existe pro teste passar o dublê. Em produção ninguém o
// informa, e o provider monta o client de verdade a partir do slug da
// rota — uma vez só, senão cada render criaria outro.
export function ProvedorDaApi({
  children,
  valor,
}: {
  children: ReactNode;
  valor?: ApiDoFluxo;
}) {
  const params = useParams<{ slug: string }>();
  const api = useMemo(
    () => valor ?? apiDoCliente(params.slug),
    [valor, params.slug]
  );

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useApi(): ApiDoFluxo {
  const api = useContext(Contexto);
  if (!api) {
    throw new Error("useApi precisa estar dentro de um ProvedorDaApi");
  }
  return api;
}
```

- [ ] **Step 6: Implementar o `useRequisicao`**

`apps/web/src/api/useRequisicao.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { ErroDaApi } from "@barchop/api-client";

export interface Requisicao<T> {
  dados: T | null;
  carregando: boolean;
  erro: ErroDaApi | null;
  recarregar: () => void;
}

// Cinco telas repetiriam este trio de useState. O `deps` é o mesmo
// contrato do useEffect: mudou o dia escolhido, refaz a chamada.
export function useRequisicao<T>(
  chamada: () => Promise<T>,
  deps: unknown[]
): Requisicao<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroDaApi | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);

    // Promise.resolve envolve a chamada porque ela pode lançar de forma
    // síncrona — e aí o .catch abaixo nunca veria o erro.
    Promise.resolve()
      .then(chamada)
      .then((resposta) => {
        if (vivo) setDados(resposta);
      })
      .catch((causa: unknown) => {
        if (!vivo) return;
        // Rede caída e bug de tela não têm `codigo`; viram erro_interno
        // pra tela ter sempre um código pra ramificar.
        setErro(
          causa instanceof ErroDaApi
            ? causa
            : new ErroDaApi(0, "erro_interno", "não foi possível carregar")
        );
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    // A tela pode desmontar no meio (o cliente tocou em voltar): sem
    // esta trava, o setState cairia num componente que já saiu.
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tentativa]);

  return { dados, carregando, erro, recarregar };
}
```

- [ ] **Step 7: Montar o layout de `[slug]`**

`apps/web/app/(publico)/[slug]/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { ProvedorDaApi } from "../../../src/api/ProvedorDaApi";

// Server component: quem lê o slug é o provider, do lado do cliente,
// com useParams. Assim o `params` (que aqui seria uma Promise) não
// precisa ser aguardado só pra ser repassado.
export default function LayoutDaBarbearia({
  children,
}: {
  children: ReactNode;
}) {
  return <ProvedorDaApi>{children}</ProvedorDaApi>;
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os quatro casos do `useRequisicao` mais os seis que já existiam.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat: add the api provider and the request hook the screens share

The provider is what lets a screen test run with the in-memory fake and
no network: production passes nothing and it builds the real client from
the slug, tests hand it the double. Errors that are not ErroDaApi become
erro_interno so a screen always has a code to branch on rather than a
loading state that never ends."
```

---

### Task 2: a query do fluxo, o guarda de passo e os dados em `sessionStorage`

**Files:**
- Create: `apps/web/src/fluxo/passos.ts`, `apps/web/src/fluxo/usePassoDoFluxo.ts`, `apps/web/src/fluxo/dadosDoCliente.ts`, `apps/web/src/formato/datas.ts`
- Test: `apps/web/tests/fluxo/passos.test.ts`, `apps/web/tests/fluxo/dadosDoCliente.test.ts`, `apps/web/tests/formato/datas.test.ts`

**Interfaces:**
- Consumes: `navegacaoFalsa` (Task 1).
- Produces: `lerEscolhas(query: URLSearchParams): Escolhas` com `Escolhas = { servicoIds: string[]; data?: string; hora?: string; remarcar?: string }`; `montarQuery(escolhas: Escolhas): string`; `caminhoDoPasso(slug: string, passo: Passo, escolhas: Escolhas): string` com `Passo = "servicos" | "data" | "horario" | "dados" | "confirmar"`; `usePassoDoFluxo(passo: Passo): Escolhas & { slug: string; pronto: boolean }`; `lerDadosDoCliente()`, `gravarDadosDoCliente(dados)`, `limparDadosDoCliente()` com `DadosDoCliente = { nome: string; telefone: string }`; e de `formato/datas`: `hojeIso(agora?: Date)`, `ehPassado(data: string, agora?: Date)`, `formatarDataLonga(data: string)`, `horaJaPassou(data: string, hora: string, agora?: Date)`, `diasDoMes(mes: string)`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/web/tests/formato/datas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  diasDoMes,
  ehPassado,
  formatarDataLonga,
  hojeIso,
  horaJaPassou,
} from "../../src/formato/datas";

// O instante entra por parâmetro, como o agoraNaBarbearia da API faz.
// Nada de fake timers: o user-event usa timers por dentro, e as telas
// que dependem destas funções clicam.
const TARDE = new Date("2026-09-09T14:00:00-03:00");

describe("datas do fluxo", () => {
  it("formata sem deslocar o dia pelo fuso", () => {
    // new Date("2026-09-09") é meia-noite UTC; formatar no fuso de São
    // Paulo mostraria 8 de setembro. É o bug clássico deste projeto,
    // onde toda data trafega como "YYYY-MM-DD".
    expect(formatarDataLonga("2026-09-09")).toBe("9 de setembro");
  });

  it("diz qual é o dia de hoje no formato da API", () => {
    expect(hojeIso(TARDE)).toBe("2026-09-09");
  });

  it("reconhece dia passado, e hoje não é passado", () => {
    expect(ehPassado("2026-09-08", TARDE)).toBe(true);
    expect(ehPassado("2026-09-09", TARDE)).toBe(false);
    expect(ehPassado("2026-09-10", TARDE)).toBe(false);
  });

  it("descarta hora que já passou, mas só no dia de hoje", () => {
    expect(horaJaPassou("2026-09-09", "09:00", TARDE)).toBe(true);
    expect(horaJaPassou("2026-09-09", "14:00", TARDE)).toBe(true);
    expect(horaJaPassou("2026-09-09", "14:30", TARDE)).toBe(false);
    // Amanhã às 9 não passou, por mais tarde que seja hoje.
    expect(horaJaPassou("2026-09-10", "09:00", TARDE)).toBe(false);
  });

  it("monta o mês com os vazios do começo da semana", () => {
    // Setembro de 2026 começa numa terça: duas casas vazias antes,
    // porque a semana do calendário começa no domingo, como o design.
    const dias = diasDoMes("2026-09");
    expect(dias.slice(0, 3)).toEqual([null, null, "2026-09-01"]);
    expect(dias.at(-1)).toBe("2026-09-30");
  });
});
```

`apps/web/tests/fluxo/passos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { caminhoDoPasso, lerEscolhas, montarQuery } from "../../src/fluxo/passos";

describe("escolhas na query", () => {
  it("lê a lista de serviços separada por vírgula", () => {
    const escolhas = lerEscolhas(
      new URLSearchParams({ servicos: "s1,s2", data: "2026-09-09" })
    );
    expect(escolhas.servicoIds).toEqual(["s1", "s2"]);
    expect(escolhas.data).toBe("2026-09-09");
    expect(escolhas.hora).toBeUndefined();
  });

  it("devolve lista vazia quando não há serviço nenhum", () => {
    expect(lerEscolhas(new URLSearchParams()).servicoIds).toEqual([]);
  });

  it("ignora vírgula solta em vez de produzir id vazio", () => {
    // Um id vazio viraria ?servicoIds= na chamada e a API responderia
    // 400 por causa do pattern de uuid.
    expect(lerEscolhas(new URLSearchParams({ servicos: "s1,," })).servicoIds).toEqual(
      ["s1"]
    );
  });

  it("monta a query de volta na mesma ordem", () => {
    expect(
      montarQuery({ servicoIds: ["s1", "s2"], data: "2026-09-09", hora: "09:30" })
    ).toBe("?servicos=s1%2Cs2&data=2026-09-09&hora=09%3A30");
  });

  it("carrega o remarcar quando ele existe", () => {
    const escolhas = lerEscolhas(new URLSearchParams({ remarcar: "a1" }));
    expect(escolhas.remarcar).toBe("a1");
    expect(montarQuery(escolhas)).toBe("?remarcar=a1");
  });

  it("monta o caminho de cada passo com o que já foi escolhido", () => {
    const escolhas = { servicoIds: ["s1"], data: "2026-09-09" };
    expect(caminhoDoPasso("gr-barber", "horario", escolhas)).toBe(
      "/gr-barber/agendar/horario?servicos=s1&data=2026-09-09"
    );
    expect(caminhoDoPasso("gr-barber", "servicos", escolhas)).toBe(
      "/gr-barber/agendar?servicos=s1&data=2026-09-09"
    );
  });
});
```

`apps/web/tests/fluxo/dadosDoCliente.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  gravarDadosDoCliente,
  lerDadosDoCliente,
  limparDadosDoCliente,
} from "../../src/fluxo/dadosDoCliente";

describe("dados do cliente no sessionStorage", () => {
  beforeEach(() => sessionStorage.clear());

  it("guarda e lê nome e telefone", () => {
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    expect(lerDadosDoCliente()).toEqual({
      nome: "João",
      telefone: "(11) 99999-8888",
    });
  });

  it("devolve null quando não há nada guardado", () => {
    expect(lerDadosDoCliente()).toBeNull();
  });

  it("sobrevive a conteúdo corrompido em vez de estourar", () => {
    // Outra aba, extensão, versão antiga: o valor pode não ser o JSON
    // que esta versão grava, e a tela de confirmação não pode quebrar
    // por isso — ela trata como "não tem dados" e volta um passo.
    sessionStorage.setItem("agendamento.cliente", "{ nao é json");
    expect(lerDadosDoCliente()).toBeNull();
  });

  it("limpa depois que o agendamento é criado", () => {
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    limparDadosDoCliente();
    expect(lerDadosDoCliente()).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web test`
Expected: FAIL — três suítes não resolvem os imports de `src/fluxo` e `src/formato`.

- [ ] **Step 3: Implementar `formato/datas.ts`**

```ts
// Toda data trafega como "YYYY-MM-DD" e toda hora como "HH:mm", que é
// como a API fala. As duas comparam bem como string — zero à esquerda
// põe a ordem lexicográfica na mesma ordem do calendário e do relógio.

const FORMATADOR_LONGO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  // UTC, e não o fuso do aparelho: `new Date("2026-09-09")` é
  // meia-noite UTC, e em São Paulo isso ainda é dia 8.
  timeZone: "UTC",
});

export function formatarDataLonga(data: string): string {
  return FORMATADOR_LONGO.format(new Date(`${data}T00:00:00Z`));
}

// O instante entra por parâmetro, com `new Date()` como padrão — mesma
// forma do agoraNaBarbearia da API, e o que permite testar sem fake
// timers. O relógio é o do aparelho do cliente, não o da barbearia:
// limitação registrada na spec.
export function hojeIso(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function ehPassado(data: string, agora: Date = new Date()): boolean {
  return data < hojeIso(agora);
}

// Hora só "já passou" no dia de hoje: amanhã às 9 continua valendo por
// mais tarde que seja agora.
export function horaJaPassou(
  data: string,
  hora: string,
  agora: Date = new Date()
): boolean {
  if (data !== hojeIso(agora)) return false;
  const atual = `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes()
  ).padStart(2, "0")}`;
  return hora <= atual;
}

// A grade do calendário começa no domingo, como no design system. Os
// `null` são as casas vazias antes do dia 1.
export function diasDoMes(mes: string): (string | null)[] {
  const [ano, numero] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, numero - 1, 1));
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();

  const vazios: null[] = Array(primeiro.getUTCDay()).fill(null);
  const dias = Array.from({ length: ultimo }, (_, indice) => {
    const dia = String(indice + 1).padStart(2, "0");
    return `${mes}-${dia}`;
  });

  return [...vazios, ...dias];
}
```

- [ ] **Step 4: Implementar `fluxo/passos.ts`**

```ts
export interface Escolhas {
  servicoIds: string[];
  data?: string;
  hora?: string;
  // Quando presente, o fluxo está remarcando um agendamento existente
  // em vez de criar um novo.
  remarcar?: string;
}

export type Passo = "servicos" | "data" | "horario" | "dados" | "confirmar";

const CAMINHO_DO_PASSO: Record<Passo, string> = {
  servicos: "/agendar",
  data: "/agendar/data",
  horario: "/agendar/horario",
  dados: "/agendar/dados",
  confirmar: "/agendar/confirmar",
};

export function lerEscolhas(query: URLSearchParams): Escolhas {
  return {
    // O filter tira id vazio de uma vírgula solta: vazio viraria
    // ?servicoIds= na chamada, e o pattern de uuid da API responderia
    // 400.
    servicoIds: (query.get("servicos") ?? "")
      .split(",")
      .filter((id) => id.length > 0),
    data: query.get("data") ?? undefined,
    hora: query.get("hora") ?? undefined,
    remarcar: query.get("remarcar") ?? undefined,
  };
}

export function montarQuery(escolhas: Escolhas): string {
  const params = new URLSearchParams();
  if (escolhas.servicoIds.length > 0) {
    params.set("servicos", escolhas.servicoIds.join(","));
  }
  if (escolhas.data) params.set("data", escolhas.data);
  if (escolhas.hora) params.set("hora", escolhas.hora);
  if (escolhas.remarcar) params.set("remarcar", escolhas.remarcar);

  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function caminhoDoPasso(
  slug: string,
  passo: Passo,
  escolhas: Escolhas
): string {
  return `/${slug}${CAMINHO_DO_PASSO[passo]}${montarQuery(escolhas)}`;
}
```

- [ ] **Step 5: Implementar `fluxo/dadosDoCliente.ts`**

```ts
export interface DadosDoCliente {
  nome: string;
  telefone: string;
}

// Fora da URL de propósito: URL entra em histórico, print e cabeçalho
// de referência. sessionStorage sobrevive a recarregar e morre com a
// aba, e é apagado assim que o agendamento é criado.
const CHAVE = "agendamento.cliente";

export function lerDadosDoCliente(): DadosDoCliente | null {
  if (typeof window === "undefined") return null;

  const bruto = window.sessionStorage.getItem(CHAVE);
  if (!bruto) return null;

  // Conteúdo corrompido é possível — outra aba, extensão, versão antiga
  // do formato. Tratar como ausente faz a tela de confirmação voltar um
  // passo em vez de quebrar.
  try {
    const dados = JSON.parse(bruto) as Partial<DadosDoCliente>;
    if (!dados?.nome || !dados?.telefone) return null;
    return { nome: dados.nome, telefone: dados.telefone };
  } catch {
    return null;
  }
}

export function gravarDadosDoCliente(dados: DadosDoCliente): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHAVE, JSON.stringify(dados));
}

export function limparDadosDoCliente(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHAVE);
}
```

- [ ] **Step 6: Implementar `fluxo/usePassoDoFluxo.ts`**

```ts
"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { caminhoDoPasso, lerEscolhas, type Escolhas, type Passo } from "./passos";

// O que cada passo exige de quem veio antes, e pra onde manda quando
// falta. Sem isso, abrir /agendar/horario de um link velho renderizaria
// uma tela sem data, chamando a API com undefined.
const EXIGE: Record<Passo, { falta: (e: Escolhas) => boolean; volta: Passo }> = {
  servicos: { falta: () => false, volta: "servicos" },
  data: { falta: (e) => e.servicoIds.length === 0, volta: "servicos" },
  horario: { falta: (e) => !e.data, volta: "data" },
  dados: { falta: (e) => !e.hora, volta: "horario" },
  confirmar: { falta: (e) => !e.hora, volta: "horario" },
};

// `pronto` é falso enquanto o redirecionamento não aconteceu: a tela
// não deve chamar a API nem desenhar com dado faltando.
export function usePassoDoFluxo(
  passo: Passo
): Escolhas & { slug: string; pronto: boolean } {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();

  const escolhas = lerEscolhas(query);
  const regra = EXIGE[passo];
  const falta = regra.falta(escolhas);

  useEffect(() => {
    if (!falta) return;
    // `replace` e não `push`: o passo incompleto não merece uma entrada
    // no histórico, senão voltar cairia nele de novo.
    router.replace(caminhoDoPasso(slug, regra.volta, escolhas));
  }, [falta, slug, regra.volta, router, escolhas]);

  return { ...escolhas, slug, pronto: !falta };
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — as três suítes novas verdes junto das anteriores.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: add the flow query, the step guard and the client data store

Every step declares what the one before it had to leave behind and where
to send the visitor when it is missing, so an old link opens the step
that is missing instead of calling the API with undefined. Dates format
in UTC because they travel as YYYY-MM-DD strings, and formatting midnight
UTC in São Paulo would show the day before."
```

---

### Task 3: perfil da barbearia (`/[slug]`)

**Files:**
- Create: `apps/web/src/telas/PerfilDaBarbearia.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/page.tsx`
- Test: `apps/web/tests/telas/perfil.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `useRequisicao` (Task 1); `caminhoDoPasso` (Task 2).
- Produces: `<PerfilDaBarbearia />` — a primeira tela do link do WhatsApp, e a única que lê `barbeiros` do perfil.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/perfil.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../src/telas/PerfilDaBarbearia";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <PerfilDaBarbearia />
    </ProvedorDaApi>
  );
  return falso;
}

describe("perfil da barbearia", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("mostra nome e endereço da barbearia", async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent("GR Barber")
    );
    expect(screen.getByText("Rua das Tesouras, 123")).toBeInTheDocument();
  });

  it("leva pro primeiro passo do agendamento", async () => {
    montar();
    await waitFor(() => screen.getByRole("heading"));

    await userEvent.click(screen.getByRole("button", { name: /agendar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/agendar");
  });

  it("dá tela própria pra barbearia que não existe", async () => {
    // Link errado no WhatsApp, slug renomeado: precisa ser uma tela, não
    // um erro cru.
    navegacaoFalsa.redefinir({ slug: "nao-existe" });
    montar();

    await waitFor(() =>
      expect(screen.getByText(/não encontramos essa barbearia/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/perfil.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/telas/PerfilDaBarbearia"`.

- [ ] **Step 3: Implementar a tela**

`apps/web/src/telas/PerfilDaBarbearia.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-lg); padding: var(--espaco-lg); max-width: 480px; }
.faixa { height: 120px; border: var(--borda-padrao) solid var(--cor-ink); border-radius: var(--raio-lg); background: var(--cor-accent); }
.endereco { color: var(--cor-muted); font-size: var(--texto-sm); }
```

`apps/web/src/telas/PerfilDaBarbearia.tsx`:

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { caminhoDoPasso } from "../fluxo/passos";
import estilos from "./PerfilDaBarbearia.module.css";

export function PerfilDaBarbearia() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();
  const { dados, carregando, erro } = useRequisicao(
    () => api.publico.perfilDaBarbearia(slug),
    [slug]
  );

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // 404 é o caso comum aqui, não excepcional: o link circula por
  // WhatsApp e o slug pode ter mudado.
  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>
          {erro.codigo === "nao_encontrado"
            ? "Não encontramos essa barbearia"
            : "Não foi possível abrir esta página"}
        </h1>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <div className={estilos.faixa} />
      <div>
        <h1>{dados?.nome}</h1>
        {dados?.endereco ? (
          <p className={estilos.endereco}>{dados.endereco}</p>
        ) : null}
      </div>
      <Botao
        onClick={() =>
          router.push(caminhoDoPasso(slug, "servicos", { servicoIds: [] }))
        }
      >
        Agendar agora
      </Botao>
    </main>
  );
}
```

- [ ] **Step 4: Criar a rota**

`apps/web/app/(publico)/[slug]/page.tsx`:

```tsx
import { PerfilDaBarbearia } from "../../../src/telas/PerfilDaBarbearia";

// Sem Suspense: esta é a única tela do fluxo que não lê a query.
export default function Pagina() {
  return <PerfilDaBarbearia />;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os três casos do perfil verdes.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add the barbershop profile screen

The link travels by WhatsApp and slugs can change, so a 404 here is
ordinary traffic rather than an exception - it gets a screen of its own
instead of a raw error."
```

---

### Task 4: escolha dos serviços (`/[slug]/agendar`)

**Files:**
- Create: `apps/web/src/componentes/ItemDeServico.tsx` + `.module.css`, `apps/web/src/componentes/Resumo.tsx` + `.module.css`, `apps/web/src/telas/EscolhaDeServicos.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/agendar/page.tsx`
- Test: `apps/web/tests/telas/escolha-de-servicos.test.tsx`

**Interfaces:**
- Consumes: `usePassoDoFluxo`, `caminhoDoPasso` (Task 2); `useApi`, `useRequisicao` (Task 1).
- Produces: `<ItemDeServico servico marcado aoAlternar>`, `formatarPreco(preco: string): string`, `<Resumo itens={string[]}>`, `<EscolhaDeServicos />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/escolha-de-servicos.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDeServicos } from "../../src/telas/EscolhaDeServicos";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar() {
  render(
    <ProvedorDaApi valor={criarApiClientFalso()}>
      <EscolhaDeServicos />
    </ProvedorDaApi>
  );
}

describe("escolha dos serviços", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("lista os serviços ativos com preço", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
  });

  it("soma duração e preço do que foi marcado", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Barba/ }));

    // Corte 30min R$40 + Barba 20min R$25 — é o "2 serviços · 50 min"
    // do design, com o total que a tela de confirmação repete.
    expect(screen.getByText("2 serviços")).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
  });

  it("não deixa continuar sem escolher nada", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("leva pro passo de data levando os ids escolhidos", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1"
    );
  });

  it("começa com o que já estava na URL marcado", async () => {
    // Voltar do passo de data não pode perder a escolha.
    navegacaoFalsa.redefinir({ query: { servicos: "s2" } });
    montar();

    await waitFor(() => screen.getByText("Barba"));
    expect(screen.getByRole("checkbox", { name: /Barba/ })).toBeChecked();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/escolha-de-servicos.test.tsx`
Expected: FAIL — imports de `ItemDeServico`, `Resumo` e `EscolhaDeServicos` não resolvem.

- [ ] **Step 3: Implementar os dois componentes**

`apps/web/src/componentes/ItemDeServico.module.css`:

```css
.item { display: flex; align-items: center; gap: var(--espaco-sm); width: 100%; padding: var(--espaco-md); border: var(--borda-padrao) solid var(--cor-ink); border-radius: var(--raio-md); background: var(--cor-surface); font-size: var(--texto-md); text-align: left; }
.marcado { background: var(--cor-pale-yellow); }
.preco { margin-left: auto; font-weight: 600; }
```

`apps/web/src/componentes/ItemDeServico.tsx`:

```tsx
"use client";

import type { ServicoSerializado } from "@barchop/types";
import estilos from "./ItemDeServico.module.css";

// Um `input[type=checkbox]` de verdade, e não uma div com onClick: é o
// que dá teclado, leitor de tela e o papel "checkbox" pro teste.
export function ItemDeServico({
  servico,
  marcado,
  aoAlternar,
}: {
  servico: ServicoSerializado;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <label className={`${estilos.item} ${marcado ? estilos.marcado : ""}`}>
      <input
        type="checkbox"
        checked={marcado}
        onChange={() => aoAlternar(servico.id)}
      />
      <span>{servico.nome}</span>
      <span className={estilos.preco}>{formatarPreco(servico.preco)}</span>
    </label>
  );
}

// O preço vem como string decimal ("40.00") porque passar por float
// perderia centavo — ver ServicoSerializado. A conversão pra exibição
// acontece só aqui, na borda.
export function formatarPreco(preco: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(preco));
}
```

`apps/web/src/componentes/Resumo.module.css`:

```css
.resumo { display: flex; gap: var(--espaco-md); padding: var(--espaco-sm) var(--espaco-md); border: var(--borda-padrao) solid var(--cor-ink); border-radius: var(--raio-pill); background: var(--cor-paper-soft); font-size: var(--texto-sm); font-weight: 600; }
.valor { margin-left: auto; }
```

`apps/web/src/componentes/Resumo.tsx`:

```tsx
import estilos from "./Resumo.module.css";

// A barra "2 serviços · 50 min" que aparece em três passos.
export function Resumo({ itens }: { itens: string[] }) {
  return (
    <div className={estilos.resumo}>
      {itens.map((item, indice) => (
        <span key={item} className={indice > 0 ? estilos.valor : undefined}>
          {item}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/EscolhaDeServicos.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
.lista { display: grid; gap: var(--espaco-sm); }
```

`apps/web/src/telas/EscolhaDeServicos.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { formatarPreco, ItemDeServico } from "../componentes/ItemDeServico";
import { Resumo } from "../componentes/Resumo";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import estilos from "./EscolhaDeServicos.module.css";

export function EscolhaDeServicos() {
  const { slug, servicoIds, remarcar } = usePassoDoFluxo("servicos");
  const router = useRouter();
  const api = useApi();
  const { dados, carregando } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );

  // Começa do que veio na URL: voltar do passo seguinte não pode perder
  // a escolha.
  const [escolhidos, setEscolhidos] = useState<string[]>(servicoIds);

  const servicos = dados ?? [];
  const selecionados = servicos.filter((s) => escolhidos.includes(s.id));
  const duracao = selecionados.reduce((t, s) => t + s.duracaoMinutos, 0);
  const total = selecionados.reduce((t, s) => t + Number(s.preco), 0);

  function alternar(id: string) {
    setEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]
    );
  }

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  return (
    <main className={estilos.pagina}>
      <h1>Serviços</h1>

      <div className={estilos.lista}>
        {servicos.map((servico) => (
          <ItemDeServico
            key={servico.id}
            servico={servico}
            marcado={escolhidos.includes(servico.id)}
            aoAlternar={alternar}
          />
        ))}
      </div>

      {selecionados.length > 0 ? (
        <Resumo
          itens={[
            `${selecionados.length} ${
              selecionados.length === 1 ? "serviço" : "serviços"
            }`,
            `${duracao} min`,
            formatarPreco(total.toFixed(2)),
          ]}
        />
      ) : null}

      <Botao
        disabled={escolhidos.length === 0}
        onClick={() =>
          router.push(
            caminhoDoPasso(slug, "data", { servicoIds: escolhidos, remarcar })
          )
        }
      >
        Continuar
      </Botao>
    </main>
  );
}
```

- [ ] **Step 5: Criar a rota**

`apps/web/app/(publico)/[slug]/agendar/page.tsx`:

```tsx
import { Suspense } from "react";
import { EscolhaDeServicos } from "../../../../src/telas/EscolhaDeServicos";

// O Suspense é exigência do Next 16: quem lê useSearchParams numa rota
// pré-renderizada precisa de um limite acima, senão o build recusa.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <EscolhaDeServicos />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os cinco casos da escolha de serviços.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the service picker with live duration and price

The screen starts from whatever the URL already carries, so coming back
from the date step keeps the choice. Price arrives as a decimal string
and is only turned into a number at the display edge, which is the same
reason the API never sends it as one."
```

---

### Task 5: escolha da data (`/[slug]/agendar/data`)

**Files:**
- Create: `apps/web/src/componentes/Calendario.tsx` + `.module.css`, `apps/web/src/telas/EscolhaDaData.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/agendar/data/page.tsx`
- Test: `apps/web/tests/telas/escolha-da-data.test.tsx`

**Interfaces:**
- Consumes: `diasDoMes`, `ehPassado`, `formatarDataLonga` (Task 2); `usePassoDoFluxo`, `caminhoDoPasso`.
- Produces: `<Calendario mes dias agora aoEscolher aoTrocarMes>` com `dias: Record<string, boolean>`; `<EscolhaDaData agora?={Date} />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/escolha-da-data.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDaData } from "../../src/telas/EscolhaDaData";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Manhã do dia 9. O instante é prop, não relógio global: user-event
// trava sob fake timers, e estes testes clicam.
const MANHA = new Date("2026-09-09T10:00:00-03:00");

function montar(diasComVaga: Record<string, boolean>) {
  render(
    <ProvedorDaApi valor={criarApiClientFalso({ diasComVaga })}>
      <EscolhaDaData agora={MANHA} />
    </ProvedorDaApi>
  );
}

describe("escolha da data", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
  });

  it("desabilita dia sem vaga", async () => {
    montar({ "2026-09-10": true, "2026-09-11": false });
    await waitFor(() => screen.getByRole("button", { name: "10" }));

    expect(screen.getByRole("button", { name: "11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10" })).toBeEnabled();
  });

  it("desabilita dia passado mesmo quando a API diz que tem vaga", async () => {
    // A API não sabe que dia é hoje: /disponibilidade/mes marca ontem
    // como disponível. Quem barra é esta tela — sem isso o cliente
    // agenda no passado e tranca a própria conta.
    montar({ "2026-09-08": true, "2026-09-10": true });
    await waitFor(() => screen.getByRole("button", { name: "10" }));

    expect(screen.getByRole("button", { name: "8" })).toBeDisabled();
  });

  it("hoje continua escolhível", async () => {
    montar({ "2026-09-09": true });
    await waitFor(() => screen.getByRole("button", { name: "9" }));

    expect(screen.getByRole("button", { name: "9" })).toBeEnabled();
  });

  it("leva pro passo de horário com a data escolhida", async () => {
    montar({ "2026-09-10": true });
    await waitFor(() => screen.getByRole("button", { name: "10" }));

    await userEvent.click(screen.getByRole("button", { name: "10" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/horario?servicos=s1&data=2026-09-10"
    );
  });

  it("volta pro passo de serviços quando a URL não traz nenhum", async () => {
    navegacaoFalsa.redefinir({ query: {} });
    montar({});

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/agendar")
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/escolha-da-data.test.tsx`
Expected: FAIL — `Calendario` e `EscolhaDaData` não existem.

- [ ] **Step 3: Implementar o calendário**

`apps/web/src/componentes/Calendario.module.css`:

```css
.calendario { display: grid; gap: var(--espaco-sm); }
.cabecalho { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.grade { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--espaco-xs); }
.dia { padding: var(--espaco-sm); border: var(--borda-padrao) solid var(--cor-ink); border-radius: var(--raio-sm); background: var(--cor-surface); font-size: var(--texto-sm); cursor: pointer; }
.dia:disabled { opacity: 0.35; cursor: not-allowed; }
.vazio { border: none; background: transparent; }
```

`apps/web/src/componentes/Calendario.tsx`:

```tsx
"use client";

import { diasDoMes, ehPassado } from "../formato/datas";
import estilos from "./Calendario.module.css";

// `dias` é o mapa que /disponibilidade/mes devolve: data -> tem vaga.
// O passado não vem de lá — a rota não sabe que dia é hoje, e é esta
// tela que decide.
export function Calendario({
  mes,
  dias,
  agora,
  aoEscolher,
  aoTrocarMes,
}: {
  mes: string;
  dias: Record<string, boolean>;
  agora: Date;
  aoEscolher: (data: string) => void;
  aoTrocarMes: (mes: string) => void;
}) {
  return (
    <div className={estilos.calendario}>
      <div className={estilos.cabecalho}>
        <button onClick={() => aoTrocarMes(mesVizinho(mes, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <span>{nomeDoMes(mes)}</span>
        <button onClick={() => aoTrocarMes(mesVizinho(mes, 1))} aria-label="Próximo mês">
          ›
        </button>
      </div>

      <div className={estilos.grade}>
        {diasDoMes(mes).map((data, indice) =>
          data === null ? (
            <span key={`vazio-${indice}`} className={estilos.vazio} />
          ) : (
            <button
              key={data}
              className={estilos.dia}
              disabled={ehPassado(data, agora) || !dias[data]}
              onClick={() => aoEscolher(data)}
            >
              {Number(data.slice(-2))}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function mesVizinho(mes: string, passo: number): string {
  const [ano, numero] = mes.split("-").map(Number);
  const referencia = new Date(Date.UTC(ano, numero - 1 + passo, 1));
  return `${referencia.getUTCFullYear()}-${String(
    referencia.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function nomeDoMes(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mes}-01T00:00:00Z`));
}
```

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/EscolhaDaData.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
```

`apps/web/src/telas/EscolhaDaData.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Calendario } from "../componentes/Calendario";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { hojeIso } from "../formato/datas";
import estilos from "./EscolhaDaData.module.css";

// `agora` é prop com padrão, do mesmo jeito que o agoraNaBarbearia da
// API recebe o instante: é o que deixa o teste escolher o dia sem fake
// timers.
export function EscolhaDaData({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, remarcar, pronto } = usePassoDoFluxo("data");
  const router = useRouter();
  const api = useApi();
  const [mes, setMes] = useState(() => hojeIso(agora).slice(0, 7));

  const { dados, carregando } = useRequisicao(async () => {
    if (!pronto) return {};
    const perfil = await api.publico.perfilDaBarbearia(slug);
    // O barbeiroId sai do perfil, e não da URL: é a única rota pública
    // que o entrega, e a barbearia do MVP tem um barbeiro só.
    return api.publico.disponibilidadeDoMes(slug, {
      barbeiroId: perfil.barbeiros[0].id,
      mes,
      servicoIds,
    });
  }, [slug, mes, servicoIds.join(","), pronto]);

  if (!pronto) return null;

  return (
    <main className={estilos.pagina}>
      <h1>Escolha a data</h1>
      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <Calendario
          mes={mes}
          dias={dados ?? {}}
          agora={agora}
          aoTrocarMes={setMes}
          aoEscolher={(data) =>
            router.push(
              caminhoDoPasso(slug, "horario", { servicoIds, data, remarcar })
            )
          }
        />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Criar a rota**

`apps/web/app/(publico)/[slug]/agendar/data/page.tsx`:

```tsx
import { Suspense } from "react";
import { EscolhaDaData } from "../../../../../src/telas/EscolhaDaData";

export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <EscolhaDaData />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os cinco casos da data, incluindo os dois do passado.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the date picker, which is what disables the past

/disponibilidade/mes reports any day with a free window, yesterday
included, because the route has no idea what day it is - the comment in
the router says so outright. This screen is the only barrier, and a
booking in the past is exactly what garantirAlteravel later refuses to
cancel or move."
```

---

### Task 6: escolha do horário (`/[slug]/agendar/horario`)

**Files:**
- Create: `apps/web/src/componentes/ListaDeHorarios.tsx` + `.module.css`, `apps/web/src/telas/EscolhaDoHorario.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/agendar/horario/page.tsx`
- Test: `apps/web/tests/telas/escolha-do-horario.test.tsx`

**Interfaces:**
- Consumes: `horaJaPassou`, `formatarDataLonga` (Task 2).
- Produces: `<ListaDeHorarios horarios aoEscolher>`, `<EscolhaDoHorario agora?={Date} />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/escolha-do-horario.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDoHorario } from "../../src/telas/EscolhaDoHorario";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Duas da tarde do dia 9 — o instante que faz "09:00 de hoje" ser
// passado. Prop, e não relógio global, porque estes testes clicam.
const TARDE = new Date("2026-09-09T14:00:00-03:00");

function montar(horarios: string[]) {
  render(
    <ProvedorDaApi valor={criarApiClientFalso({ horariosLivres: horarios })}>
      <EscolhaDoHorario agora={TARDE} />
    </ProvedorDaApi>
  );
}

describe("escolha do horário", () => {

  it("mostra os horários livres do dia", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar(["09:00", "09:30"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    expect(screen.getByRole("button", { name: "09:30" })).toBeInTheDocument();
  });

  it("descarta horário que já passou quando a data é hoje", async () => {
    // A API devolve 09:00 mesmo às duas da tarde: ela não tem noção de
    // "agora". Sem este filtro o cliente agenda pra trás.
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-09" } });
    montar(["09:00", "14:30", "15:00"]);

    await waitFor(() => screen.getByRole("button", { name: "14:30" }));
    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15:00" })).toBeInTheDocument();
  });

  it("avisa quando não sobrou horário nenhum pra hoje", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-09" } });
    montar(["09:00"]);

    await waitFor(() =>
      expect(screen.getByText(/nenhum horário/i)).toBeInTheDocument()
    );
  });

  it("leva pro passo de dados com a hora escolhida", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar(["09:00"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    await userEvent.click(screen.getByRole("button", { name: "09:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/dados?servicos=s1&data=2026-09-10&hora=09%3A00"
    );
  });

  it("no remarcar vai direto pra confirmação, sem passar por dados", async () => {
    // Quem remarca já está autenticado, e a API tira o cliente do token:
    // pedir nome e telefone de novo seria pedir o que ela ignora.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", remarcar: "a1" },
    });
    montar(["09:00"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    await userEvent.click(screen.getByRole("button", { name: "09:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=09%3A00&remarcar=a1"
    );
  });

  it("volta pro passo de data quando a URL não traz data", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
    montar([]);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/data?servicos=s1"
      )
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/escolha-do-horario.test.tsx`
Expected: FAIL — `ListaDeHorarios` e `EscolhaDoHorario` não existem.

- [ ] **Step 3: Implementar a lista**

`apps/web/src/componentes/ListaDeHorarios.module.css`:

```css
.lista { display: flex; flex-wrap: wrap; gap: var(--espaco-sm); }
.horario { padding: var(--espaco-sm) var(--espaco-md); border: var(--borda-padrao) solid var(--cor-ink); border-radius: var(--raio-pill); background: var(--cor-surface); font-size: var(--texto-sm); font-weight: 600; cursor: pointer; }
```

`apps/web/src/componentes/ListaDeHorarios.tsx`:

```tsx
"use client";

import estilos from "./ListaDeHorarios.module.css";

export function ListaDeHorarios({
  horarios,
  aoEscolher,
}: {
  horarios: string[];
  aoEscolher: (hora: string) => void;
}) {
  return (
    <div className={estilos.lista}>
      {horarios.map((hora) => (
        <button
          key={hora}
          className={estilos.horario}
          onClick={() => aoEscolher(hora)}
        >
          {hora}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/EscolhaDoHorario.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
```

`apps/web/src/telas/EscolhaDoHorario.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { ListaDeHorarios } from "../componentes/ListaDeHorarios";
import { Resumo } from "../componentes/Resumo";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { formatarDataLonga, horaJaPassou } from "../formato/datas";
import estilos from "./EscolhaDoHorario.module.css";

// `agora` é prop com padrão, igual ao da tela de data: o instante entra
// por parâmetro em vez de vir de um relógio congelado.
export function EscolhaDoHorario({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, data, remarcar, pronto } =
    usePassoDoFluxo("horario");
  const router = useRouter();
  const api = useApi();

  const { dados, carregando } = useRequisicao(async () => {
    if (!pronto || !data) return [];
    const perfil = await api.publico.perfilDaBarbearia(slug);
    return api.publico.disponibilidadeDoDia(slug, {
      barbeiroId: perfil.barbeiros[0].id,
      data,
      servicoIds,
    });
  }, [slug, data, servicoIds.join(","), pronto]);

  if (!pronto || !data) return null;

  // A API devolve os horários da janela de funcionamento sem saber que
  // horas são: às 14h ela ainda oferece 09:00. Filtrar aqui é o que
  // impede um agendamento que nasce inalterável.
  const horarios = (dados ?? []).filter(
    (hora) => !horaJaPassou(data, hora, agora)
  );

  return (
    <main className={estilos.pagina}>
      <h1>Escolha o horário</h1>
      <Resumo itens={[formatarDataLonga(data)]} />

      {carregando ? (
        <p>Carregando…</p>
      ) : horarios.length === 0 ? (
        <p>Nenhum horário disponível nesse dia. Escolha outra data.</p>
      ) : (
        <ListaDeHorarios
          horarios={horarios}
          aoEscolher={(hora) =>
            router.push(
              caminhoDoPasso(
                slug,
                // Quem remarca já está autenticado e a API tira o
                // cliente do token — o passo de dados não tem o que
                // perguntar.
                remarcar ? "confirmar" : "dados",
                { servicoIds, data, hora, remarcar }
              )
            )
          }
        />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Criar a rota**

`apps/web/app/(publico)/[slug]/agendar/horario/page.tsx`:

```tsx
import { Suspense } from "react";
import { EscolhaDoHorario } from "../../../../../src/telas/EscolhaDoHorario";

export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <EscolhaDoHorario />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os seis casos do horário.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the time picker, which drops times already gone today

The availability route answers from the opening hours and never asks
what time it is, so at 2pm it still offers 9am. Rescheduling skips the
personal-data step from here, because that flow is authenticated and the
API takes the client from the token."
```

---

### Task 7: dados do cliente (`/[slug]/agendar/dados`)

**Files:**
- Create: `apps/web/src/telas/DadosDoCliente.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/agendar/dados/page.tsx`
- Modify: `apps/web/src/componentes/Campo.tsx` (aceitar valor controlado)
- Test: `apps/web/tests/telas/dados-do-cliente.test.tsx`

**Interfaces:**
- Consumes: `Campo` (fundação), `lerDadosDoCliente`/`gravarDadosDoCliente` (Task 2), `sessaoDoCliente` de `src/sessao/armazenamento`.
- Produces: `<DadosDoCliente />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/dados-do-cliente.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { DadosDoCliente } from "../../src/telas/DadosDoCliente";
import { lerDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <DadosDoCliente />
    </ProvedorDaApi>
  );
}

describe("dados do cliente", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", hora: "09:00" },
    });
  });

  it("formata o telefone enquanto digita", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");

    expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 99999-8888");
  });

  it("guarda os dados e segue pra confirmação", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/nome/i), "João Silva");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(lerDadosDoCliente()).toEqual({
      nome: "João Silva",
      telefone: "(11) 99999-8888",
    });
    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=09%3A00"
    );
  });

  it("recusa telefone sem DDD antes de mandar pra API", async () => {
    // A API responderia 400 pelo pattern; barrar aqui evita a ida e
    // volta e diz o que fazer.
    montar();

    await userEvent.type(screen.getByLabelText(/nome/i), "João");
    await userEvent.type(screen.getByLabelText(/telefone/i), "999998888");
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByText(/informe o ddd/i)).toBeInTheDocument();
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("chega preenchido quando existe sessão daquela barbearia", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar();

    await waitFor(() =>
      expect(screen.getByLabelText(/nome/i)).toHaveValue("João Silva")
    );
    expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 99999-8888");
  });

  it("volta pro passo de horário quando a URL não traz hora", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/horario?servicos=s1&data=2026-09-10"
      )
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/dados-do-cliente.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/telas/DadosDoCliente"`.

- [ ] **Step 3: Ajustar o `Campo` para aceitar valor controlado**

O `Campo` da fundação guarda o próprio valor e só avisa por `onChange`. Esta tela precisa preencher o campo a partir da sessão, então o componente ganha um valor opcional vindo de fora. Em `apps/web/src/componentes/Campo.tsx`, trocar a declaração do estado e o `value` do input:

```tsx
interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  rotulo: string;
  erro?: string;
  formato?: "telefone";
  valor?: string;
  onChange?: (valor: string) => void;
}

export function Campo({ rotulo, erro, formato, valor, onChange, ...resto }: Props) {
  const id = useId();
  const [interno, setInterno] = useState("");
  // Controlado quando o pai manda `valor`; senão o campo cuida de si.
  // Sem isso não haveria como preencher nome e telefone a partir da
  // sessão do cliente.
  const atual = valor ?? interno;
```

e no input, `value={atual}`, com o `onChange` gravando em `setInterno` e chamando `onChange?.(proximo)` como já fazia.

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/DadosDoCliente.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
```

`apps/web/src/telas/DadosDoCliente.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarTelefone, TelefoneInvalido } from "@barchop/formato";
import { useApi } from "../api/ProvedorDaApi";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { caminhoDoPasso } from "../fluxo/passos";
import { gravarDadosDoCliente, lerDadosDoCliente } from "../fluxo/dadosDoCliente";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./DadosDoCliente.module.css";

export function DadosDoCliente() {
  const { slug, servicoIds, data, hora, remarcar, pronto } =
    usePassoDoFluxo("dados");
  const router = useRouter();
  const api = useApi();

  const guardados = lerDadosDoCliente();
  const [nome, setNome] = useState(guardados?.nome ?? "");
  const [telefone, setTelefone] = useState(guardados?.telefone ?? "");
  const [erro, setErro] = useState<string | undefined>();

  // Se a pessoa já tem conta nesta barbearia, o cadastro é a fonte —
  // digitar de novo o que a API já sabe é trabalho à toa.
  useEffect(() => {
    if (!sessaoDoCliente(slug).ler()) return;

    let vivo = true;
    api.cliente
      .meuCadastro()
      .then((cliente) => {
        if (!vivo) return;
        setNome((atual) => atual || cliente.nome);
        setTelefone((atual) => atual || cliente.telefone);
      })
      // Token vencido cai aqui; o gancho da fundação já limpou a sessão,
      // e a tela segue como se não houvesse conta.
      .catch(() => undefined);

    return () => {
      vivo = false;
    };
  }, [api, slug]);

  if (!pronto) return null;

  function continuar() {
    let normalizado: string;
    try {
      // A mesma função que a API usa. Barrar aqui evita a ida e volta
      // que voltaria 400 sem dizer o que fazer.
      normalizado = normalizarTelefone(telefone) ?? "";
    } catch (causa) {
      setErro(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    if (!nome.trim() || !normalizado) {
      setErro("Informe o DDD e o número, como (11) 99999-8888");
      return;
    }

    gravarDadosDoCliente({ nome: nome.trim(), telefone: normalizado });
    router.push(
      caminhoDoPasso(slug, "confirmar", { servicoIds, data, hora, remarcar })
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Seus dados</h1>
      <Campo rotulo="Nome" valor={nome} onChange={setNome} />
      <Campo
        rotulo="Telefone (WhatsApp)"
        formato="telefone"
        valor={telefone}
        onChange={setTelefone}
        erro={erro}
      />
      <Botao onClick={continuar}>Continuar</Botao>
    </main>
  );
}
```

- [ ] **Step 5: Criar a rota**

`apps/web/app/(publico)/[slug]/agendar/dados/page.tsx`:

```tsx
import { Suspense } from "react";
import { DadosDoCliente } from "../../../../../src/telas/DadosDoCliente";

export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <DadosDoCliente />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os cinco casos dos dados, e os testes do `Campo` da fundação continuam verdes.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the client details step, prefilled from the session

Validation uses the same normalizarTelefone the API uses, so a number
without an area code is refused here with an instruction instead of
coming back as a bare 400. Campo now accepts a value from outside, which
is what lets an existing account fill the form."
```

---

### Task 8: confirmação e sucesso (`/[slug]/agendar/confirmar`)

**Files:**
- Create: `apps/web/src/componentes/Aviso.tsx` + `.module.css`, `apps/web/src/telas/Confirmacao.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/agendar/confirmar/page.tsx`
- Test: `apps/web/tests/telas/confirmacao.test.tsx`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: `<Aviso>{mensagem}</Aviso>`, `<Confirmacao />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/confirmacao.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { gravarDadosDoCliente, lerDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Confirmacao />
    </ProvedorDaApi>
  );
  return falso;
}

describe("confirmação", () => {
  beforeEach(() => {
    sessionStorage.clear();
    navegacaoFalsa.redefinir({
      query: { servicos: "s1,s2", data: "2026-09-10", hora: "09:00" },
    });
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
  });

  it("mostra o resumo do que vai ser agendado", async () => {
    montar();
    await waitFor(() => screen.getByText(/corte/i));

    expect(screen.getByText("10 de setembro")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
  });

  it("cria o agendamento e vira tela de sucesso", async () => {
    const falso = montar();
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() =>
      expect(screen.getByText(/agendamento confirmado/i)).toBeInTheDocument()
    );
    expect(falso.estado.agendamentos).toHaveLength(1);
    // Os dados pessoais somem assim que deixam de ser necessários.
    expect(lerDadosDoCliente()).toBeNull();
  });

  it("no horario_ocupado volta pro passo de horário", async () => {
    // A trava do banco pega a corrida depois de a disponibilidade já ter
    // dito que cabia. Repetir o envio daria o mesmo 409: o certo é
    // recarregar a lista.
    const falso = criarApiClientFalso();
    await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "09:00",
      cliente: { nome: "Outro", telefone: "(11) 98888-7777" },
    });

    montar(falso);
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/horario?servicos=s1%2Cs2&data=2026-09-10"
      )
    );
    expect(screen.getByText(/esse horário acabou de ser ocupado/i)).toBeInTheDocument();
  });

  it("volta pro passo de dados quando não há nome e telefone guardados", async () => {
    sessionStorage.clear();
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/dados?servicos=s1%2Cs2&data=2026-09-10&hora=09%3A00"
      )
    );
  });

  it("no remarcar chama remarcar em vez de agendar, sem pedir dados", async () => {
    const falso = criarApiClientFalso();
    const original = await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-20",
      horaInicio: "11:00",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });
    sessionStorage.clear();
    navegacaoFalsa.redefinir({
      query: {
        servicos: "s1",
        data: "2026-09-21",
        hora: "10:00",
        remarcar: original.id,
      },
    });

    montar(falso);
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() =>
      expect(screen.getByText(/agendamento confirmado/i)).toBeInTheDocument()
    );
    const cancelado = falso.estado.agendamentos.find((a) => a.id === original.id);
    expect(cancelado?.status).toBe("cancelado");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/confirmacao.test.tsx`
Expected: FAIL — `Aviso` e `Confirmacao` não existem.

- [ ] **Step 3: Implementar o `Aviso`**

`apps/web/src/componentes/Aviso.module.css`:

```css
.aviso { padding: var(--espaco-md); border: var(--borda-padrao) solid #b3261e; border-radius: var(--raio-md); background: var(--cor-surface); color: #b3261e; font-size: var(--texto-sm); }
```

`apps/web/src/componentes/Aviso.tsx`:

```tsx
import type { ReactNode } from "react";
import estilos from "./Aviso.module.css";

// `role="alert"` porque a mensagem aparece depois de uma ação da
// pessoa: sem ele, quem usa leitor de tela não fica sabendo.
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className={estilos.aviso} role="alert">
      {children}
    </p>
  );
}
```

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/Confirmacao.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
.linha { display: flex; justify-content: space-between; gap: var(--espaco-md); padding: var(--espaco-sm) 0; border-bottom: var(--borda-hairline) solid var(--cor-line); }
```

`apps/web/src/telas/Confirmacao.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoSerializado } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { formatarPreco } from "../componentes/ItemDeServico";
import { caminhoDoPasso } from "../fluxo/passos";
import { lerDadosDoCliente, limparDadosDoCliente } from "../fluxo/dadosDoCliente";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./Confirmacao.module.css";

export function Confirmacao() {
  const { slug, servicoIds, data, hora, remarcar, pronto } =
    usePassoDoFluxo("confirmar");
  const router = useRouter();
  const api = useApi();

  const [criado, setCriado] = useState<AgendamentoSerializado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  const dadosDoCliente = lerDadosDoCliente();
  // Remarcar não passa pelo passo de dados: o cliente vem do token.
  const faltamDados = !remarcar && !dadosDoCliente;

  useEffect(() => {
    if (!pronto || !faltamDados || criado) return;
    // Aba reaberta, sessionStorage limpo por outra aba, formato antigo:
    // volta um passo em vez de tentar agendar sem cliente.
    router.replace(caminhoDoPasso(slug, "dados", { servicoIds, data, hora, remarcar }));
  }, [pronto, faltamDados, criado, router, slug, servicoIds, data, hora, remarcar]);

  const { dados: servicos } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );

  if (!pronto || !data || !hora) return null;

  const escolhidos = (servicos ?? []).filter((s) => servicoIds.includes(s.id));
  const total = escolhidos.reduce((soma, s) => soma + Number(s.preco), 0);

  async function confirmar() {
    setEnviando(true);
    setAviso(undefined);

    try {
      const agendamento = remarcar
        ? await api.cliente.remarcar(remarcar, { data, horaInicio: hora, servicoIds })
        : await api.publico.agendar(slug, {
            barbeiroId: (await api.publico.perfilDaBarbearia(slug)).barbeiros[0].id,
            servicoIds,
            data,
            horaInicio: hora,
            cliente: dadosDoCliente!,
          });

      limparDadosDoCliente();
      setCriado(agendamento);
    } catch (causa) {
      const erro = causa as ErroDaApi;

      // O único erro que uma tela correta ainda encontra: a corrida que
      // a trava do banco pega depois de a disponibilidade ter dito que
      // cabia. Reenviar daria o mesmo 409 — o certo é ver a lista nova.
      if (erro.codigo === "horario_ocupado") {
        setAviso("Esse horário acabou de ser ocupado. Escolha outro.");
        router.push(caminhoDoPasso(slug, "horario", { servicoIds, data, remarcar }));
        return;
      }

      setAviso(
        erro.mensagem || "Não foi possível confirmar. Tente de novo em instantes."
      );
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    return (
      <main className={estilos.pagina}>
        <h1>Agendamento confirmado</h1>
        <div className={estilos.linha}>
          <span>Quando</span>
          <b>
            {criado.horaInicio} · {formatarDataLonga(criado.data)}
          </b>
        </div>
        <Botao variante="contorno" onClick={() => router.push(`/${slug}`)}>
          Voltar ao início
        </Botao>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Confirmar</h1>

      <div className={estilos.linha}>
        <span>Serviços</span>
        <b>{escolhidos.map((s) => s.nome).join(", ")}</b>
      </div>
      <div className={estilos.linha}>
        <span>Quando</span>
        <b>
          <span>{hora}</span> · <span>{formatarDataLonga(data)}</span>
        </b>
      </div>
      <div className={estilos.linha}>
        <span>Total</span>
        <b>{formatarPreco(total.toFixed(2))}</b>
      </div>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Botao carregando={enviando} onClick={confirmar}>
        Confirmar agendamento
      </Botao>
    </main>
  );
}
```

- [ ] **Step 5: Criar a rota**

`apps/web/app/(publico)/[slug]/agendar/confirmar/page.tsx`:

```tsx
import { Suspense } from "react";
import { Confirmacao } from "../../../../../src/telas/Confirmacao";

export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Confirmacao />
    </Suspense>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os cinco casos da confirmação.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the confirmation step, which doubles as the success screen

horario_ocupado sends the visitor back to the time list instead of
retrying: the database lock caught a race that availability could not
see, and a second identical request would lose it again. Personal data
is cleared the moment the booking exists."
```

---

### Task 9: entrar e primeiro acesso (`/[slug]/entrar`)

**Files:**
- Create: `apps/web/src/telas/Entrar.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/entrar/page.tsx`
- Test: `apps/web/tests/telas/entrar.test.tsx`

**Interfaces:**
- Consumes: `publico.loginCliente`, `publico.signupCliente`; `sessaoDoCliente`.
- Produces: `<Entrar />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/entrar.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Entrar } from "../../src/telas/Entrar";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Entrar />
    </ProvedorDaApi>
  );
  return falso;
}

async function preencher() {
  await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");
  await userEvent.type(screen.getByLabelText(/senha/i), "segredo123");
}

describe("entrar", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
  });

  it("entra e guarda o token daquela barbearia", async () => {
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/minha-conta");
  });

  it("traduz nao_autenticado em telefone ou senha incorretos", async () => {
    const falso = criarApiClientFalso();
    falso.publico.loginCliente = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    montar(falso);
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByText(/telefone ou senha incorretos/i)).toBeInTheDocument()
    );
  });

  it("no primeiro acesso cria a senha e entra", async () => {
    montar();
    await userEvent.type(screen.getByLabelText(/nome/i), "Maria");
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: /primeiro acesso/i }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
  });

  it("traduz conflito do primeiro acesso em telefone que já tem senha", async () => {
    // Não existe rota pública que diga se um telefone tem senha, e é de
    // propósito — seria a sondagem que o 409 do signup já permite. A
    // tela reage ao que a API responde.
    const falso = criarApiClientFalso();
    falso.publico.signupCliente = async () => {
      throw new ErroDaApi(409, "conflito", "esse telefone já tem conta");
    };
    montar(falso);
    await userEvent.type(screen.getByLabelText(/nome/i), "Maria");
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: /primeiro acesso/i }));

    await waitFor(() =>
      expect(screen.getByText(/já tem senha/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/entrar.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/telas/Entrar"`.

- [ ] **Step 3: Implementar a tela**

`apps/web/src/telas/Entrar.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
.acoes { display: grid; gap: var(--espaco-sm); }
```

`apps/web/src/telas/Entrar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefone } from "@barchop/formato";
import { useApi } from "../api/ProvedorDaApi";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./Entrar.module.css";

export function Entrar() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  // Quem escolhe entre entrar e primeiro acesso é a pessoa: não existe
  // rota pública que responda se um telefone já tem senha, e perguntar
  // seria a sondagem que o 409 do signup já permite.
  async function submeter(acao: "entrar" | "primeiro-acesso") {
    setEnviando(true);
    setAviso(undefined);

    try {
      const numero = normalizarTelefone(telefone) ?? "";
      const sessao =
        acao === "entrar"
          ? await api.publico.loginCliente(slug, { telefone: numero, senha })
          : await api.publico.signupCliente(slug, {
              nome,
              telefone: numero,
              senha,
            });

      sessaoDoCliente(slug).gravar(sessao.token);
      router.push(`/${slug}/minha-conta`);
    } catch (causa) {
      const erro = causa as ErroDaApi;

      if (erro.codigo === "nao_autenticado") {
        setAviso("Telefone ou senha incorretos.");
      } else if (erro.codigo === "conflito") {
        setAviso("Esse telefone já tem senha. Use Entrar.");
      } else {
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>Minha conta</h1>

      <Campo rotulo="Nome (só no primeiro acesso)" valor={nome} onChange={setNome} />
      <Campo
        rotulo="Telefone"
        formato="telefone"
        valor={telefone}
        onChange={setTelefone}
      />
      <Campo
        rotulo="Senha"
        type="password"
        valor={senha}
        onChange={setSenha}
      />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <div className={estilos.acoes}>
        <Botao carregando={enviando} onClick={() => submeter("entrar")}>
          Entrar
        </Botao>
        <Botao
          variante="contorno"
          carregando={enviando}
          onClick={() => submeter("primeiro-acesso")}
        >
          Primeiro acesso
        </Botao>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Criar a rota**

`apps/web/app/(publico)/[slug]/entrar/page.tsx`:

```tsx
import { Entrar } from "../../../../src/telas/Entrar";

// Sem Suspense: esta tela não lê a query.
export default function Pagina() {
  return <Entrar />;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os quatro casos do entrar.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add the client login screen with first access

No public route says whether a phone already has a password, and asking
would be the probe the signup 409 is already criticised for allowing. So
the person picks the action and the screen translates the answer:
nao_autenticado into wrong phone or password, conflito into this phone
already has one."
```

---

### Task 10: meus agendamentos (`/[slug]/minha-conta`)

**Files:**
- Create: `apps/web/src/telas/MinhaConta.tsx` + `.module.css`, `apps/web/app/(publico)/[slug]/minha-conta/page.tsx`
- Test: `apps/web/tests/telas/minha-conta.test.tsx`

**Interfaces:**
- Consumes: `cliente.meusAgendamentos`, `cliente.cancelar`; `caminhoDoPasso` com `remarcar`.
- Produces: `<MinhaConta />`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/tests/telas/minha-conta.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { MinhaConta } from "../../src/telas/MinhaConta";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

async function comUmAgendamento() {
  const falso = criarApiClientFalso();
  await falso.publico.agendar("gr-barber", {
    barbeiroId: "bb1",
    servicoIds: ["s1"],
    data: "2026-09-20",
    horaInicio: "09:30",
    cliente: { nome: "João", telefone: "(11) 99999-8888" },
  });
  return falso;
}

function montar(falso: ReturnType<typeof criarApiClientFalso>) {
  render(
    <ProvedorDaApi valor={falso}>
      <MinhaConta />
    </ProvedorDaApi>
  );
}

describe("minha conta", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
  });

  it("lista os agendamentos com data, hora e status", async () => {
    montar(await comUmAgendamento());

    await waitFor(() => screen.getByText("20 de setembro"));
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
  });

  it("cancela e atualiza a lista", async () => {
    montar(await comUmAgendamento());
    await waitFor(() => screen.getByText("20 de setembro"));

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() =>
      expect(screen.getByText(/cancelado/i)).toBeInTheDocument()
    );
  });

  it("remarcar leva pro passo de data com o id na query", async () => {
    const falso = await comUmAgendamento();
    montar(falso);
    await waitFor(() => screen.getByText("20 de setembro"));

    await userEvent.click(screen.getByRole("button", { name: /remarcar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&remarcar=a1"
    );
  });

  it("manda pro entrar quando não há sessão", async () => {
    localStorage.clear();
    montar(criarApiClientFalso());

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/entrar")
    );
  });

  it("manda pro entrar quando a API responde 401", async () => {
    // Token de sete dias, e o hook da API consulta o banco a cada
    // requisição: 401 no meio da sessão é evento normal.
    const falso = criarApiClientFalso();
    falso.cliente.meusAgendamentos = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    montar(falso);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/entrar")
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/minha-conta.test.tsx`
Expected: FAIL — `Failed to resolve import "../../src/telas/MinhaConta"`.

- [ ] **Step 3: Implementar a tela**

`apps/web/src/telas/MinhaConta.module.css`:

```css
.pagina { display: grid; gap: var(--espaco-md); padding: var(--espaco-lg); max-width: 480px; }
.item { display: grid; gap: var(--espaco-sm); }
.linha { display: flex; align-items: center; gap: var(--espaco-sm); }
.acoes { display: flex; gap: var(--espaco-sm); }
```

`apps/web/src/telas/MinhaConta.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { Cartao } from "../componentes/Cartao";
import { Chip } from "../componentes/Chip";
import { caminhoDoPasso } from "../fluxo/passos";
import { formatarDataLonga } from "../formato/datas";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./MinhaConta.module.css";

export function MinhaConta() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();

  const temSessao = Boolean(sessaoDoCliente(slug).ler());
  const { dados, erro, recarregar } = useRequisicao(
    async () => (temSessao ? api.cliente.meusAgendamentos() : []),
    [slug, temSessao]
  );

  // Sem token, ou com token que a API recusou: o gancho da fundação já
  // limpou o armazenamento, e aqui só falta tirar a pessoa da tela.
  useEffect(() => {
    if (!temSessao || erro?.codigo === "nao_autenticado") {
      router.replace(`/${slug}/entrar`);
    }
  }, [temSessao, erro, router, slug]);

  if (!temSessao) return null;

  return (
    <main className={estilos.pagina}>
      <h1>Meus agendamentos</h1>

      {(dados ?? []).map((agendamento) => (
        <Cartao key={agendamento.id}>
          <div className={estilos.item}>
            <div className={estilos.linha}>
              <span>{formatarDataLonga(agendamento.data)}</span>
              <span>{agendamento.horaInicio}</span>
              <Chip tom={agendamento.status === "cancelado" ? "neutro" : "acento"}>
                {agendamento.status}
              </Chip>
            </div>

            {agendamento.status === "pendente" ||
            agendamento.status === "confirmado" ? (
              <div className={estilos.acoes}>
                <Botao
                  variante="contorno"
                  onClick={async () => {
                    await api.cliente.cancelar(agendamento.id);
                    recarregar();
                  }}
                >
                  Cancelar
                </Botao>
                <Botao
                  variante="fantasma"
                  onClick={() =>
                    router.push(
                      caminhoDoPasso(slug, "data", {
                        // Os mesmos serviços do agendamento: remarcar
                        // troca quando, não o quê.
                        servicoIds: agendamento.servicos.map((s) => s.servicoId),
                        remarcar: agendamento.id,
                      })
                    )
                  }
                >
                  Remarcar
                </Botao>
              </div>
            ) : null}
          </div>
        </Cartao>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Criar a rota**

`apps/web/app/(publico)/[slug]/minha-conta/page.tsx`:

```tsx
import { MinhaConta } from "../../../../src/telas/MinhaConta";

// Sem Suspense: esta tela não lê a query.
export default function Pagina() {
  return <MinhaConta />;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @barchop/web test`
Expected: PASS — os cinco casos da minha conta.

- [ ] **Step 6: Rodar tudo e fechar a fase**

Run: `pnpm test`
Expected: PASS em todos os pacotes.

Run: `pnpm type-check`
Expected: sem erro.

Run: `pnpm build`
Expected: build limpo, com as oito rotas de `[slug]` listadas.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add the client's appointment list with cancel and reschedule

Rescheduling carries the same services and only changes when, so it
enters the date step with the appointment id in the query. A 401 here is
ordinary - a seven-day token against a hook that reads the database on
every request - so the screen sends the visitor to the login it already
cleared the session for."
```

---

## Como verificar a fase inteira

1. `pnpm test` na raiz — verde, com os dez comportamentos que a spec lista cobertos.
2. `pnpm type-check` e `pnpm build` na raiz — sem erro; o build é o que prova que nenhum `useSearchParams` ficou fora de um `<Suspense>`.
3. Com a API local de pé (`pnpm --filter @barchop/api dev`) e o web em `pnpm --filter @barchop/web dev`, o fluxo fecha ponta a ponta: abrir `/<slug>`, escolher serviços, data e horário, informar nome e telefone, confirmar, e ver o agendamento em `/<slug>/minha-conta` depois do primeiro acesso.
4. Um dia passado no calendário e um horário de hoje que já passou não são selecionáveis, nem no caminho de agendar nem no de remarcar.
