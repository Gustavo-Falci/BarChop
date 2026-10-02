* [ ] 

# Painel web do barbeiro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar o painel web do barbeiro — doze rotas sob `/painel` —
de modo que o produto fique usável de ponta a ponta pelo navegador, sem
app.

**Architecture:** Next 16 App Router, todas as telas client components
falando com `packages/api-client` por um provedor de contexto, como o
fluxo do cliente já faz. O painel vive num segmento real `painel/`
dentro do route group `(painel)`, com um subgrupo `(guardado)` cujo
layout concentra a guarda de sessão, o carregamento do perfil e o
tratamento de 401. Estado de tela na URL; sessão em `localStorage`.

**Tech Stack:** Next 16.3, React 19.2, TypeScript, CSS Modules, Vitest 4
com jsdom e Testing Library, `@barchop/api-client` (com
`criarApiClientFalso`), `@barchop/formato`, `@barchop/types`,
`@barchop/design-tokens`.

**Spec:** `docs/superpowers/specs/2026-09-06-painel-do-barbeiro-design.md`

## Global Constraints

Valem em toda tarefa. Copiadas da spec e do que já é regra do
repositório.

- **Prefixo `/painel` em toda rota do painel.** O slug da barbearia é
  `^[a-z0-9-]{3,80}$` sem reservados; rota estática na raiz tornaria
  aquele slug inalcançável.
- **Telefone tem um formato só: `(11) 99999-8888`.** Escreve com
  `formatarTelefoneParcial` enquanto se digita, envia com
  `normalizarTelefoneObrigatorio`, que lança `TelefoneInvalido`. Número
  sem DDD é 400 na API.
- **Preço é `string` em todo o caminho, nunca `number`.** É `Decimal` no
  banco e float perderia centavo. Exibe com `formatarPreco` de
  `src/componentes/ItemDeServico.tsx`.
- **Toda tela que olhe relógio recebe `agora: Date` por parâmetro**, com
  `new Date()` como padrão, e todo teste com data fixa passa o instante.
  Fake timers não entram nesta suíte. Teste que compara data fixa com o
  relógio real passa hoje e falha sozinho depois — já aconteceu.
- **`vi.fn()` declara os parâmetros** (`vi.fn(async (id: string) => …)`).
  Sem eles `mock.calls` vira tupla vazia e a asserção quebra no
  type-check com o teste verde.
- **Rodar um arquivo só:**
  `pnpm --filter @barchop/web exec vitest run <caminho>`. O `--` do
  pnpm não chega ao vitest.
- **Não existe `next lint` no Next 16** e nenhum app tem script `lint`.
  A verificação é `pnpm type-check` e `pnpm test`.
- **CSS Modules, um arquivo por componente**, tokens sempre por
  `var(--cor-*)`, `var(--espaco-*)`, `var(--texto-*)`, `var(--raio-*)`,
  `var(--borda-*)`. Sem CSS-in-JS.
- **A suíte roda sem `globals: true`**: importe `describe`, `it`,
  `expect`, `beforeEach` e `vi` de `vitest` em todo arquivo.
- **Os erros da API se tratam por `codigo`, nunca por status solto.** Os
  códigos: `nao_autenticado`, `nao_encontrado`, `conflito`,
  `horario_ocupado`, `regra_de_negocio`, `requisicao_invalida`,
  `erro_interno`.
- **Commits em inglês**, no formato dos que já existem (`feat(web): …`,
  `fix(web): …`, `test(web): …`, `docs: …`).

## Estrutura de arquivos

**Pacote `api-client` (Tarefa 1)**

| Arquivo                                     | Responsabilidade                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/api-client/src/falso.ts`        | passa a guardar**lista** de clientes, `clienteId` por agendamento, e `signup` que respeita a entrada |
| `packages/api-client/tests/falso.test.ts` | cobre os três reparos                                                                                         |

**Sessão e tema (Tarefas 2 e 3)**

| Arquivo                                  | Responsabilidade                                            |
| ---------------------------------------- | ----------------------------------------------------------- |
| `apps/web/src/sessao/armazenamento.ts` | ganha`sessaoDaBarbearia` e `encerrarSessaoDoBarbeiro()` |
| `apps/web/src/painel/tema.ts`          | chave, leitura, aplicação e o script inline               |
| `apps/web/app/tokens-css.ts`           | três blocos de tema em vez de dois                         |
| `apps/web/app/layout.tsx`              | script de tema no`<head>`                                 |
| `apps/web/app/(publico)/layout.tsx`    | perde a`<div data-theme>`                                 |

**Shell do painel (Tarefa 4)**

| Arquivo                                                | Responsabilidade                                      |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `apps/web/src/painel/ProvedorDoPainel.tsx`           | o`api.barbeiro` em contexto; aceita dublê no teste |
| `apps/web/src/painel/SessaoDoPainel.tsx`             | guarda, perfil em contexto,`sair()`                 |
| `apps/web/src/painel/NavegacaoDoPainel.tsx`          | barra superior, links, botão de tema                 |
| `apps/web/app/(painel)/painel/(guardado)/layout.tsx` | monta os três acima                                  |
| `apps/web/tests/ajudantes/navegacao.ts`              | passa a carregar`params` e `pathname`             |

**Componentes novos (nas tarefas que os usam)**

| Arquivo                                        | Tarefa |
| ---------------------------------------------- | ------ |
| `apps/web/src/componentes/Estatistica.tsx`   | 6      |
| `apps/web/src/componentes/GradeDeAgenda.tsx` | 7      |
| `apps/web/src/componentes/Tabela.tsx`        | 10     |

**Telas** — todas em `apps/web/src/telas/painel/`, com a `page.tsx`
correspondente em `apps/web/app/(painel)/painel/…` servindo só de
casca. Uma tela por arquivo, um teste por tela.

| Tela                             | Rota                                  | Tarefa |
| -------------------------------- | ------------------------------------- | ------ |
| `EntrarNoPainel.tsx`           | `/painel/entrar`                    | 5      |
| `DashboardDoDia.tsx`           | `/painel`                           | 6      |
| `AgendaDoDia.tsx`              | `/painel/agenda`                    | 7      |
| `NovoAgendamento.tsx`          | `/painel/agendamentos/novo`         | 8      |
| `DetalheDoAgendamento.tsx`     | `/painel/agendamentos/[id]`         | 9      |
| `ListaDeClientes.tsx`          | `/painel/clientes`                  | 10     |
| `CadastroDeCliente.tsx`        | `/painel/clientes/novo`             | 10     |
| `DetalheDoCliente.tsx`         | `/painel/clientes/[id]`             | 10     |
| `ListaDeServicos.tsx`          | `/painel/servicos`                  | 11     |
| `CadastroDeServico.tsx`        | `/painel/servicos/novo` e `/[id]` | 11     |
| `ConfiguracoesDaBarbearia.tsx` | `/painel/configuracoes`             | 12     |

**Limpeza (Tarefa 13):** `apps/web/app/primitivos/` sai;
`docs/screens.md` e `docs/roadmap.md` registram as doze rotas.

---

### Task 1: Reparar o dublê para o escopo do barbeiro

O dublê guarda **um** cliente: `estado.cliente` é objeto único,
`clientes()` devolve `[estado.cliente]`, `criarCliente` sobrescreve e
`cliente(id)` responde 404 para qualquer outro id. Lista, busca e
detalhe de clientes não têm como ser testados assim. `signup()` também
ignora o que recebe, e a tela de criar barbearia precisa ver o slug que
enviou.

`estado.cliente` **continua existindo** — é o cliente logado que o
escopo `clientes-me` usa, e as oito telas do sub-projeto B dependem
dele. O que entra é `estado.clientes`, a lista que o barbeiro enxerga.

**Files:**

- Modify: `packages/api-client/src/falso.ts`
- Test: `packages/api-client/tests/falso.test.ts`

**Interfaces:**

- Consumes: nada de tarefas anteriores.
- Produces:
  - `EstadoFalso.clientes: ClienteSerializado[]` — semeável, padrão
    `[CLIENTE_PADRAO]`.
  - `barbeiro.clientes(busca?: string): Promise<ClienteSerializado[]>`
    filtrando por nome (sem acento, sem caixa) e por telefone (dígito a
    dígito).
  - `barbeiro.criarCliente(novo)` empurra na lista e devolve o criado;
    telefone repetido lança
    `new ErroDaApi(409, "conflito", "esse telefone já tem cadastro")`.
  - `barbeiro.cliente(id)` acha na lista.
  - `barbeiro.signup(nova)` devolve `SessaoBarbeiro` com o nome e o slug
    enviados.
  - `AgendamentoSerializado & { clienteId?: string }` no estado, para
    `comCliente` resolver quem é o cliente de cada agendamento.

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/api-client/tests/falso.test.ts` se não existir; se
existir, acrescentar o `describe` abaixo.

```ts
import { describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "../src";

describe("dublê — escopo do barbeiro", () => {
  it("lista todos os clientes semeados", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    expect(await falso.barbeiro.clientes()).toHaveLength(2);
  });

  it("filtra por nome sem se importar com caixa", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achados = await falso.barbeiro.clientes("marcos");

    expect(achados.map((c) => c.id)).toEqual(["c2"]);
  });

  it("filtra por telefone comparando dígito a dígito", async () => {
    // A API compara com regexp_replace no SQL: quem digita 999990002
    // acha (11) 99999-0002, sem parêntese nem traço.
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achados = await falso.barbeiro.clientes("999990002");

    expect(achados.map((c) => c.id)).toEqual(["c2"]);
  });

  it("cria cliente novo e o devolve na lista", async () => {
    const falso = criarApiClientFalso({ clientes: [] });

    const criado = await falso.barbeiro.criarCliente({
      nome: "Ana Souza",
      telefone: "(11) 98888-7777",
    });

    expect(criado.nome).toBe("Ana Souza");
    expect(await falso.barbeiro.clientes()).toHaveLength(1);
  });

  it("recusa telefone já cadastrado com conflito", async () => {
    // É o caso comum do walk-in: quem chega já existe, criado pelo
    // upsert do agendamento público.
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
      ],
    });

    await expect(
      falso.barbeiro.criarCliente({ nome: "João", telefone: "(11) 99999-0001" })
    ).rejects.toMatchObject({ codigo: "conflito" });
  });

  it("acha cliente por id na lista inteira", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achado = await falso.barbeiro.cliente("c2");

    expect(achado.nome).toBe("Marcos Reis");
    expect(achado.agendamentos).toEqual([]);
  });

  it("devolve 404 para cliente que não existe", async () => {
    const falso = criarApiClientFalso({ clientes: [] });

    await expect(falso.barbeiro.cliente("c9")).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("o signup devolve a barbearia que foi enviada", async () => {
    const falso = criarApiClientFalso();

    const sessao = await falso.barbeiro.signup({
      barbearia: { nome: "Barbearia do Zé", slug: "barbearia-do-ze" },
      barbeiro: { nome: "Zé", email: "ze@barbearia.com", senha: "segredo123" },
    });

    expect(sessao.barbearia.slug).toBe("barbearia-do-ze");
    expect(sessao.barbearia.nome).toBe("Barbearia do Zé");
    expect(sessao.barbeiro.nome).toBe("Zé");
  });

  it("o agendamento do barbeiro carrega o cliente que ele escolheu", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const criado = await falso.barbeiro.criarAgendamento({
      barbeiroId: "bb1",
      clienteId: "c2",
      servicoIds: ["s1"],
      data: "2026-09-08",
      horaInicio: "09:00",
    });

    expect(criado.cliente.nome).toBe("Marcos Reis");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/api-client exec vitest run tests/falso.test.ts`
Expected: FAIL — `clientes` não existe em `EstadoFalso`, o filtro não
filtra, o signup devolve `gr-barber`.

- [ ] **Step 3: Acrescentar a lista ao estado**

Em `packages/api-client/src/falso.ts`, na interface `EstadoFalso`, ao
lado de `cliente`:

```ts
export interface EstadoFalso {
  perfil: PerfilPublicoBarbearia;
  servicos: ServicoSerializado[];
  horariosLivres: string[];
  diasComVaga: Record<string, boolean>;
  // O `clienteId` é do dublê, não da API: AgendamentoSerializado não o
  // tem, e sem ele `comCliente` não sabe qual dos clientes da lista
  // pertence a cada agendamento. Opcional para não quebrar as sementes
  // do sub-projeto B, que não o informam.
  agendamentos: (AgendamentoSerializado & { clienteId?: string })[];
  // O cliente logado, que o escopo `clientes-me` usa.
  cliente: ClienteSerializado;
  // Os clientes que o barbeiro enxerga. Lista separada porque as duas
  // perguntas são diferentes: "quem sou eu" e "quem são os meus".
  clientes: ClienteSerializado[];
}
```

E no corpo de `criarApiClientFalso`, junto das outras cópias:

```ts
    cliente: semente.cliente ?? CLIENTE_PADRAO,
    clientes: [...(semente.clientes ?? [CLIENTE_PADRAO])],
```

- [ ] **Step 4: Trocar os quatro métodos e o `comCliente`**

Ainda em `falso.ts`. O `comCliente`:

```ts
  function comCliente(
    agendamento: AgendamentoSerializado & { clienteId?: string }
  ): AgendamentoComCliente {
    const dono =
      estado.clientes.find((c) => c.id === agendamento.clienteId) ??
      estado.cliente;
    return { ...agendamento, cliente: dono };
  }
```

O `novoAgendamento` passa a guardar o `clienteId` que recebeu —
acrescente `clienteId?: string` ao tipo do parâmetro `entrada` e
`clienteId: entrada.clienteId` ao objeto `agendamento` construído.

Um ajudante de busca, junto dos outros (`duracaoDe`, `editarServico`):

```ts
  // Nome sem acento e sem caixa; telefone dígito a dígito. É o que a
  // busca de clientes da API faz em SQL cru com regexp_replace.
  function combina(cliente: ClienteSerializado, busca: string): boolean {
    const alvo = busca.trim();
    if (!alvo) return true;

    const semAcento = (texto: string) =>
      texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (semAcento(cliente.nome).includes(semAcento(alvo))) return true;

    const digitos = alvo.replace(/\D/g, "");
    return (
      digitos.length > 0 &&
      cliente.telefone.replace(/\D/g, "").includes(digitos)
    );
  }
```

Os métodos do bloco `barbeiro`:

```ts
      async clientes(busca?: string) {
        return estado.clientes.filter((c) => combina(c, busca ?? ""));
      },
      async criarCliente(novo: NovoCliente) {
        const repetido = estado.clientes.some(
          (c) => c.telefone.replace(/\D/g, "") === novo.telefone.replace(/\D/g, "")
        );
        if (repetido) {
          throw new ErroDaApi(409, "conflito", "esse telefone já tem cadastro");
        }
        const cliente: ClienteSerializado = {
          id: `c${estado.clientes.length + 1}`,
          nome: novo.nome,
          telefone: novo.telefone,
          email: novo.email ?? null,
          temConta: false,
        };
        estado.clientes.push(cliente);
        return cliente;
      },
      async cliente(id: string) {
        const achado = estado.clientes.find((c) => c.id === id);
        if (!achado) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        return {
          ...achado,
          agendamentos: estado.agendamentos.filter((a) => a.clienteId === id),
        };
      },
      async atualizarCliente(id: string, edicao: EdicaoDoCliente) {
        const indice = estado.clientes.findIndex((c) => c.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        estado.clientes[indice] = { ...estado.clientes[indice], ...edicao };
        return estado.clientes[indice];
      },
```

E o `signup`, que precisa refletir o que recebeu:

```ts
      async signup(nova: NovaBarbearia) {
        return {
          token: "jwt-falso-barbeiro",
          barbeiro: {
            id: "bb1",
            nome: nova.barbeiro.nome,
            email: nova.barbeiro.email,
          },
          barbearia: {
            id: estado.perfil.id,
            nome: nova.barbearia.nome,
            slug: nova.barbearia.slug,
          },
        };
      },
```

- [ ] **Step 5: Rodar o arquivo e depois a suíte inteira**

Run: `pnpm --filter @barchop/api-client exec vitest run tests/falso.test.ts`
Expected: PASS

Run: `pnpm test`
Expected: PASS — os 463 testes de hoje continuam verdes. Se algum teste
de tela do sub-projeto B quebrar, é sinal de que `estado.cliente` foi
substituído em vez de acompanhado; desfaça a substituição.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/falso.ts packages/api-client/tests/falso.test.ts
git commit -m "test(api-client): let the double hold a list of clients

The barber's Clientes screen searches, lists and opens clients, and the
double kept exactly one — clientes() returned a single-element array and
criarCliente overwrote it. estado.cliente stays as the logged-in client
the clientes-me scope uses; estado.clientes is the new list. signup now
echoes the barbershop it was given, and agendamentos remember which
client they belong to."
```

---

### Task 2: Segunda chave na sessão do barbeiro

`GET /me` devolve `PerfilBarbeiro`, que tem `barbeariaId` mas não tem
slug. O slug é necessário: `publico.disponibilidadeDoDia` é rota por
slug e a tela de novo agendamento depende dela. Ele chega uma vez só, no
`SessaoBarbeiro` do login e do signup.

**Files:**

- Modify: `apps/web/src/sessao/armazenamento.ts`
- Test: `apps/web/tests/sessao/armazenamento.test.ts`

**Interfaces:**

- Consumes: `Sessao`, `sessaoNaChave`, `sessaoDoBarbeiro` (já existem).
- Produces:
  - `sessaoDaBarbearia: Sessao` na chave `sessao.barbearia`.
  - `encerrarSessaoDoBarbeiro(): void` limpando as duas.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `apps/web/tests/sessao/armazenamento.test.ts`:

```ts
  it("guarda o slug da barbearia numa chave própria", () => {
    sessaoDaBarbearia.gravar("gr-barber");

    expect(localStorage.getItem("sessao.barbearia")).toBe("gr-barber");
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
  });

  it("encerrar a sessão do barbeiro limpa token e slug", () => {
    // Duas chaves, um logout: limpar só o token deixaria o slug de uma
    // barbearia sendo lido pela sessão da seguinte.
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");

    encerrarSessaoDoBarbeiro();

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
  });
```

Acrescente `sessaoDaBarbearia` e `encerrarSessaoDoBarbeiro` ao import do
arquivo de teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/sessao/armazenamento.test.ts`
Expected: FAIL — `sessaoDaBarbearia is not defined`.

- [ ] **Step 3: Implementar**

No fim de `apps/web/src/sessao/armazenamento.ts`:

```ts
// O slug não vem do GET /me, que devolve só barbeariaId — ele chega no
// SessaoBarbeiro do login e do signup, e a tela de novo agendamento
// precisa dele para a disponibilidade, que é rota pública por slug.
export const sessaoDaBarbearia = sessaoNaChave("sessao.barbearia");

// Uma função e não duas chamadas soltas: um logout que esquecesse o
// slug deixaria lixo que a próxima sessão leria como se fosse dela.
export function encerrarSessaoDoBarbeiro(): void {
  sessaoDoBarbeiro.limpar();
  sessaoDaBarbearia.limpar();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/sessao/armazenamento.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/sessao/armazenamento.ts apps/web/tests/sessao/armazenamento.test.ts
git commit -m "feat(web): keep the barbershop slug beside the barber's token

GET /me answers with barbeariaId and no slug, but availability is a
public route addressed by slug, and the panel's new-appointment screen
needs it. The slug arrives once, in the SessaoBarbeiro the login and
signup return, so it is stored next to the token — and a single
encerrarSessaoDoBarbeiro clears both."
```

---

### Task 3: Tema claro e escuro que funciona nos dois grupos

Hoje o escuro só existe dentro de `@media (prefers-color-scheme: dark)`
no `:root`, e nada lê `[data-theme]`. Duas consequências: a troca manual
não tem como existir, e o `data-theme="light"` que
`(publico)/layout.tsx` já põe numa `<div>` não faz nada — o fluxo do
cliente escurece num celular no modo escuro, contra o que a spec do
sub-projeto B decidiu.

**Files:**

- Create: `apps/web/src/painel/tema.ts`
- Create: `apps/web/tests/painel/tema.test.ts`
- Modify: `apps/web/app/tokens-css.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/(publico)/layout.tsx`
- Test: `apps/web/tests/app/tokens-css.test.ts`

**Interfaces:**

- Consumes: `cssDeTokens` (já existe).
- Produces:
  - `type Tema = "claro" | "escuro"`
  - `CHAVE_DO_TEMA = "painel.tema"`
  - `lerTema(): Tema | null`
  - `gravarTema(tema: Tema): void`
  - `aplicarTema(tema: Tema): void` — escreve `data-theme` no `<html>`
  - `temaDoSistema(): Tema`
  - `SCRIPT_DE_TEMA: string` — o conteúdo do `<script>` inline

- [ ] **Step 1: Escrever os testes que falham**

`apps/web/tests/painel/tema.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  aplicarTema,
  CHAVE_DO_TEMA,
  gravarTema,
  lerTema,
  SCRIPT_DE_TEMA,
} from "../../src/painel/tema";

describe("tema do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("sem escolha gravada, lerTema devolve null", () => {
    expect(lerTema()).toBeNull();
  });

  it("grava e lê a escolha", () => {
    gravarTema("escuro");

    expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    expect(lerTema()).toBe("escuro");
  });

  it("ignora valor estragado no localStorage", () => {
    // Chave editada à mão ou sobrevivente de uma versão anterior não
    // pode virar data-theme="banana" no <html>.
    localStorage.setItem(CHAVE_DO_TEMA, "banana");

    expect(lerTema()).toBeNull();
  });

  it("aplicarTema escreve no <html>, não numa div", () => {
    // O body lê var(--cor-paper) do :root. Custom property redeclarada
    // numa div não chega nele, e o fundo da página ficaria do tema
    // errado em volta do conteúdo certo.
    aplicarTema("escuro");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("o script inline decide pelo caminho da URL", () => {
    expect(SCRIPT_DE_TEMA).toContain("/painel");
    expect(SCRIPT_DE_TEMA).toContain("data-theme");
  });
});
```

`apps/web/tests/app/tokens-css.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cssDeTokens } from "../../app/tokens-css";

describe("css de tokens", () => {
  it("tem o bloco da escolha manual por escuro", () => {
    expect(cssDeTokens).toContain('[data-theme="dark"]');
  });

  it("a media query cede para quem escolheu claro", () => {
    // Sem a guarda, um barbeiro que escolheu claro continua escurecendo
    // num sistema escuro: o @media venceria.
    expect(cssDeTokens).toContain(':root:not([data-theme="light"])');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/tema.test.ts tests/app/tokens-css.test.ts`
Expected: FAIL — o módulo `tema` não existe e `cssDeTokens` não tem os
seletores.

- [ ] **Step 3: Escrever `src/painel/tema.ts`**

```ts
export type Tema = "claro" | "escuro";

export const CHAVE_DO_TEMA = "painel.tema";

// O atributo é em inglês porque é o que o CSS lê, e o que o resto do
// mundo espera encontrar num data-theme.
const ATRIBUTO: Record<Tema, string> = { claro: "light", escuro: "dark" };

export function lerTema(): Tema | null {
  if (typeof window === "undefined") return null;
  const guardado = window.localStorage.getItem(CHAVE_DO_TEMA);
  return guardado === "claro" || guardado === "escuro" ? guardado : null;
}

export function gravarTema(tema: Tema): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_DO_TEMA, tema);
}

export function temaDoSistema(): Tema {
  if (typeof window === "undefined") return "claro";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "escuro"
    : "claro";
}

// No <html>, e não numa div do layout do grupo: o body pinta o fundo da
// página lendo var(--cor-paper) do :root, e custom property redeclarada
// numa div não chega até ele.
export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = ATRIBUTO[tema];
}

// Roda no <head>, antes da primeira pintura — daí ser string e não
// componente. `location.pathname` é a única informação de rota
// disponível antes de o React montar, e é o que evita o pisca.
export const SCRIPT_DE_TEMA = `(function(){try{
  var noPainel = location.pathname === "/painel" || location.pathname.indexOf("/painel/") === 0;
  if (!noPainel) { document.documentElement.dataset.theme = "light"; return; }
  var guardado = localStorage.getItem("${CHAVE_DO_TEMA}");
  var tema = guardado === "claro" || guardado === "escuro" ? guardado : null;
  if (!tema) {
    tema = matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
    localStorage.setItem("${CHAVE_DO_TEMA}", tema);
  }
  document.documentElement.dataset.theme = tema === "escuro" ? "dark" : "light";
}catch(e){}})();`;
```

- [ ] **Step 4: Trocar os blocos em `app/tokens-css.ts`**

Substituir a exportação `cssDeTokens` e o comentário acima dela:

```ts
// Três blocos, não dois. Sem a guarda :not([data-theme="light"]), quem
// escolheu claro continua escurecendo num sistema escuro, porque o
// @media venceria. Sem [data-theme="dark"], escolher escuro não faz
// nada num sistema claro. Quem escreve o atributo é o script inline do
// layout raiz — ver src/painel/tema.ts.
export const cssDeTokens = `:root {
${varsDeCores(colors.light)}
${varsDeRaio}
${varsDeEspaco}
${varsDeBorda}
${varsDeTexto}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${varsDeCores(colors.dark)}
  }
}

[data-theme="dark"] {
${varsDeCores(colors.dark)}
}`;
```

- [ ] **Step 5: Pôr o script no layout raiz e tirar a div do público**

Em `apps/web/app/layout.tsx`, dentro do `<head>`, **antes** do
`<style>`:

```tsx
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
```

com `import { SCRIPT_DE_TEMA } from "../src/painel/tema";` no topo.

Em `apps/web/app/(publico)/layout.tsx`, trocar o corpo por:

```tsx
import type { ReactNode } from "react";

// O fluxo do cliente é sempre claro, mesmo com o sistema em escuro: é
// uma página que chega por link de WhatsApp pra quem não conhece o
// produto. Quem trava isso é o script de tema do layout raiz, que
// escreve data-theme="light" no <html> em toda rota fora de /painel —
// a <div data-theme> que ficava aqui era inerte, porque o body lê as
// custom properties do :root e não as de uma div.
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/tema.test.ts tests/app/tokens-css.test.ts`
Expected: PASS

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/painel/tema.ts apps/web/tests/painel/tema.test.ts apps/web/tests/app/tokens-css.test.ts apps/web/app/tokens-css.ts apps/web/app/layout.tsx "apps/web/app/(publico)/layout.tsx"
git commit -m "feat(web): make data-theme actually switch the palette

tokens-css defined dark only inside a media query on :root, so nothing
read data-theme — the public group's data-theme=\"light\" div was inert
and the client flow went dark on a dark-mode phone, the opposite of what
its spec decided. The attribute now goes on <html>, written by an inline
script that decides from location.pathname before first paint, and the
media query yields to an explicit light choice."
```

---

### Task 4: O shell do painel

Guarda, perfil em contexto, navegação, botão de tema, e a árvore de
rotas que o prefixo `/painel` exige. `/painel/entrar` fica fora do
subgrupo guardado — dentro dele, a guarda redirecionaria a tela para ela
mesma.

**Files:**

- Create: `apps/web/src/painel/ProvedorDoPainel.tsx`
- Create: `apps/web/src/painel/SessaoDoPainel.tsx`
- Create: `apps/web/src/painel/NavegacaoDoPainel.tsx`
- Create: `apps/web/src/painel/NavegacaoDoPainel.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/layout.tsx`
- Modify: `apps/web/tests/ajudantes/navegacao.ts`
- Modify: `apps/web/tests/setup.ts`
- Test: `apps/web/tests/painel/sessao-do-painel.test.tsx`

**Interfaces:**

- Consumes: `criarApiClient`, `sessaoDoBarbeiro`, `sessaoDaBarbearia`,
  `encerrarSessaoDoBarbeiro` (Tarefa 2), `lerTema`, `gravarTema`,
  `aplicarTema`, `temaDoSistema` (Tarefa 3).
- Produces:
  - `apiDoPainel(fetchInjetado?)` em `src/sessao/cliente-da-api.ts`,
    devolvendo `{ barbeiro, publico }`
  - `type ApiDoPainel = ReturnType<typeof apiDoPainel>`
  - `ProvedorDoPainel({ children, valor? }: { children: ReactNode; valor?: ApiDoPainel })`
  - `useApiDoPainel(): ApiDoPainel`
  - `SessaoDoPainel({ children })` — guarda e provê o contexto
  - `usePainel(): { perfil: PerfilBarbeiro; slug: string; sair: () => void }`
  - `NavegacaoDoPainel()` — barra superior
  - `navegacaoFalsa.params: Record<string, string>` e
    `navegacaoFalsa.pathname: string`, ambos reiniciados por
    `redefinir()`

- [ ] **Step 1: Estender o ajudante de navegação**

`apps/web/tests/ajudantes/navegacao.ts` — as rotas do painel têm `[id]`,
e a navegação precisa de `usePathname` para marcar o link ativo:

```ts
import { vi } from "vitest";

// As telas leem a URL pelos hooks do Next, que não existem fora do
// roteador. Este módulo guarda o estado que o mock devolve, e o
// setup.ts é quem faz o vi.mock — o mock precisa ser içado pro topo do
// módulo, e um helper importado não seria içado junto.
export const navegacaoFalsa = {
  slug: "gr-barber",
  // As rotas do painel têm [id]; o slug continua separado porque as
  // telas do cliente o leem por nome.
  params: {} as Record<string, string>,
  pathname: "/",
  query: new URLSearchParams(),
  push: vi.fn((_destino: string) => {}),
  replace: vi.fn((_destino: string) => {}),
  redefinir(
    entrada: {
      slug?: string;
      params?: Record<string, string>;
      pathname?: string;
      query?: Record<string, string>;
    } = {}
  ) {
    this.slug = entrada.slug ?? "gr-barber";
    this.params = entrada.params ?? {};
    this.pathname = entrada.pathname ?? "/";
    this.query = new URLSearchParams(entrada.query ?? {});
    this.push.mockClear();
    this.replace.mockClear();
  },
};
```

Em `apps/web/tests/setup.ts`, o `vi.mock` passa a expor os dois novos:

```ts
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: navegacaoFalsa.slug, ...navegacaoFalsa.params }),
  useSearchParams: () => navegacaoFalsa.query,
  usePathname: () => navegacaoFalsa.pathname,
  useRouter: () => rotadorFalso,
}));
```

- [ ] **Step 2: Escrever o teste que falha**

`apps/web/tests/painel/sessao-do-painel.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel, usePainel } from "../../src/painel/SessaoDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function Espiao() {
  const { perfil, slug, sair } = usePainel();
  return (
    <div>
      <span>{perfil.nome}</span>
      <span>slug: {slug}</span>
      <button onClick={sair}>Sair</button>
    </div>
  );
}

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <Espiao />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

describe("sessão do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("sem token, manda pra tela de entrar e não renderiza o conteúdo", async () => {
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar")
    );
    expect(screen.queryByText("Rafael")).not.toBeInTheDocument();
  });

  it("com token, carrega o perfil uma vez e o entrega às telas", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");

    montar();

    expect(await screen.findByText("Rafael")).toBeInTheDocument();
    expect(screen.getByText("slug: gr-barber")).toBeInTheDocument();
  });

  it("401 no carregamento do perfil encerra a sessão e volta pra entrar", async () => {
    // 401 no meio da sessão é evento normal, não canto raro: o token
    // vale 7 dias e o hook da API consulta o banco a cada requisição.
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    const falso = criarApiClientFalso();
    falso.barbeiro.meuPerfil = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };

    montar(falso);

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBeNull());
    expect(sessaoDaBarbearia.ler()).toBeNull();
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
  });

  it("sair limpa as duas chaves", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Sair" }));

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/sessao-do-painel.test.tsx`
Expected: FAIL — os módulos `ProvedorDoPainel` e `SessaoDoPainel` não
existem.

- [ ] **Step 4: Escrever a fábrica e `src/painel/ProvedorDoPainel.tsx`**

Primeiro a fábrica, em `src/sessao/cliente-da-api.ts`, ao lado das duas
que já existem:

```ts
// Dois escopos, e não só `.barbeiro`: a disponibilidade é rota pública
// por slug e não tem gêmea no escopo do barbeiro, mas a tela de novo
// agendamento precisa dela. Montar um segundo client dentro da tela
// duplicaria baseUrl e aoExpirarSessao. O `apiDoBarbeiro` acima
// continua para quem só quer o escopo protegido.
export function apiDoPainel(fetchInjetado?: typeof globalThis.fetch) {
  const client = criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessaoDoBarbeiro.ler(),
    aoExpirarSessao: () => sessaoDoBarbeiro.limpar(),
    fetch: fetchInjetado,
  });
  return { barbeiro: client.barbeiro, publico: client.publico };
}
```

Depois o provedor, que espelha o `ProvedorDaApi` do fluxo do cliente
mas sem slug de rota — o painel não tem `[slug]` na URL:

```tsx
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { apiDoPainel } from "../sessao/cliente-da-api";

// O escopo do cliente logado fica de fora: o painel nunca chama rota de
// `clientes-me`, e expor o client inteiro convidaria a isso.
export type ApiDoPainel = ReturnType<typeof apiDoPainel>;

const Contexto = createContext<ApiDoPainel | null>(null);

// `valor` existe pro teste passar o dublê. Em produção ninguém informa,
// e o provedor monta o client de verdade uma vez só — senão cada render
// criaria outro.
export function ProvedorDoPainel({
  children,
  valor,
}: {
  children: ReactNode;
  valor?: ApiDoPainel;
}) {
  const api = useMemo(() => valor ?? apiDoPainel(), [valor]);

  return <Contexto.Provider value={api}>{children}</Contexto.Provider>;
}

export function useApiDoPainel(): ApiDoPainel {
  const api = useContext(Contexto);
  if (!api) {
    throw new Error("useApiDoPainel precisa estar dentro de um ProvedorDoPainel");
  }
  return api;
}
```

- [ ] **Step 5: Escrever `src/painel/SessaoDoPainel.tsx`**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ErroDaApi } from "@barchop/api-client";
import type { PerfilBarbeiro } from "@barchop/types";
import {
  encerrarSessaoDoBarbeiro,
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../sessao/armazenamento";
import { useApiDoPainel } from "./ProvedorDoPainel";

interface Painel {
  perfil: PerfilBarbeiro;
  slug: string;
  sair: () => void;
}

const Contexto = createContext<Painel | null>(null);

// A guarda vive aqui e não em cada tela: guarda por repetição depende de
// ninguém esquecer o hook, e quem esquecesse publicaria a tela sem
// sessão em silêncio. É o mesmo motivo de o app.ts da API usar escopo
// com onRequest em vez de pendurar o hook rota a rota.
export function SessaoDoPainel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const [perfil, setPerfil] = useState<PerfilBarbeiro | null>(null);

  const sair = useCallback(() => {
    encerrarSessaoDoBarbeiro();
    router.replace("/painel/entrar");
  }, [router]);

  useEffect(() => {
    if (!sessaoDoBarbeiro.ler()) {
      router.replace("/painel/entrar");
      return;
    }

    let vivo = true;
    api.barbeiro
      .meuPerfil()
      .then((resposta) => {
        if (vivo) setPerfil(resposta);
      })
      .catch((causa: unknown) => {
        if (!vivo) return;
        // Qualquer falha ao provar quem é o chamador termina do mesmo
        // jeito: sem perfil não há painel. O 401 é o caso comum — o
        // token vale 7 dias e o hook da API consulta o banco a cada
        // requisição, então desativar um barbeiro invalida na hora.
        if (causa instanceof ErroDaApi) sair();
        else sair();
      });

    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  // Nada renderiza antes do perfil: uma tela que aparecesse e sumisse
  // seria pior do que uma que demora.
  if (!perfil) return null;

  return (
    <Contexto.Provider
      value={{ perfil, slug: sessaoDaBarbearia.ler() ?? "", sair }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function usePainel(): Painel {
  const painel = useContext(Contexto);
  if (!painel) {
    throw new Error("usePainel precisa estar dentro de um SessaoDoPainel");
  }
  return painel;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/sessao-do-painel.test.tsx`
Expected: PASS

- [ ] **Step 7: Escrever a navegação**

`apps/web/src/painel/NavegacaoDoPainel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { aplicarTema, gravarTema, lerTema, temaDoSistema, type Tema } from "./tema";
import { usePainel } from "./SessaoDoPainel";
import estilos from "./NavegacaoDoPainel.module.css";

const LINKS = [
  { href: "/painel", rotulo: "Hoje" },
  { href: "/painel/agenda", rotulo: "Agenda" },
  { href: "/painel/clientes", rotulo: "Clientes" },
  { href: "/painel/servicos", rotulo: "Serviços" },
  { href: "/painel/configuracoes", rotulo: "Configurações" },
];

export function NavegacaoDoPainel() {
  const { slug, sair } = usePainel();
  const caminho = usePathname();
  const [tema, setTema] = useState<Tema>("claro");

  // O script do <head> já pintou; isto só põe o React em dia com o que
  // está no <html>, pra o botão mostrar o rótulo certo.
  useEffect(() => setTema(lerTema() ?? temaDoSistema()), []);

  function trocarTema() {
    const proximo: Tema = tema === "claro" ? "escuro" : "claro";
    setTema(proximo);
    gravarTema(proximo);
    aplicarTema(proximo);
  }

  return (
    <header className={estilos.barra}>
      <strong className={estilos.marca}>{slug}</strong>
      <nav className={estilos.links}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            // O "Hoje" é /painel exato: com startsWith, ele ficaria
            // ativo em todas as rotas do painel ao mesmo tempo.
            aria-current={
              (link.href === "/painel" ? caminho === link.href : caminho.startsWith(link.href))
                ? "page"
                : undefined
            }
          >
            {link.rotulo}
          </Link>
        ))}
      </nav>
      <button type="button" onClick={trocarTema}>
        {tema === "claro" ? "Modo escuro" : "Modo claro"}
      </button>
      <button type="button" onClick={sair}>
        Sair
      </button>
    </header>
  );
}
```

`apps/web/src/painel/NavegacaoDoPainel.module.css`:

```css
.barra {
  display: flex;
  align-items: center;
  gap: var(--espaco-md);
  padding: var(--espaco-md) var(--espaco-lg);
  border-bottom: var(--borda-media) solid var(--cor-ink);
  background: var(--cor-paper);
}

.marca {
  font-family: var(--fonte-display), system-ui, sans-serif;
  font-size: var(--texto-lg);
}

.links {
  display: flex;
  gap: var(--espaco-md);
  margin-inline-end: auto;
}

.links a[aria-current="page"] {
  text-decoration: underline;
}
```

Se algum nome de token não existir em `packages/design-tokens`, use o
que existir — confira `packages/design-tokens/src/index.ts` antes de
escrever, não invente escala.

- [ ] **Step 8: Escrever o layout guardado**

`apps/web/app/(painel)/painel/(guardado)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { NavegacaoDoPainel } from "../../../../src/painel/NavegacaoDoPainel";
import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../../src/painel/SessaoDoPainel";

// O subgrupo (guardado) não entra no caminho: este layout vale de
// /painel pra baixo, menos /painel/entrar, que fica fora dele de
// propósito — lá dentro a guarda redirecionaria a tela pra ela mesma.
export default function LayoutGuardado({ children }: { children: ReactNode }) {
  return (
    <ProvedorDoPainel>
      <SessaoDoPainel>
        <NavegacaoDoPainel />
        <main>{children}</main>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
}
```

Antes de escrever, confirme a forma dos route groups aninhados na
documentação instalada — `apps/web/AGENTS.md` manda ler
`node_modules/next/dist/docs/` porque este Next difere do que o modelo
aprendeu.

- [ ] **Step 9: Rodar a suíte e o type-check**

Run: `pnpm test`
Expected: PASS — inclusive os testes do sub-projeto B, que o
`navegacao.ts` alterado atravessa.

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/painel apps/web/app/\(painel\) apps/web/tests/ajudantes/navegacao.ts apps/web/tests/setup.ts apps/web/tests/painel/sessao-do-painel.test.tsx
git commit -m "feat(web): guard the panel in one place

The layout of the (guardado) subgroup redirects to /painel/entrar when
there is no token, loads the profile once, and puts it plus the slug in
context. Per-screen guards would depend on nobody forgetting the hook,
and whoever forgot would publish a screen without a session in silence —
the same reason the API's app.ts uses a scope with onRequest instead of
hanging the hook route by route."
```

---

### Task 5: `/painel/entrar` — entrar e criar barbearia

Duas ações explícitas na mesma tela, como a tela de entrar do cliente.
A de criar barbearia não está no `docs/screens.md`: como C vem antes de
D, entre o fim deste sub-projeto e o do próximo o painel é o único
caminho pelo qual uma barbearia pode existir.

**Files:**

- Create: `apps/web/src/telas/painel/EntrarNoPainel.tsx`
- Create: `apps/web/src/telas/painel/EntrarNoPainel.module.css`
- Create: `apps/web/app/(painel)/painel/entrar/page.tsx`
- Test: `apps/web/tests/telas/painel/entrar-no-painel.test.tsx`

**Interfaces:**

- Consumes: `ProvedorDoPainel`, `useApiDoPainel` (Tarefa 4),
  `sessaoDoBarbeiro`, `sessaoDaBarbearia` (Tarefa 2), `Botao`, `Campo`,
  `Aviso`.
- Produces: `EntrarNoPainel()`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { EntrarNoPainel } from "../../../src/telas/painel/EntrarNoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <EntrarNoPainel />
    </ProvedorDoPainel>
  );
  return falso;
}

describe("entrar no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/entrar" });
  });

  it("entra e guarda token e slug", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-barbeiro"));
    // O slug é o que a tela de novo agendamento vai usar pra chamar a
    // disponibilidade, que é rota pública por slug.
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("traduz nao_autenticado em email ou senha incorretos", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.login = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "errada12");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/e-mail ou senha incorretos/i)).toBeInTheDocument();
  });

  it("cria a barbearia e entra com o slug enviado", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "barbearia-do-ze");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    await waitFor(() => expect(sessaoDaBarbearia.ler()).toBe("barbearia-do-ze"));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("recusa slug fora do formato antes de chamar a API", async () => {
    // A API responde 400 do pattern ^[a-z0-9-]{3,80}$; barrar aqui
    // mantém o erro no campo em vez de virar aviso genérico.
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.signup = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "Zé Barbearia!");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    expect(await screen.findByText(/letras minúsculas, números e hífen/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("traduz conflito sem dizer qual dos dois campos repetiu", async () => {
    // A dívida do 409 já é conhecida; a tela não a amplia dizendo se foi
    // o e-mail ou o endereço.
    const falso = criarApiClientFalso();
    falso.barbeiro.signup = async () => {
      throw new ErroDaApi(409, "conflito", "");
    };
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "barbearia-do-ze");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    expect(
      await screen.findByText(/e-mail ou esse endereço já está em uso/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/entrar-no-painel.test.tsx`
Expected: FAIL — `EntrarNoPainel` não existe.

- [ ] **Step 3: Implementar a tela**

`apps/web/src/telas/painel/EntrarNoPainel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoBarbeiro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../sessao/armazenamento";
import estilos from "./EntrarNoPainel.module.css";

// O mesmo do pattern de apps/api/src/routers/auth.ts:23. Barrar aqui
// mantém o erro no campo, em vez de voltar 400 do AJV em inglês.
const PADRAO_SLUG = /^[a-z0-9-]{3,80}$/;

export function EntrarNoPainel() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [criando, setCriando] = useState(false);
  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroSlug, setErroSlug] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function submeter() {
    setAviso(undefined);
    setErroSlug(undefined);

    if (criando && !PADRAO_SLUG.test(slug)) {
      setErroSlug("Use letras minúsculas, números e hífen, de 3 a 80 caracteres");
      return;
    }

    setEnviando(true);

    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = criando
        ? await api.barbeiro.signup({
            barbearia: { nome: nomeDaBarbearia.trim(), slug },
            barbeiro: { nome: nome.trim(), email, senha },
          })
        : await api.barbeiro.login({ email, senha });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "nao_autenticado") {
        setAviso("E-mail ou senha incorretos.");
      } else if (erro.codigo === "conflito") {
        // Sem dizer qual dos dois: a sondagem que o 409 já permite é
        // dívida conhecida, e não vale ampliá-la na tela.
        setAviso("Esse e-mail ou esse endereço já está em uso.");
      } else {
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    }

    setEnviando(false);

    // Fora do try: falha ao guardar não é recusa da API, e mostrá-la
    // como tal mandaria a pessoa duvidar da senha que estava certa.
    if (sessao) {
      sessaoDoBarbeiro.gravar(sessao.token);
      sessaoDaBarbearia.gravar(sessao.barbearia.slug);
      router.push("/painel");
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>{criando ? "Criar barbearia" : "Entrar no painel"}</h1>

      {criando ? (
        <>
          <Campo
            rotulo="Nome da barbearia"
            valor={nomeDaBarbearia}
            onChange={setNomeDaBarbearia}
          />
          <Campo
            rotulo="Endereço do link"
            valor={slug}
            onChange={(proximo) => {
              setSlug(proximo);
              setErroSlug(undefined);
            }}
            erro={erroSlug}
          />
          {/* É este endereço que vai no WhatsApp; mostrar o resultado
              evita descobrir depois que ficou errado. */}
          <p className={estilos.previa}>O link dos seus clientes: /{slug || "sua-barbearia"}</p>
          <Campo rotulo="Seu nome" valor={nome} onChange={setNome} />
        </>
      ) : null}

      <Campo rotulo="E-mail" type="email" valor={email} onChange={setEmail} />
      <Campo rotulo="Senha" type="password" valor={senha} onChange={setSenha} />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <div className={estilos.acoes}>
        <Botao carregando={enviando} onClick={submeter}>
          {criando ? "Criar e entrar" : "Entrar"}
        </Botao>
        <Botao
          variante="contorno"
          onClick={() => {
            setCriando((atual) => !atual);
            setAviso(undefined);
            setErroSlug(undefined);
          }}
        >
          {criando ? "Já tenho conta" : "Criar barbearia"}
        </Botao>
      </div>
    </main>
  );
}
```

`EntrarNoPainel.module.css` — siga o padrão de
`src/telas/Entrar.module.css`, com `.pagina`, `.acoes` e `.previa`.

`apps/web/app/(painel)/painel/entrar/page.tsx`:

```tsx
"use client";

import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { EntrarNoPainel } from "../../../../src/telas/painel/EntrarNoPainel";

// Fora do subgrupo (guardado) de propósito: lá dentro a guarda
// redirecionaria esta tela pra ela mesma. Por isso o provedor é montado
// aqui, e não herdado do layout.
export default function Pagina() {
  return (
    <ProvedorDoPainel>
      <EntrarNoPainel />
    </ProvedorDoPainel>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/entrar-no-painel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/telas/painel apps/web/app/\(painel\)/painel/entrar apps/web/tests/telas/painel/entrar-no-painel.test.tsx
git commit -m "feat(web): let a barber sign in and create a barbershop

Creating a barbershop is on no screen of the map, which puts first
access on the Expo app's login. C ships before D, so until then the
panel is the only way a barbershop can come into existence — the same
shape as the client flow's eighth screen. The slug is validated against
the API's own pattern before the call, so a bad address stays an error
on its field instead of a 400 in English."
```

---

### Task 6: `/painel` — dashboard do dia

Três números e a lista do dia. Tudo sai do que a API já devolve: nenhuma
rota nova.

**Files:**

- Create: `apps/web/src/componentes/Estatistica.tsx`
- Create: `apps/web/src/componentes/Estatistica.module.css`
- Create: `apps/web/src/painel/metricas.ts`
- Create: `apps/web/src/telas/painel/DashboardDoDia.tsx`
- Create: `apps/web/src/telas/painel/DashboardDoDia.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/page.tsx`
- Test: `apps/web/tests/painel/metricas.test.ts`
- Test: `apps/web/tests/telas/painel/dashboard.test.tsx`

**Interfaces:**

- Consumes: `usePainel` (Tarefa 4), `useApiDoPainel` (Tarefa 4),
  `useRequisicao`, `hojeIso` (`src/formato/datas.ts`), `formatarPreco`
  (`src/componentes/ItemDeServico.tsx`).
- Produces:
  - `Estatistica({ numero, legenda }: { numero: string; legenda: string })`
  - `CONTAM: readonly string[]` — os status que entram nas contas
  - `minutosOcupados(agendamentos: AgendamentoComCliente[]): number`
  - `minutosDeFuncionamento(horario: HorarioSerializado | undefined): number`
  - `ocupacao(agendamentos, horario): number | null` — `null` em dia fechado
  - `previstoDoDia(agendamentos: AgendamentoComCliente[]): string`
  - `DashboardDoDia({ agora }: { agora?: Date })`

- [ ] **Step 1: Escrever o teste das métricas**

`apps/web/tests/painel/metricas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import {
  minutosOcupados,
  ocupacao,
  previstoDoDia,
} from "../../src/painel/metricas";

const CLIENTE = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-0001",
  email: null,
  temConta: false,
};

function agendamento(
  status: string,
  minutos: number,
  preco: string
): AgendamentoComCliente {
  return {
    id: `a-${status}-${minutos}`,
    data: "2026-09-08",
    horaInicio: "09:00",
    horaFim: "09:30",
    status,
    origem: "barbeiro",
    observacoes: null,
    servicos: [
      {
        servicoId: "s1",
        nome: "Corte",
        precoNoMomento: preco,
        duracaoNoMomento: minutos,
      },
    ],
    cliente: CLIENTE,
  };
}

const ABERTO: HorarioSerializado = {
  diaSemana: 2,
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

const FECHADO: HorarioSerializado = {
  diaSemana: 0,
  horaAbertura: null,
  horaFechamento: null,
  fechado: true,
};

describe("métricas do dia", () => {
  it("soma minutos de pendente, confirmado e concluído", () => {
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("confirmado", 20, "25.00"),
      agendamento("concluido", 45, "60.00"),
    ];

    expect(minutosOcupados(lista)).toBe(95);
  });

  it("ignora cancelado e no_show", () => {
    // Horário que voltou a ficar livre não ocupa a agenda nem promete
    // dinheiro.
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("cancelado", 30, "40.00"),
      agendamento("no_show", 30, "40.00"),
    ];

    expect(minutosOcupados(lista)).toBe(30);
    expect(previstoDoDia(lista)).toBe("40.00");
  });

  it("a ocupação é minutos agendados sobre minutos de funcionamento", () => {
    // 09:00 às 18:00 são 540 minutos; 135 deles ocupados dão 25%.
    const lista = [
      agendamento("pendente", 90, "40.00"),
      agendamento("confirmado", 45, "60.00"),
    ];

    expect(ocupacao(lista, ABERTO)).toBe(25);
  });

  it("arredonda pra baixo quando a fracao pede", () => {
    // 60 dos 540 minutos dao 11,1111%: round devolve 11 e ceil devolve
    // 12. E a unica fixture que separa os dois — 30/540 arredonda e
    // teto pro mesmo 6, e 135/540 e exato, entao as tres implementacoes
    // concordam. Sem este caso, trocar Math.round por Math.ceil passa.
    const lista = [agendamento("confirmado", 60, "80.00")];

    expect(ocupacao(lista, ABERTO)).toBe(11);
  });

  it("dia fechado não tem ocupação, e não é zero", () => {
    // Zero por cento diria "aberto e vazio". Dividir por zero seria o
    // outro erro.
    expect(ocupacao([], FECHADO)).toBeNull();
    expect(ocupacao([], undefined)).toBeNull();
  });

  it("o previsto soma o preço congelado, não o de hoje", () => {
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("confirmado", 20, "25.50"),
    ];

    expect(previstoDoDia(lista)).toBe("65.50");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/metricas.test.ts`
Expected: FAIL — `src/painel/metricas.ts` não existe.

- [ ] **Step 3: Implementar as métricas**

`apps/web/src/painel/metricas.ts`:

```ts
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";

// Previsto do dia, não caixa: com dinheiro contando só o concluído, o
// número ficaria zerado até o barbeiro marcar as conclusões, e ele só
// marca se o número servir pra alguma coisa. Cancelado e no_show ficam
// de fora porque o horário voltou a ficar livre.
export const CONTAM = ["pendente", "confirmado", "concluido"] as const;

function valem(agendamentos: AgendamentoComCliente[]): AgendamentoComCliente[] {
  return agendamentos.filter((a) => (CONTAM as readonly string[]).includes(a.status));
}

export function minutosOcupados(agendamentos: AgendamentoComCliente[]): number {
  return valem(agendamentos).reduce(
    (total, a) =>
      total + a.servicos.reduce((soma, s) => soma + s.duracaoNoMomento, 0),
    0
  );
}

export function minutosDeFuncionamento(
  horario: HorarioSerializado | undefined
): number {
  if (!horario || horario.fechado || !horario.horaAbertura || !horario.horaFechamento) {
    return 0;
  }
  const emMinutos = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  };
  return emMinutos(horario.horaFechamento) - emMinutos(horario.horaAbertura);
}

// `null`, e não zero: zero por cento diria "aberto e vazio", e dia
// fechado não é isso. Dividir por zero seria o outro erro.
export function ocupacao(
  agendamentos: AgendamentoComCliente[],
  horario: HorarioSerializado | undefined
): number | null {
  const janela = minutosDeFuncionamento(horario);
  if (janela <= 0) return null;
  return Math.round((minutosOcupados(agendamentos) / janela) * 100);
}

// String de ponta a ponta: o preço é Decimal no banco e passar por
// float perderia centavo. A soma acontece em centavos inteiros.
export function previstoDoDia(agendamentos: AgendamentoComCliente[]): string {
  const centavos = valem(agendamentos).reduce(
    (total, a) =>
      total +
      a.servicos.reduce((soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100), 0),
    0
  );
  return (centavos / 100).toFixed(2);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/metricas.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste da tela**

`apps/web/tests/telas/painel/dashboard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Data fixa e instante fixo: teste que compara data fixa com o relógio
// real passa hoje e falha sozinho depois.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const HOJE = "2026-09-08";

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: HOJE,
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("dashboard do dia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("mostra a contagem, a ocupação e o previsto", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    expect(await screen.findByText("1")).toBeInTheDocument();
    // 30 dos 540 minutos entre 09:00 e 18:00.
    expect(screen.getByText("6%")).toBeInTheDocument();
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
    // "Previsto", não "faturamento": o número é promessa, não caixa.
    expect(screen.getByText(/previsto/i)).toBeInTheDocument();
  });

  it("lista os agendamentos de hoje e leva ao detalhe", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agendamentos/a1");
  });

  it("num dia sem agendamento diz isso em vez de mostrar tabela vazia", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, criarApiClientFalso({ agendamentos: [] }));

    expect(await screen.findByText(/nenhum agendamento hoje/i)).toBeInTheDocument();
  });
});
```

Este teste usa um ajudante novo, `montarPainel`, que monta provedor e
contexto de uma vez — quinze arquivos de teste repetiriam o mesmo
aninhamento. Crie `apps/web/tests/ajudantes/painel.tsx`:

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../src/sessao/armazenamento";

// Grava a sessão antes de renderizar: sem token o SessaoDoPainel
// redireciona e não renderiza filho nenhum, e todo teste de tela do
// painel morreria na primeira asserção.
export function montarPainel(
  tela: ReactElement,
  falso = criarApiClientFalso()
) {
  sessaoDoBarbeiro.gravar("jwt-falso-barbeiro");
  sessaoDaBarbearia.gravar("gr-barber");

  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>{tela}</SessaoDoPainel>
    </ProvedorDoPainel>
  );

  return falso;
}
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/dashboard.test.tsx`
Expected: FAIL — `DashboardDoDia` não existe.

- [ ] **Step 7: Implementar `Estatistica` e a tela**

`apps/web/src/componentes/Estatistica.tsx`:

```tsx
import estilos from "./Estatistica.module.css";

export function Estatistica({
  numero,
  legenda,
}: {
  numero: string;
  legenda: string;
}) {
  return (
    <div className={estilos.bloco}>
      <span className={estilos.numero}>{numero}</span>
      <span className={estilos.legenda}>{legenda}</span>
    </div>
  );
}
```

`apps/web/src/telas/painel/DashboardDoDia.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Estatistica } from "../../componentes/Estatistica";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { hojeIso } from "../../formato/datas";
import { ocupacao, previstoDoDia } from "../../painel/metricas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./DashboardDoDia.module.css";

// `agora` por parâmetro, como toda tela que olhe relógio: fake timers
// não entram nesta suíte, e teste que compara data fixa com o relógio
// real falha sozinho depois.
export function DashboardDoDia({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const hoje = hojeIso(agora);

  const agendamentos = useRequisicao(() => api.barbeiro.agendamentosDoDia(hoje), [hoje]);
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  if (agendamentos.erro) return <Aviso>{agendamentos.erro.mensagem}</Aviso>;
  if (!agendamentos.dados || !horarios.dados) return <p>Carregando…</p>;

  const doDia = agendamentos.dados;
  const horarioDeHoje = horarios.dados.find(
    (h) => h.diaSemana === new Date(`${hoje}T12:00:00`).getDay()
  );
  const percentual = ocupacao(doDia, horarioDeHoje);

  return (
    <div className={estilos.pagina}>
      <h1>Hoje, {perfil.nome}</h1>

      <div className={estilos.numeros}>
        <Estatistica numero={String(doDia.length)} legenda="agendamentos hoje" />
        <Estatistica
          numero={percentual === null ? "—" : `${percentual}%`}
          legenda="ocupação"
        />
        <Estatistica
          numero={formatarPreco(previstoDoDia(doDia))}
          legenda="previsto hoje"
        />
      </div>

      {doDia.length === 0 ? (
        <p>Nenhum agendamento hoje.</p>
      ) : (
        <ul className={estilos.lista}>
          {doDia.map((agendamento) => (
            <li key={agendamento.id}>
              <button
                type="button"
                onClick={() => router.push(`/painel/agendamentos/${agendamento.id}`)}
              >
                {agendamento.horaInicio} {agendamento.cliente.nome} ·{" "}
                {agendamento.servicos.map((s) => s.nome).join(" + ")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Botao onClick={() => router.push("/painel/agendamentos/novo")}>
        Novo agendamento
      </Botao>
    </div>
  );
}
```

`apps/web/app/(painel)/painel/(guardado)/page.tsx`:

```tsx
"use client";

import { DashboardDoDia } from "../../../../src/telas/painel/DashboardDoDia";

export default function Pagina() {
  return <DashboardDoDia />;
}
```

Os CSS Modules seguem o padrão das telas do sub-projeto B.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/dashboard.test.tsx tests/painel/metricas.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/painel/metricas.ts apps/web/src/componentes/Estatistica.tsx apps/web/src/componentes/Estatistica.module.css apps/web/src/telas/painel/DashboardDoDia.tsx apps/web/src/telas/painel/DashboardDoDia.module.css "apps/web/app/(painel)/painel/(guardado)/page.tsx" apps/web/tests/ajudantes/painel.tsx apps/web/tests/painel/metricas.test.ts apps/web/tests/telas/painel/dashboard.test.tsx
git commit -m "feat(web): show the day's three numbers on the panel

Count, occupancy and expected revenue all come from what the API already
returns: precoNoMomento and duracaoNoMomento on each appointment, plus
the week from horarios(). All three count pending, confirmed and
completed and ignore cancelled and no-show — counting money only when
completed would leave the number at zero all day, and the barber only
marks completions if the number is worth something. A closed day has no
occupancy rather than zero percent."
```

---

### Task 7: `/painel/agenda` — o dia, com a semana em cima

A grade **não** chama a disponibilidade: `FiltroDoDia` exige
`servicoIds`, e na agenda não há serviço escolhido. Ela desenha a janela
de funcionamento marcada com o que ocupa cada faixa.

**Files:**

- Create: `apps/web/src/painel/grade.ts`
- Create: `apps/web/src/componentes/GradeDeAgenda.tsx`
- Create: `apps/web/src/componentes/GradeDeAgenda.module.css`
- Create: `apps/web/src/telas/painel/AgendaDoDia.tsx`
- Create: `apps/web/src/telas/painel/AgendaDoDia.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/agenda/page.tsx`
- Test: `apps/web/tests/painel/grade.test.ts`
- Test: `apps/web/tests/telas/painel/agenda.test.tsx`

**Interfaces:**

- Consumes: `useApiDoPainel`, `useRequisicao`, `formatarDataLonga` e
  `hojeIso` (`src/formato/datas.ts`) na tela; `horaJaPassou` no
  `grade.ts`, não na tela.
- Produces:
  - `interface Faixa { hora: string; agendamento: AgendamentoComCliente | null; passada: boolean }`
  - `faixasDoDia(entrada: { data: string; horario: HorarioSerializado | undefined; agendamentos: AgendamentoComCliente[]; agora: Date; passo?: number }): Faixa[]`

  **O `passo` e 15, nao 30.** `packages/scheduling/src/index.ts:49` usa
  `intervaloMinutos = 15` por padrao, `horariosLivres` nao passa outro
  valor, e `agendamento.ts:101` valida o `horaInicio` contra essa lista —
  entao a API oferece e aceita 09:15. Com passo 30 um agendamento nessa
  hora nao casaria com faixa nenhuma e sumiria da agenda, e o painel so
  criaria em :00 e :30. O mockup do design system desenha meia hora; o
  pacote scheduling e a autoridade.
  - `diasDaSemana(data: string): string[]` — os sete dias, domingo a sábado
  - `GradeDeAgenda({ faixas, aoAbrir, aoCriar })`
  - `AgendaDoDia({ agora }: { agora?: Date })`

- [ ] **Step 1: Escrever o teste das faixas**

`apps/web/tests/painel/grade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { diasDaSemana, faixasDoDia } from "../../src/painel/grade";

const ABERTO: HorarioSerializado = {
  diaSemana: 2,
  horaAbertura: "09:00",
  horaFechamento: "11:00",
  fechado: false,
};

const AGENDAMENTO: AgendamentoComCliente = {
  id: "a1",
  data: "2026-09-08",
  horaInicio: "09:30",
  horaFim: "10:00",
  status: "confirmado",
  origem: "cliente",
  observacoes: null,
  servicos: [
    { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
  ],
  cliente: {
    id: "c1",
    nome: "João Silva",
    telefone: "(11) 99999-0001",
    email: null,
    temConta: false,
  },
};

describe("faixas do dia", () => {
  it("cobre a janela de funcionamento de meia em meia hora", () => {
    const faixas = faixasDoDia({
      data: "2026-09-08",
      horario: ABERTO,
      agendamentos: [],
      agora: new Date("2026-09-01T10:00:00-03:00"),
    });

    expect(faixas.map((f) => f.hora)).toEqual([
      "09:00", "09:15", "09:30", "09:45",
      "10:00", "10:15", "10:30", "10:45",
    ]);
  });

  it("dia fechado não tem faixa nenhuma", () => {
    const faixas = faixasDoDia({
      data: "2026-09-06",
      horario: { diaSemana: 0, horaAbertura: null, horaFechamento: null, fechado: true },
      agendamentos: [],
      agora: new Date("2026-09-01T10:00:00-03:00"),
    });

    expect(faixas).toEqual([]);
  });

  it("põe o agendamento na faixa em que ele começa", () => {
    const faixas = faixasDoDia({
      data: "2026-09-08",
      horario: ABERTO,
      agendamentos: [AGENDAMENTO],
      agora: new Date("2026-09-01T10:00:00-03:00"),
    });

    expect(faixas[1].agendamento?.cliente.nome).toBe("João Silva");
    expect(faixas[0].agendamento).toBeNull();
  });

  it("marca como passada a faixa de hoje que já passou", () => {
    // Oferecer 09:00 às 10h é ruído, não recurso. A barreira é da tela
    // porque garantirFuturo não existe na API.
    const faixas = faixasDoDia({
      data: "2026-09-08",
      horario: ABERTO,
      agendamentos: [],
      agora: new Date("2026-09-08T10:00:00-03:00"),
    });

    expect(faixas.find((f) => f.hora === "09:00")?.passada).toBe(true);
    expect(faixas.find((f) => f.hora === "10:30")?.passada).toBe(false);
  });

  it("num dia futuro nenhuma faixa é passada", () => {
    const faixas = faixasDoDia({
      data: "2026-09-09",
      horario: ABERTO,
      agendamentos: [],
      agora: new Date("2026-09-08T23:00:00-03:00"),
    });

    expect(faixas.every((f) => !f.passada)).toBe(true);
  });

  it("a semana vai de domingo a sábado contendo o dia", () => {
    // 2026-09-08 é uma terça; o domingo daquela semana é 2026-09-06.
    expect(diasDaSemana("2026-09-08")[0]).toBe("2026-09-06");
    expect(diasDaSemana("2026-09-08")).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: FAIL — `src/painel/grade.ts` não existe.

- [ ] **Step 3: Implementar `src/painel/grade.ts`**

```ts
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { horaJaPassou } from "../formato/datas";

export interface Faixa {
  hora: string;
  agendamento: AgendamentoComCliente | null;
  passada: boolean;
}

function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function emHora(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Isto é desenho de slot, não cálculo de disponibilidade: não decide se
// algo cabe, só mostra o que está lá. Quem responde "onde cabe um
// atendimento de duração D" é /disponibilidade, que exige servicoIds —
// e na agenda não há serviço escolhido.
export function faixasDoDia(entrada: {
  data: string;
  horario: HorarioSerializado | undefined;
  agendamentos: AgendamentoComCliente[];
  agora: Date;
  passo?: number;
}): Faixa[] {
  const { data, horario, agendamentos, agora, passo = 15 } = entrada;
  if (!horario || horario.fechado || !horario.horaAbertura || !horario.horaFechamento) {
    return [];
  }

  const inicio = emMinutos(horario.horaAbertura);
  const fim = emMinutos(horario.horaFechamento);
  const faixas: Faixa[] = [];

  for (let minuto = inicio; minuto < fim; minuto += passo) {
    const hora = emHora(minuto);
    faixas.push({
      hora,
      agendamento:
        agendamentos.find(
          (a) => a.horaInicio === hora && a.status !== "cancelado"
        ) ?? null,
      passada: horaJaPassou(data, hora, agora),
    });
  }

  return faixas;
}

// Domingo a sábado, como a grade do design system e como o Calendario
// do fluxo do cliente.
export function diasDaSemana(data: string): string[] {
  const referencia = new Date(`${data}T00:00:00Z`);
  const domingo = new Date(referencia);
  domingo.setUTCDate(referencia.getUTCDate() - referencia.getUTCDay());

  return Array.from({ length: 7 }, (_, indice) => {
    const dia = new Date(domingo);
    dia.setUTCDate(domingo.getUTCDate() + indice);
    return dia.toISOString().slice(0, 10);
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste da tela**

`apps/web/tests/telas/painel/agenda.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { AgendaDoDia } from "../../../src/telas/painel/AgendaDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "11:00",
        horaFim: "11:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("agenda do dia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08" },
    });
  });

  it("mostra o agendamento na faixa em que ele começa", async () => {
    montarPainel(<AgendaDoDia agora={AGORA} />, semear());

    expect(await screen.findByText(/João Silva/)).toBeInTheDocument();
  });

  it("faixa livre no futuro leva ao novo agendamento com data e hora", async () => {
    montarPainel(<AgendaDoDia agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /11:30/ }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=11%3A30"
    );
  });

  it("faixa de hoje que já passou não oferece criar", async () => {
    montarPainel(<AgendaDoDia agora={AGORA} />, semear());

    await screen.findByText(/João Silva/);
    expect(screen.queryByRole("button", { name: /09:00/ })).not.toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("clicar num dia da faixa de semana troca a data na URL", async () => {
    montarPainel(<AgendaDoDia agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /quarta/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?data=2026-09-09");
  });

  it("sem ?data= na URL, mostra hoje", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda" });
    montarPainel(<AgendaDoDia agora={AGORA} />, semear());

    expect(await screen.findByText(/João Silva/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/agenda.test.tsx`
Expected: FAIL — `AgendaDoDia` não existe.

- [ ] **Step 7: Implementar a grade e a tela**

`apps/web/src/componentes/GradeDeAgenda.tsx`:

```tsx
import type { Faixa } from "../painel/grade";
import estilos from "./GradeDeAgenda.module.css";

export function GradeDeAgenda({
  faixas,
  aoAbrir,
  aoCriar,
}: {
  faixas: Faixa[];
  aoAbrir: (id: string) => void;
  aoCriar: (hora: string) => void;
}) {
  if (faixas.length === 0) return <p>Fechado neste dia.</p>;

  return (
    <ul className={estilos.grade}>
      {faixas.map((faixa) => (
        <li key={faixa.hora} className={estilos.faixa}>
          {faixa.agendamento ? (
            <button type="button" onClick={() => aoAbrir(faixa.agendamento!.id)}>
              {faixa.hora} {faixa.agendamento.cliente.nome} ·{" "}
              {faixa.agendamento.servicos.map((s) => s.nome).join(" + ")}
            </button>
          ) : faixa.passada ? (
            // Sem botão: oferecer 09:00 às 10h é ruído. A hora continua
            // visível pra grade não ganhar buraco.
            <span className={estilos.passada}>{faixa.hora}</span>
          ) : (
            <button type="button" onClick={() => aoCriar(faixa.hora)}>
              {faixa.hora} livre
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/src/telas/painel/AgendaDoDia.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { GradeDeAgenda } from "../../componentes/GradeDeAgenda";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { diasDaSemana, faixasDoDia } from "../../painel/grade";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./AgendaDoDia.module.css";

const NOMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function AgendaDoDia({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();

  const data = query.get("data") ?? hojeIso(agora);
  const semana = diasDaSemana(data);

  const doDia = useRequisicao(() => api.barbeiro.agendamentosDoDia(data), [data]);
  const daSemana = useRequisicao(
    () => api.barbeiro.agendamentosDoIntervalo(semana[0], semana[6]),
    [semana[0]]
  );
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  if (doDia.erro) return <Aviso>{doDia.erro.mensagem}</Aviso>;
  if (!doDia.dados || !horarios.dados) return <p>Carregando…</p>;

  const diaDaSemana = new Date(`${data}T12:00:00`).getDay();
  const faixas = faixasDoDia({
    data,
    horario: horarios.dados.find((h) => h.diaSemana === diaDaSemana),
    agendamentos: doDia.dados,
    agora,
  });

  return (
    <div className={estilos.pagina}>
      <h1>{formatarDataLonga(data)}</h1>

      <ul className={estilos.semana}>
        {semana.map((dia, indice) => (
          <li key={dia}>
            <button
              type="button"
              aria-current={dia === data ? "date" : undefined}
              onClick={() => router.push(`/painel/agenda?data=${dia}`)}
            >
              {NOMES[indice]} {dia.slice(8)}
              {/* O ponto diz que aquele dia tem algo, sem obrigar a
                  abrir um por um. */}
              {daSemana.dados?.some((a) => a.data === dia) ? " ·" : ""}
            </button>
          </li>
        ))}
      </ul>

      <GradeDeAgenda
        faixas={faixas}
        aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
        aoCriar={(hora) =>
          router.push(
            `/painel/agendamentos/novo?data=${data}&hora=${encodeURIComponent(hora)}`
          )
        }
      />
    </div>
  );
}
```

`apps/web/app/(painel)/painel/(guardado)/agenda/page.tsx` segue a forma
da `page.tsx` do dashboard.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/agenda.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/painel/grade.ts apps/web/src/componentes/GradeDeAgenda.tsx apps/web/src/componentes/GradeDeAgenda.module.css apps/web/src/telas/painel/AgendaDoDia.tsx apps/web/src/telas/painel/AgendaDoDia.module.css "apps/web/app/(painel)/painel/(guardado)/agenda" apps/web/tests/painel/grade.test.ts apps/web/tests/telas/painel/agenda.test.tsx
git commit -m "feat(web): draw the day's agenda from the opening window

The grid cannot ask /disponibilidade: FiltroDoDia requires servicoIds,
and no service is chosen when you are only looking at a day — which is
why the client flow's time step is only reachable with ?servicos= in the
URL. So the grid draws the slots between opening and closing and marks
what agendamentosDoDia occupies. Today's already-passed slots render as
passed and offer no create link; the API still has no garantirFuturo, so
that barrier is the screen's."
```

---

### Task 8: `/painel/agendamentos/novo` — tela larga

Quatro blocos numa tela: cliente, serviços, data e horário. O wizard do
fluxo do cliente existe porque celular não comporta quatro passos; um
monitor comporta. É aqui — e só aqui — que a disponibilidade é chamada,
porque é aqui que existem serviços selecionados.

**Files:**

- Create: `apps/web/src/telas/painel/NovoAgendamento.tsx`
- Create: `apps/web/src/telas/painel/NovoAgendamento.module.css`
- Create: `apps/web/src/telas/painel/BuscaDeCliente.tsx`
- Create: `apps/web/src/telas/painel/BuscaDeCliente.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/agendamentos/novo/page.tsx`
- Test: `apps/web/tests/telas/painel/novo-agendamento.test.tsx`

**Interfaces:**

- Consumes: `usePainel` (dá `perfil.id`, que é o `barbeiroId`, e `slug`),
  `useApiDoPainel`, `useRequisicao`, `Calendario`, `ListaDeHorarios`,
  `ItemDeServico`, `formatarPreco`, `ehPassado`, `hojeIso`,
  `normalizarTelefoneObrigatorio`, `TelefoneInvalido`.
- Produces:
  - `BuscaDeCliente({ escolhido, aoEscolher })` — busca, lista e o
    cadastro embutido
  - `NovoAgendamento({ agora }: { agora?: Date })`

**Nota sobre a disponibilidade:** o escopo do barbeiro não tem método de
disponibilidade — ela é rota pública por slug. É por isso que o
`ProvedorDoPainel` da Tarefa 4 já expõe `{ barbeiro, publico }`: aqui a
tela chama `api.publico.disponibilidadeDoDia(slug, filtro)` com o slug
que `usePainel()` entrega e o `barbeiroId` que é o `perfil.id`.

- [ ] **Step 1: Escrever o teste da tela**

`apps/web/tests/telas/painel/novo-agendamento.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { NovoAgendamento } from "../../../src/telas/painel/NovoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    horariosLivres: ["11:00", "11:30", "12:00"],
  });
}

describe("novo agendamento no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00" },
    });
  });

  it("chega preenchido pela URL que a agenda montou", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "11:00", current: true })).toBeInTheDocument();
  });

  it("agenda com cliente, serviço, data e hora", async () => {
    const falso = semear();
    const criar = vi.fn(async (novo: Parameters<typeof falso.barbeiro.criarAgendamento>[0]) =>
      falso.barbeiro.criarAgendamento(novo)
    );
    falso.barbeiro.criarAgendamento = criar;

    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0][0]).toMatchObject({
      // barbeiroId é o id do perfil logado: a barbearia do MVP tem um
      // barbeiro só.
      barbeiroId: "bb1",
      clienteId: "c1",
      servicoIds: ["s1"],
      data: "2026-09-09",
      horaInicio: "11:00",
    });
  });

  it("não deixa agendar sem cliente ou sem serviço", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: /^agendar$/i })).toBeDisabled();
  });

  it("cadastra cliente novo sem sair da tela", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /cadastrar novo/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11988887777");
    await userEvent.click(screen.getByRole("button", { name: /^cadastrar$/i }));

    expect(await screen.findByRole("button", { name: /Ana Souza/, current: true })).toBeInTheDocument();
  });

  it("telefone já cadastrado oferece o cliente existente em vez de erro", async () => {
    // É o caso comum do walk-in: quem chega já existe, criado pelo
    // upsert do agendamento público.
    const falso = semear();
    falso.barbeiro.criarCliente = async () => {
      throw new ErroDaApi(409, "conflito", "esse telefone já tem cadastro");
    };
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /cadastrar novo/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), "João");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11999990001");
    await userEvent.click(screen.getByRole("button", { name: /^cadastrar$/i }));

    expect(await screen.findByText(/esse telefone já tem cadastro/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /João Silva/ })).toBeInTheDocument();
  });

  it("data no passado avisa e exige confirmar", async () => {
    // Registrar retroativamente é legítimo — garantirAlteravel não toca
    // o escopo do barbeiro. Fazer isso sem perceber, não.
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-01", hora: "11:00" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

    expect(screen.getByText(/data no passado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /registrar mesmo assim/i }));

    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeEnabled();
  });

  it("horario_ocupado manda recarregar os horários, não repetir o envio", async () => {
    // É a corrida que a trava do banco pega depois de a disponibilidade
    // já ter dito que cabia.
    const falso = semear();
    falso.barbeiro.criarAgendamento = async () => {
      throw new ErroDaApi(409, "horario_ocupado", "esse horário já está ocupado");
    };
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));

    expect(await screen.findByText(/esse horário acabou de ser ocupado/i)).toBeInTheDocument();
  });
});
```

**Quatro correções que a execução desta tarefa exigiu nos snippets acima**,
todas já no código entregue e registradas aqui para quem reexecutar o
plano: `ListaDeHorarios` ganhou uma prop `selecionada?: string`, porque
o teste pede `current: true` e o componente não tinha como marcar botão
atual; a lista de horários exibida funde a `hora` da URL, para o slot
pré-preenchido pelo clique da agenda aparecer mesmo antes de haver
serviço escolhido (a busca em si continua barrada sem serviço, porque a
API exige `minItems: 1` em `servicoIds`); o rótulo da busca virou
"Buscar cliente", porque "Buscar por nome ou telefone" contém "nome" e
"telefone" e colidia com os rótulos do cadastro embutido; e a lista
renderizada funde o cliente recém-criado, já que a busca não é refeita
quando o cadastro muda o estado do dublê sem mudar o termo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/novo-agendamento.test.tsx`
Expected: FAIL — `NovoAgendamento` não existe.

- [ ] **Step 3: Implementar a busca de cliente**

`apps/web/src/telas/painel/BuscaDeCliente.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import type { ClienteSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./BuscaDeCliente.module.css";

export function BuscaDeCliente({
  escolhido,
  aoEscolher,
}: {
  escolhido: ClienteSerializado | null;
  aoEscolher: (cliente: ClienteSerializado) => void;
}) {
  const api = useApiDoPainel();
  const [busca, setBusca] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();

  const clientes = useRequisicao(() => api.barbeiro.clientes(busca), [busca]);

  async function cadastrar() {
    setAviso(undefined);
    setErroTelefone(undefined);

    let numero: string;
    try {
      numero = normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    try {
      const criado = await api.barbeiro.criarCliente({ nome: nome.trim(), telefone: numero });
      setCadastrando(false);
      aoEscolher(criado);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "conflito") {
        // Telefone repetido é o caso comum do walk-in, não o raro: quem
        // chega já existe, criado pelo upsert do agendamento público.
        // Um erro seco aqui seria um beco.
        setAviso("Esse telefone já tem cadastro — ele está na lista abaixo.");
        setBusca(numero);
        setCadastrando(false);
      } else {
        setAviso(erro.mensagem || "Não foi possível cadastrar agora.");
      }
    }
  }

  return (
    <section className={estilos.bloco}>
      <h2>Cliente</h2>

      <Campo rotulo="Buscar por nome ou telefone" valor={busca} onChange={setBusca} />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <ul className={estilos.lista}>
        {(clientes.dados ?? []).map((cliente) => (
          <li key={cliente.id}>
            <button
              type="button"
              aria-current={escolhido?.id === cliente.id ? "true" : undefined}
              onClick={() => aoEscolher(cliente)}
            >
              {cliente.nome} · {cliente.telefone}
            </button>
          </li>
        ))}
      </ul>

      {cadastrando ? (
        <div className={estilos.cadastro}>
          <Campo rotulo="Nome" valor={nome} onChange={setNome} />
          <Campo
            rotulo="Telefone"
            formato="telefone"
            valor={telefone}
            onChange={(proximo) => {
              setTelefone(proximo);
              setErroTelefone(undefined);
            }}
            erro={erroTelefone}
          />
          <Botao onClick={cadastrar}>Cadastrar</Botao>
        </div>
      ) : (
        <Botao variante="contorno" onClick={() => setCadastrando(true)}>
          + Cadastrar novo
        </Botao>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implementar a tela**

`apps/web/src/telas/painel/NovoAgendamento.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { ClienteSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Calendario } from "../../componentes/Calendario";
import { formatarPreco, ItemDeServico } from "../../componentes/ItemDeServico";
import { ListaDeHorarios } from "../../componentes/ListaDeHorarios";
import { useRequisicao } from "../../api/useRequisicao";
import { ehPassado, hojeIso } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./NovoAgendamento.module.css";

export function NovoAgendamento({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();

  const data = query.get("data") ?? hojeIso(agora);
  const hora = query.get("hora") ?? "";
  const [mes, setMes] = useState(data.slice(0, 7));
  const [cliente, setCliente] = useState<ClienteSerializado | null>(null);
  const [servicoIds, setServicoIds] = useState<string[]>([]);
  const [confirmouPassado, setConfirmouPassado] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);

  // Só com serviço escolhido a pergunta faz sentido: /disponibilidade
  // responde "onde cabe um atendimento de duração D".
  const horarios = useRequisicao(
    () =>
      servicoIds.length === 0
        ? Promise.resolve([])
        : api.publico.disponibilidadeDoDia(slug, {
            barbeiroId: perfil.id,
            data,
            servicoIds,
          }),
    [slug, perfil.id, data, servicoIds.join(",")]
  );

  const diasComVaga = useRequisicao(
    () =>
      servicoIds.length === 0
        ? Promise.resolve({})
        : api.publico.disponibilidadeDoMes(slug, {
            barbeiroId: perfil.id,
            mes,
            servicoIds,
          }),
    [slug, perfil.id, mes, servicoIds.join(",")]
  );

  const passado = ehPassado(data, agora);
  const pronto =
    Boolean(cliente) && servicoIds.length > 0 && Boolean(hora) && (!passado || confirmouPassado);

  function trocarQuery(proximos: Record<string, string>) {
    const atual = new URLSearchParams(query.toString());
    for (const [chave, valor] of Object.entries(proximos)) atual.set(chave, valor);
    router.push(`/painel/agendamentos/novo?${atual.toString()}`);
  }

  async function agendar() {
    if (!cliente) return;
    setAviso(undefined);
    setEnviando(true);

    try {
      const criado = await api.barbeiro.criarAgendamento({
        // A barbearia do MVP tem um barbeiro só, e é o que está logado.
        barbeiroId: perfil.id,
        clienteId: cliente.id,
        servicoIds,
        data,
        horaInicio: hora,
      });
      router.push(`/painel/agendamentos/${criado.id}`);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "horario_ocupado") {
        // A corrida que a trava do banco pega depois de a
        // disponibilidade já ter dito que cabia. A resposta certa é
        // recarregar os horários, não repetir o envio.
        setAviso("Esse horário acabou de ser ocupado. Escolha outro.");
        horarios.recarregar();
      } else {
        setAviso(erro.mensagem || "Não foi possível agendar agora.");
      }
    }

    setEnviando(false);
  }

  const escolhidos = (servicos.dados ?? []).filter((s) => servicoIds.includes(s.id));
  const duracao = escolhidos.reduce((total, s) => total + s.duracaoMinutos, 0);
  const total = escolhidos
    .reduce((soma, s) => soma + Math.round(Number(s.preco) * 100), 0);

  return (
    <div className={estilos.pagina}>
      <h1>Novo agendamento</h1>

      <div className={estilos.grade}>
        <BuscaDeCliente escolhido={cliente} aoEscolher={setCliente} />

        <section className={estilos.bloco}>
          <h2>Serviços</h2>
          {(servicos.dados ?? [])
            .filter((servico) => servico.ativo)
            .map((servico) => (
              <ItemDeServico
                key={servico.id}
                servico={servico}
                marcado={servicoIds.includes(servico.id)}
                aoAlternar={(id) =>
                  setServicoIds((atuais) =>
                    atuais.includes(id)
                      ? atuais.filter((outro) => outro !== id)
                      : [...atuais, id]
                  )
                }
              />
            ))}
          <p>
            {duracao} min · {formatarPreco((total / 100).toFixed(2))}
          </p>
        </section>

        <section className={estilos.bloco}>
          <h2>Data</h2>
          <Calendario
            mes={mes}
            dias={diasComVaga.dados ?? {}}
            agora={agora}
            aoEscolher={(escolhida) => trocarQuery({ data: escolhida })}
            aoTrocarMes={setMes}
          />
        </section>

        <section className={estilos.bloco}>
          <h2>Horário</h2>
          <ListaDeHorarios
            horarios={horarios.dados ?? []}
            aoEscolher={(escolhida) => trocarQuery({ hora: escolhida })}
          />
        </section>
      </div>

      {passado ? (
        <div className={estilos.passado}>
          {/* garantirAlteravel não toca o escopo do barbeiro, então isto
              é recuperável — registrar retroativamente um atendimento
              que acabou de acontecer é legítimo. Fazer isso sem
              perceber, não. */}
          <p>Data no passado.</p>
          <label>
            <input
              type="checkbox"
              checked={confirmouPassado}
              onChange={(evento) => setConfirmouPassado(evento.target.checked)}
            />
            Registrar mesmo assim
          </label>
        </div>
      ) : null}

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Botao disabled={!pronto} carregando={enviando} onClick={agendar}>
        Agendar
      </Botao>
    </div>
  );
}
```

Acrescente `import { BuscaDeCliente } from "./BuscaDeCliente";` no topo.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/novo-agendamento.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/telas/painel/NovoAgendamento.tsx apps/web/src/telas/painel/NovoAgendamento.module.css apps/web/src/telas/painel/BuscaDeCliente.tsx apps/web/src/telas/painel/BuscaDeCliente.module.css "apps/web/app/(painel)/painel/(guardado)/agendamentos" apps/web/tests/telas/painel/novo-agendamento.test.tsx
git commit -m "feat(web): book a walk-in from one wide screen

Client, services, date and time are all visible at once — the client
flow's wizard exists because a phone cannot hold four steps, and a
monitor can. Creating a client happens inline, because the walk-in is
exactly the person who is not registered yet, and a repeated phone
offers the existing record instead of a dead end. A past date is allowed
only through a deliberate checkbox: garantirAlteravel never runs in the
barber scope, so the entry is recoverable, but it should not happen by
accident."
```

---

### Task 9: `/painel/agendamentos/[id]` — detalhe

Muda status e observações. **Só isso:** o `PATCH /agendamentos/:id`
aceita apenas esses dois campos, e o comentário em
`apps/api/src/routers/agendamentos.ts:50` diz o porquê — aceitar data e
hora ali pularia a checagem de disponibilidade inteira.

**Files:**

- Create: `apps/web/src/telas/painel/DetalheDoAgendamento.tsx`
- Create: `apps/web/src/telas/painel/DetalheDoAgendamento.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/agendamentos/[id]/page.tsx`
- Test: `apps/web/tests/telas/painel/detalhe-do-agendamento.test.tsx`

**Interfaces:**

- Consumes: `useApiDoPainel`, `useRequisicao`, `useParams`,
  `formatarPreco`, `formatarDataLonga`, `Chip`, `Botao`, `Campo`,
  `Aviso`.
- Produces: `DetalheDoAgendamento()` — lê o `id` de `useParams`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "pendente",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("detalhe do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/a1",
      params: { id: "a1" },
    });
  });

  it("mostra cliente, serviços e o preço congelado", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/João Silva/)).toBeInTheDocument();
    // precoNoMomento, não o preço de hoje: é o que foi combinado com
    // aquele cliente naquele dia.
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
  });

  it("muda o status", async () => {
    const falso = semear();
    // O original e capturado ANTES da troca: `montarPainel` passa
    // `falso.barbeiro` por referencia, entao dentro do mock
    // `falso.barbeiro.atualizarAgendamento` ja resolveria para o proprio
    // mock — recursao infinita que o catch da tela engole, deixando o
    // teste verde sem nunca provar que a chamada real aconteceu.
    const original = falso.barbeiro.atualizarAgendamento;
    const atualizar = vi.fn(
      async (id: string, edicao: { status?: string; observacoes?: string | null }) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarAgendamento = atualizar;

    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /confirmado/i }));

    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("a1", { status: "confirmado" }));
  });

  it("salva observações", async () => {
    const falso = semear();
    // O original e capturado ANTES da troca: `montarPainel` passa
    // `falso.barbeiro` por referencia, entao dentro do mock
    // `falso.barbeiro.atualizarAgendamento` ja resolveria para o proprio
    // mock — recursao infinita que o catch da tela engole, deixando o
    // teste verde sem nunca provar que a chamada real aconteceu.
    const original = falso.barbeiro.atualizarAgendamento;
    const atualizar = vi.fn(
      async (id: string, edicao: { status?: string; observacoes?: string | null }) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarAgendamento = atualizar;

    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.type(await screen.findByLabelText(/observações/i), "cliente atrasa");
    await userEvent.click(screen.getByRole("button", { name: /salvar observações/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("a1", { observacoes: "cliente atrasa" })
    );
  });

  it("diz que remarcar é cancelar e criar, sem oferecer botão que a API recusaria", async () => {
    // PATCH /agendamentos/:id aceita só status e observacoes; remarcar
    // existe apenas no escopo do cliente.
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/para mudar o horário, cancele e crie outro/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remarcar/i })).not.toBeInTheDocument();
  });

  it("agendamento inexistente vira aviso, não tela em branco", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/a9",
      params: { id: "a9" },
    });
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/agendamento não encontrado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/detalhe-do-agendamento.test.tsx`
Expected: FAIL — `DetalheDoAgendamento` não existe.

- [ ] **Step 3: Implementar**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoAgendamento.module.css";

// Qualquer transição é aceita pela API: o barbeiro é a autoridade sobre
// o que aconteceu no salão.
const STATUS = ["pendente", "confirmado", "concluido", "cancelado", "no_show"] as const;

export function DetalheDoAgendamento() {
  const { id } = useParams<{ id: string }>();
  const api = useApiDoPainel();
  const agendamento = useRequisicao(() => api.barbeiro.agendamento(id), [id]);

  const [observacoes, setObservacoes] = useState("");
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (agendamento.dados) setObservacoes(agendamento.dados.observacoes ?? "");
  }, [agendamento.dados]);

  if (agendamento.erro) {
    return (
      <Aviso>
        {agendamento.erro.codigo === "nao_encontrado"
          ? "Agendamento não encontrado."
          : agendamento.erro.mensagem}
      </Aviso>
    );
  }
  if (!agendamento.dados) return <p>Carregando…</p>;

  const atual = agendamento.dados;

  async function aplicar(edicao: { status?: string; observacoes?: string | null }) {
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarAgendamento(id, edicao);
      agendamento.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  const total = atual.servicos.reduce(
    (soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100),
    0
  );

  return (
    <div className={estilos.pagina}>
      <h1>{atual.cliente.nome}</h1>
      <p>{atual.cliente.telefone}</p>
      <p>
        {formatarDataLonga(atual.data)} · {atual.horaInicio}–{atual.horaFim}
      </p>
      <p>
        {atual.servicos.map((s) => s.nome).join(" + ")} ·{" "}
        {formatarPreco((total / 100).toFixed(2))}
      </p>
      <Chip tom="neutro">agendado pelo {atual.origem}</Chip>

      <section>
        <h2>Status</h2>
        <div className={estilos.status}>
          {STATUS.map((status) => (
            <Botao
              key={status}
              variante={status === atual.status ? "primario" : "contorno"}
              onClick={() => aplicar({ status })}
              carregando={salvando}
            >
              {status}
            </Botao>
          ))}
        </div>
      </section>

      <Campo
        rotulo="Observações"
        valor={observacoes}
        onChange={setObservacoes}
      />
      <Botao onClick={() => aplicar({ observacoes })} carregando={salvando}>
        Salvar observações
      </Botao>

      {/* A API não tem remarcar no escopo do barbeiro, e aceitar data e
          hora no PATCH pularia a checagem de disponibilidade inteira.
          Dizer isso é melhor do que um botão que voltaria erro. */}
      <p className={estilos.nota}>
        Para mudar o horário, cancele e crie outro agendamento.
      </p>

      {aviso ? <Aviso>{aviso}</Aviso> : null}
    </div>
  );
}
```

As variantes do `Botao` são `"primario" | "fantasma" | "contorno"`
(`src/componentes/Botao.tsx`); `"primario" ` é o padrão quando nenhuma é
informada.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/detalhe-do-agendamento.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/telas/painel/DetalheDoAgendamento.tsx apps/web/src/telas/painel/DetalheDoAgendamento.module.css "apps/web/app/(painel)/painel/(guardado)/agendamentos/[id]" apps/web/tests/telas/painel/detalhe-do-agendamento.test.tsx
git commit -m "feat(web): change an appointment's status and notes

Those two fields are all PATCH /agendamentos/:id accepts — taking date
and time there would skip the availability check entirely, which is why
rescheduling exists only in the client scope. The screen says to cancel
and create instead of offering a button the API would refuse."
```

---

### Task 10: Clientes — lista, cadastro e detalhe

Três rotas e o componente `Tabela`, que serviços também usa.

**Files:**

- Create: `apps/web/src/componentes/Tabela.tsx`
- Create: `apps/web/src/componentes/Tabela.module.css`
- Create: `apps/web/src/telas/painel/ListaDeClientes.tsx`
- Create: `apps/web/src/telas/painel/CadastroDeCliente.tsx`
- Create: `apps/web/src/telas/painel/DetalheDoCliente.tsx`
- Create: os três `.module.css` correspondentes
- Create: `apps/web/app/(painel)/painel/(guardado)/clientes/page.tsx`
- Create: `apps/web/app/(painel)/painel/(guardado)/clientes/novo/page.tsx`
- Create: `apps/web/app/(painel)/painel/(guardado)/clientes/[id]/page.tsx`
- Test: `apps/web/tests/telas/painel/clientes.test.tsx`

**Interfaces:**

- Consumes: `useApiDoPainel`, `useRequisicao`, `useSearchParams`,
  `useParams`, `formatarTelefoneParcial`,
  `normalizarTelefoneObrigatorio`, `TelefoneInvalido`,
  `formatarDataLonga`.
- Produces:
  - `Tabela({ cabecalho, linhas })` onde
    `linhas: { id: string; celulas: ReactNode[] }[]` e
    `cabecalho: string[]`; a linha inteira é clicável via `aoAbrir?`
  - `ListaDeClientes({ agora }: { agora?: Date })`
  - `CadastroDeCliente()`
  - `DetalheDoCliente()`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { CadastroDeCliente } from "../../../src/telas/painel/CadastroDeCliente";
import { DetalheDoCliente } from "../../../src/telas/painel/DetalheDoCliente";
import { ListaDeClientes } from "../../../src/telas/painel/ListaDeClientes";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Instante fixo: a lista busca os agendamentos dos últimos 90 dias, e
// sem passar o instante a janela mudaria a cada dia que o teste rodasse.
const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
      { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-08-30",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "concluido",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("clientes no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes" });
  });

  it("lista os clientes com nome e telefone", async () => {
    montarPainel(<ListaDeClientes agora={AGORA} />, semear());

    expect(await screen.findByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("Marcos Reis")).toBeInTheDocument();
  });

  it("a busca da URL chega na chamada", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes", query: { busca: "marcos" } });
    montarPainel(<ListaDeClientes agora={AGORA} />, semear());

    expect(await screen.findByText("Marcos Reis")).toBeInTheDocument();
    expect(screen.queryByText("João Silva")).not.toBeInTheDocument();
  });

  it("digitar na busca põe o termo na URL", async () => {
    // ?busca= na URL: recarregar não perde o filtro, e o resultado é
    // linkável — a mesma razão que fez o fluxo do cliente pôr o passo
    // na rota.
    montarPainel(<ListaDeClientes agora={AGORA} />, semear());

    await userEvent.type(await screen.findByLabelText(/buscar/i), "marcos");

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/clientes?busca=marcos")
    );
  });

  it("abrir uma linha vai pro detalhe", async () => {
    montarPainel(<ListaDeClientes agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/clientes/c1");
  });

  it("cadastra cliente e vai pro detalhe dele", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes/novo" });
    montarPainel(<CadastroDeCliente />, criarApiClientFalso({ clientes: [] }));

    await userEvent.type(screen.getByLabelText(/nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11988887777");
    await userEvent.click(screen.getByRole("button", { name: /cadastrar/i }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/clientes/c1")
    );
  });

  it("telefone sem DDD para no campo, sem ir à API", async () => {
    // A API responde 400 do pattern; barrar aqui mantém o erro no campo.
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes/novo" });
    const falso = criarApiClientFalso({ clientes: [] });
    let chamou = false;
    falso.barbeiro.criarCliente = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montarPainel(<CadastroDeCliente />, falso);

    await userEvent.type(screen.getByLabelText(/nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "988887777");
    await userEvent.click(screen.getByRole("button", { name: /cadastrar/i }));

    expect(await screen.findByText(/informe o DDD/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("o detalhe mostra os dados e o histórico", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes/c1", params: { id: "c1" } });
    montarPainel(<DetalheDoCliente />, semear());

    expect(await screen.findByDisplayValue("João Silva")).toBeInTheDocument();
    expect(screen.getByText(/30 de agosto/i)).toBeInTheDocument();
  });

  it("o detalhe salva a edição", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes/c1", params: { id: "c1" } });
    const falso = semear();
    // Original capturado antes da troca — ver a nota do mesmo padrao na
    // Tarefa 9: sem isso o mock chama a si mesmo.
    const original = falso.barbeiro.atualizarCliente;
    const atualizar = vi.fn(
      async (id: string, edicao: { nome?: string; telefone?: string }) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarCliente = atualizar;

    montarPainel(<DetalheDoCliente />, falso);

    const campo = await screen.findByLabelText(/nome/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "João da Silva");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("c1", expect.objectContaining({ nome: "João da Silva" }))
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/clientes.test.tsx`
Expected: FAIL — as três telas não existem.

- [ ] **Step 3: Implementar a `Tabela`**

```tsx
import type { ReactNode } from "react";
import estilos from "./Tabela.module.css";

export interface Linha {
  id: string;
  celulas: ReactNode[];
}

export function Tabela({
  cabecalho,
  linhas,
  aoAbrir,
  vazio,
}: {
  cabecalho: string[];
  linhas: Linha[];
  aoAbrir?: (id: string) => void;
  vazio: string;
}) {
  if (linhas.length === 0) return <p>{vazio}</p>;

  return (
    <table className={estilos.tabela}>
      <thead>
        <tr>
          {cabecalho.map((titulo) => (
            <th key={titulo}>{titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={linha.id}>
            {linha.celulas.map((celula, indice) => (
              <td key={indice}>
                {/* O botão fica na primeira célula, e não na <tr>: linha
                    clicável sem elemento focável não chega pelo teclado. */}
                {indice === 0 && aoAbrir ? (
                  <button type="button" onClick={() => aoAbrir(linha.id)}>
                    {celula}
                  </button>
                ) : (
                  celula
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Implementar as três telas**

`ListaDeClientes.tsx` — busca na URL, tabela, botão de novo:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDeClientes.module.css";

// `agora` por parâmetro porque a janela de 90 dias olha o relógio.
export function ListaDeClientes({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();
  const busca = query.get("busca") ?? "";
  // Estado local, e nao o valor da URL direto no campo: o router.push do
  // Next e assincrono, e um campo cujo valor so volta pela URL trava
  // enquanto a navegacao nao acontece - a pessoa digita e nao ve letra.
  // O filtro continua saindo da URL, entao recarregar e o link valem.
  const [digitado, setDigitado] = useState(busca);
  useEffect(() => setDigitado(busca), [busca]);

  const clientes = useRequisicao(() => api.barbeiro.clientes(busca), [busca]);

  // O último agendamento não vem na lista de clientes, então sai daqui:
  // uma chamada de intervalo, não uma por linha. A janela é de 90 dias
  // e não "desde sempre" de propósito — buscar o histórico inteiro da
  // barbearia a cada abertura da lista fica mais caro a cada mês, e
  // quem não aparece há três meses aparece como "—", que é a informação
  // que a coluna existe pra dar.
  const janela = 90;
  const ate = hojeIso(agora);
  const de = hojeIso(new Date(agora.getTime() - janela * 24 * 60 * 60 * 1000));
  const recentes = useRequisicao(
    () => api.barbeiro.agendamentosDoIntervalo(de, ate),
    [de, ate]
  );

  if (clientes.erro) return <Aviso>{clientes.erro.mensagem}</Aviso>;

  function ultimoDe(clienteId: string): string {
    const datas = (recentes.dados ?? [])
      .filter((a) => a.cliente.id === clienteId)
      .map((a) => a.data)
      .sort();
    const ultima = datas.at(-1);
    return ultima ? formatarDataLonga(ultima) : "—";
  }

  return (
    <div className={estilos.pagina}>
      <div className={estilos.topo}>
        <h1>Clientes</h1>
        <Botao onClick={() => router.push("/painel/clientes/novo")}>+ Novo</Botao>
      </div>

      <Campo
        rotulo="Buscar por nome ou telefone"
        valor={digitado}
        onChange={(proximo) => {
          setDigitado(proximo);
          router.push(
            proximo ? `/painel/clientes?busca=${encodeURIComponent(proximo)}` : "/painel/clientes"
          );
        }}
      />

      <Tabela
        cabecalho={["Nome", "Telefone", "Último agendamento"]}
        vazio="Nenhum cliente por aqui ainda."
        aoAbrir={(id) => router.push(`/painel/clientes/${id}`)}
        linhas={(clientes.dados ?? []).map((cliente) => ({
          id: cliente.id,
          celulas: [cliente.nome, cliente.telefone, ultimoDe(cliente.id)],
        }))}
      />
    </div>
  );
}
```

`CadastroDeCliente.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./CadastroDeCliente.module.css";

export function CadastroDeCliente() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  async function cadastrar() {
    setAviso(undefined);
    setErroTelefone(undefined);

    let numero: string;
    try {
      // A mesma função que a API usa pra guardar. Barrar aqui evita a
      // ida e volta que voltaria 400 do pattern sem dizer o que fazer.
      numero = normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    setSalvando(true);
    try {
      const criado = await api.barbeiro.criarCliente({
        nome: nome.trim(),
        telefone: numero,
        email: email.trim() || null,
      });
      router.push(`/painel/clientes/${criado.id}`);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      // Telefone repetido é o caso comum, não o raro: o cadastro pode
      // ter nascido do upsert do agendamento público.
      setAviso(
        erro.codigo === "conflito"
          ? "Esse telefone já tem cadastro. Procure por ele na lista."
          : erro.mensagem || "Não foi possível cadastrar agora."
      );
    }
    setSalvando(false);
  }

  return (
    <div className={estilos.pagina}>
      <h1>Novo cliente</h1>

      <Campo rotulo="Nome" valor={nome} onChange={setNome} />
      <Campo
        rotulo="Telefone"
        formato="telefone"
        valor={telefone}
        onChange={(proximo) => {
          setTelefone(proximo);
          setErroTelefone(undefined);
        }}
        erro={erroTelefone}
      />
      <Campo rotulo="E-mail (opcional)" type="email" valor={email} onChange={setEmail} />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Botao carregando={salvando} onClick={cadastrar}>
        Cadastrar
      </Botao>
    </div>
  );
}
```

`DetalheDoCliente.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoCliente.module.css";

export function DetalheDoCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApiDoPainel();

  // A mesma chamada traz o cadastro e o histórico: ClienteComHistorico.
  const cliente = useRequisicao(() => api.barbeiro.cliente(id), [id]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!cliente.dados) return;
    setNome(cliente.dados.nome);
    setTelefone(cliente.dados.telefone);
    setEmail(cliente.dados.email ?? "");
  }, [cliente.dados]);

  if (cliente.erro) {
    return (
      <Aviso>
        {cliente.erro.codigo === "nao_encontrado"
          ? "Cliente não encontrado."
          : cliente.erro.mensagem}
      </Aviso>
    );
  }
  if (!cliente.dados) return <p>Carregando…</p>;

  async function salvar() {
    setAviso(undefined);
    setErroTelefone(undefined);

    let numero: string;
    try {
      numero = normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    setSalvando(true);
    try {
      await api.barbeiro.atualizarCliente(id, {
        nome: nome.trim(),
        telefone: numero,
        email: email.trim() || null,
      });
      cliente.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  return (
    <div className={estilos.pagina}>
      <h1>{cliente.dados.nome}</h1>

      <Campo rotulo="Nome" valor={nome} onChange={setNome} />
      <Campo
        rotulo="Telefone"
        formato="telefone"
        valor={telefone}
        onChange={(proximo) => {
          setTelefone(proximo);
          setErroTelefone(undefined);
        }}
        erro={erroTelefone}
      />
      <Campo rotulo="E-mail (opcional)" type="email" valor={email} onChange={setEmail} />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Botao carregando={salvando} onClick={salvar}>
        Salvar
      </Botao>

      <h2>Histórico</h2>
      <Tabela
        cabecalho={["Data", "Horário", "Serviços", "Status"]}
        vazio="Esse cliente ainda não tem agendamento."
        aoAbrir={(agendamentoId) => router.push(`/painel/agendamentos/${agendamentoId}`)}
        linhas={cliente.dados.agendamentos.map((agendamento) => ({
          id: agendamento.id,
          celulas: [
            formatarDataLonga(agendamento.data),
            agendamento.horaInicio,
            agendamento.servicos.map((s) => s.nome).join(" + "),
            agendamento.status,
          ],
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/clientes.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/Tabela.tsx apps/web/src/componentes/Tabela.module.css apps/web/src/telas/painel/ListaDeClientes.tsx apps/web/src/telas/painel/CadastroDeCliente.tsx apps/web/src/telas/painel/DetalheDoCliente.tsx apps/web/src/telas/painel/*.module.css "apps/web/app/(painel)/painel/(guardado)/clientes" apps/web/tests/telas/painel/clientes.test.tsx
git commit -m "feat(web): list, create and open the barbershop's clients

The search term lives in the URL, so reloading keeps the filter and a
result is linkable — the same reason the client flow put each step on a
route. Phone is normalised before the call, so a missing area code stays
an error on its field instead of a 400 in English."
```

---

### Task 11: Serviços — lista, cadastro e edição

A lista **inclui os inativos** de propósito: é desta tela que o barbeiro
reativa o que desativou, e um serviço inativo que sumisse seria
irrecuperável pela interface. Não existe `servico(id)` no client — a
tela de edição acha na lista.

**Files:**

- Create: `apps/web/src/telas/painel/ListaDeServicos.tsx`
- Create: `apps/web/src/telas/painel/CadastroDeServico.tsx`
- Create: os `.module.css` correspondentes
- Create: `apps/web/app/(painel)/painel/(guardado)/servicos/page.tsx`
- Create: `apps/web/app/(painel)/painel/(guardado)/servicos/novo/page.tsx`
- Create: `apps/web/app/(painel)/painel/(guardado)/servicos/[id]/page.tsx`
- Test: `apps/web/tests/telas/painel/servicos.test.tsx`

**Interfaces:**

- Consumes: `useApiDoPainel`, `useRequisicao`, `Tabela` (Tarefa 10),
  `formatarPreco`, `Chip`.
- Produces:
  - `ListaDeServicos()`
  - `CadastroDeServico()` — lê `id` de `useParams`; sem `id`, cria

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { CadastroDeServico } from "../../../src/telas/painel/CadastroDeServico";
import { ListaDeServicos } from "../../../src/telas/painel/ListaDeServicos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

function semear() {
  return criarApiClientFalso({
    servicos: [
      { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true },
      { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: false },
    ],
  });
}

describe("serviços no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos" });
  });

  it("lista ativos e inativos, marcando os inativos", async () => {
    // É desta tela que o barbeiro reativa o que desativou; um inativo
    // que sumisse seria irrecuperável pela interface.
    montarPainel(<ListaDeServicos />, semear());

    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Barba")).toBeInTheDocument();
    expect(screen.getByText(/inativo/i)).toBeInTheDocument();
  });

  it("mostra preço e duração", async () => {
    montarPainel(<ListaDeServicos />, semear());

    expect(await screen.findByText("R$ 40,00")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("cria serviço com preço em string", async () => {
    // String, nunca number: o preço é Decimal no banco e float perderia
    // centavo.
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = semear();
    const original = falso.barbeiro.criarServico;
    const criar = vi.fn(
      async (novo: { nome: string; duracaoMinutos: number; preco: string }) =>
        original(novo)
    );
    falso.barbeiro.criarServico = criar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(screen.getByLabelText(/nome/i), "Sobrancelha");
    await userEvent.type(screen.getByLabelText(/duração/i), "15");
    await userEvent.type(screen.getByLabelText(/preço/i), "20,00");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        nome: "Sobrancelha",
        duracaoMinutos: 15,
        preco: "20.00",
      })
    );
  });

  it("a edição chega preenchida com o serviço da lista", async () => {
    // Não existe servico(id) no client — a tela acha em servicos().
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    montarPainel(<CadastroDeServico />, semear());

    expect(await screen.findByDisplayValue("Corte")).toBeInTheDocument();
  });

  it("desativa e reativa", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = semear();
    const original = falso.barbeiro.desativarServico;
    const desativar = vi.fn(async (id: string) => original(id));
    falso.barbeiro.desativarServico = desativar;

    montarPainel(<CadastroDeServico />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /desativar/i }));

    await waitFor(() => expect(desativar).toHaveBeenCalledWith("s1"));
  });

  it("serviço que não existe vira aviso", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s9", params: { id: "s9" } });
    montarPainel(<CadastroDeServico />, semear());

    expect(await screen.findByText(/serviço não encontrado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/servicos.test.tsx`
Expected: FAIL — as duas telas não existem.

- [ ] **Step 3: Implementar**

`ListaDeServicos.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./ListaDeServicos.module.css";

export function ListaDeServicos() {
  const router = useRouter();
  const api = useApiDoPainel();
  // Inclui os inativos: é desta tela que o barbeiro reativa o que
  // desativou, e um inativo que sumisse seria irrecuperável.
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);

  if (servicos.erro) return <Aviso>{servicos.erro.mensagem}</Aviso>;

  return (
    <div className={estilos.pagina}>
      <div className={estilos.topo}>
        <h1>Serviços</h1>
        <Botao onClick={() => router.push("/painel/servicos/novo")}>+ Novo</Botao>
      </div>

      <Tabela
        cabecalho={["Nome", "Duração", "Preço", ""]}
        vazio="Nenhum serviço cadastrado ainda."
        aoAbrir={(id) => router.push(`/painel/servicos/${id}`)}
        linhas={(servicos.dados ?? []).map((servico) => ({
          id: servico.id,
          celulas: [
            servico.nome,
            `${servico.duracaoMinutos} min`,
            formatarPreco(servico.preco),
            servico.ativo ? null : <Chip tom="neutro">inativo</Chip>,
          ],
        }))}
      />
    </div>
  );
}
```

`CadastroDeServico.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./CadastroDeServico.module.css";

// "20,00" e "20.00" viram a mesma string decimal. Number entra só na
// validação, nunca no que é enviado: o preço é Decimal no banco.
function paraDecimal(digitado: string): string | null {
  const limpo = digitado.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Number(limpo).toFixed(2);
}

export function CadastroDeServico() {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const api = useApiDoPainel();

  // Não existe servico(id) no client: cliente(id) e agendamento(id)
  // existem, este não. A lista basta, e devolve inclusive os inativos.
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);
  const atual = id ? servicos.dados?.find((s) => s.id === id) : undefined;

  const [nome, setNome] = useState("");
  const [duracao, setDuracao] = useState("");
  const [preco, setPreco] = useState("");
  const [erroPreco, setErroPreco] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!atual) return;
    setNome(atual.nome);
    setDuracao(String(atual.duracaoMinutos));
    setPreco(atual.preco);
  }, [atual]);

  if (id && servicos.dados && !atual) {
    return <Aviso>Serviço não encontrado.</Aviso>;
  }

  async function salvar() {
    setAviso(undefined);
    setErroPreco(undefined);

    const decimal = paraDecimal(preco);
    if (!decimal) {
      setErroPreco("Use um valor como 40,00");
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        nome: nome.trim(),
        duracaoMinutos: Number(duracao),
        preco: decimal,
      };
      if (id) await api.barbeiro.atualizarServico(id, corpo);
      else await api.barbeiro.criarServico(corpo);
      router.push("/painel/servicos");
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  async function alternarAtivo() {
    if (!id || !atual) return;
    setSalvando(true);
    try {
      // Soft delete: some da lista pública e o histórico de quem já foi
      // atendido sobrevive.
      if (atual.ativo) await api.barbeiro.desativarServico(id);
      else await api.barbeiro.atualizarServico(id, { ativo: true });
      servicos.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  return (
    <div className={estilos.pagina}>
      <h1>{id ? "Editar serviço" : "Novo serviço"}</h1>

      <Campo rotulo="Nome" valor={nome} onChange={setNome} />
      <Campo rotulo="Duração em minutos" valor={duracao} onChange={setDuracao} />
      <Campo
        rotulo="Preço"
        valor={preco}
        onChange={(proximo) => {
          setPreco(proximo);
          setErroPreco(undefined);
        }}
        erro={erroPreco}
      />

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <Botao carregando={salvando} onClick={salvar}>
        Salvar
      </Botao>

      {atual ? (
        <Botao variante="contorno" carregando={salvando} onClick={alternarAtivo}>
          {atual.ativo ? "Desativar" : "Reativar"}
        </Botao>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/servicos.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/telas/painel/ListaDeServicos.tsx apps/web/src/telas/painel/CadastroDeServico.tsx "apps/web/app/(painel)/painel/(guardado)/servicos" apps/web/tests/telas/painel/servicos.test.tsx
git commit -m "feat(web): manage services, inactive ones included

servicos() returns inactive services on purpose: this screen is where a
barber reactivates what they turned off, and one that vanished from the
list would be unreachable through the interface. Price stays a string
the whole way — it is Decimal in the database, and a float would lose a
cent. There is no servico(id) on the client, so the edit screen finds
its service in the list."
```

---

### Task 12: `/painel/configuracoes`

Três blocos: dados da barbearia, horários da semana e perfil do
barbeiro. O bloco de horários manda a semana inteira num `PUT` — dia
ausente do corpo vira fechado na API, de propósito.

**Files:**

- Create: `apps/web/src/telas/painel/ConfiguracoesDaBarbearia.tsx`
- Create: `apps/web/src/telas/painel/ConfiguracoesDaBarbearia.module.css`
- Create: `apps/web/app/(painel)/painel/(guardado)/configuracoes/page.tsx`
- Test: `apps/web/tests/telas/painel/configuracoes.test.tsx`

**Interfaces:**

- Consumes: `useApiDoPainel`, `usePainel`, `useRequisicao`, `Campo`,
  `Botao`, `Aviso`, `normalizarTelefoneObrigatorio`, `TelefoneInvalido`.
- Produces: `ConfiguracoesDaBarbearia()`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { ConfiguracoesDaBarbearia } from "../../../src/telas/painel/ConfiguracoesDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

describe("configurações da barbearia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("chega preenchida com os dados da barbearia", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByDisplayValue("GR Barber")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rua das Tesouras, 123")).toBeInTheDocument();
  });

  it("salva os dados da barbearia", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const salvar = vi.fn(async (edicao: { nome?: string; endereco?: string | null }) =>
      original(edicao)
    );
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const campo = await screen.findByLabelText(/nome da barbearia/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "GR Barber Centro");
    await userEvent.click(screen.getByRole("button", { name: /salvar dados/i }));

    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ nome: "GR Barber Centro" }))
    );
  });

  it("manda a semana inteira, inclusive os dias fechados", async () => {
    // Dia ausente do corpo vira fechado na API, de propósito: "sem
    // linha" e "fechado" são estados diferentes pro cálculo de
    // disponibilidade. A tela edita os sete e envia os sete, sempre.
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) =>
      original(horarios)
    );
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][0]).toHaveLength(7);
  });

  it("fechar um dia limpa abertura e fechamento", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) =>
      original(horarios)
    );
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("checkbox", { name: /fechado na segunda/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const segunda = salvar.mock.calls[0][0].find((h) => h.diaSemana === 1);
    expect(segunda).toMatchObject({ fechado: true, horaAbertura: null, horaFechamento: null });
  });

  it("telefone do perfil sem DDD para no campo", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    await userEvent.type(await screen.findByLabelText(/seu telefone/i), "988887777");
    await userEvent.click(screen.getByRole("button", { name: /salvar perfil/i }));

    expect(await screen.findByText(/informe o DDD/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/configuracoes.test.tsx`
Expected: FAIL — a tela não existe.

- [ ] **Step 3: Implementar**

Três estados independentes, um por bloco, cada um com seu botão — um
salvar único mandaria três requisições e deixaria metade aplicada quando
uma falhasse.

```tsx
"use client";

import { useEffect, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import type { HorarioSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./ConfiguracoesDaBarbearia.module.css";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Vazio vira null, que é o que a API aceita pra limpar o campo; string
// vazia seria 400 do pattern.
function telefoneOuNulo(digitado: string): string | null {
  return digitado.trim() ? normalizarTelefoneObrigatorio(digitado) : null;
}

export function ConfiguracoesDaBarbearia() {
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();

  const horariosSalvos = useRequisicao(() => api.barbeiro.horarios(), []);

  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [telefoneDaBarbearia, setTelefoneDaBarbearia] = useState("");
  const [endereco, setEndereco] = useState("");
  const [semana, setSemana] = useState<HorarioSerializado[]>([]);
  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(perfil.telefone ?? "");
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();

  // A API tem PATCH /barbearias/me e nenhum GET: a única leitura dos
  // dados da própria barbearia é a rota pública por slug. Daí o painel
  // precisar do escopo publico também aqui, e não só na
  // disponibilidade.
  const barbearia = useRequisicao(() => api.publico.perfilDaBarbearia(slug), [slug]);

  useEffect(() => {
    if (!barbearia.dados) return;
    setNomeDaBarbearia(barbearia.dados.nome);
    setTelefoneDaBarbearia(barbearia.dados.telefone ?? "");
    setEndereco(barbearia.dados.endereco ?? "");
  }, [barbearia.dados]);

  useEffect(() => {
    if (horariosSalvos.dados) setSemana(horariosSalvos.dados);
  }, [horariosSalvos.dados]);

  async function salvarDados() {
    setAviso(undefined);
    setErro({});
    try {
      await api.barbeiro.atualizarMinhaBarbearia({
        nome: nomeDaBarbearia.trim(),
        telefone: telefoneOuNulo(telefoneDaBarbearia),
        endereco: endereco.trim() || null,
      });
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({ telefoneDaBarbearia: "Informe o DDD e o número, como (11) 99999-8888" });
        return;
      }
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
  }

  async function salvarHorarios() {
    setAviso(undefined);
    try {
      // A semana inteira, sempre: dia ausente do corpo vira fechado na
      // API, de propósito — "sem linha" e "fechado" são estados
      // diferentes pro cálculo de disponibilidade.
      await api.barbeiro.salvarHorarios(semana);
      horariosSalvos.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
  }

  async function salvarPerfil() {
    setAviso(undefined);
    setErro({});
    try {
      await api.barbeiro.atualizarMeuPerfil({
        nome: nome.trim(),
        telefone: telefoneOuNulo(telefone),
      });
    } catch (causa) {
      if (causa instanceof TelefoneInvalido) {
        setErro({ telefone: "Informe o DDD e o número, como (11) 99999-8888" });
        return;
      }
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
  }

  function trocarDia(diaSemana: number, mudanca: Partial<HorarioSerializado>) {
    setSemana((atual) =>
      atual.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...mudanca } : dia))
    );
  }

  return (
    <div className={estilos.pagina}>
      <h1>Configurações</h1>
      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <section>
        <h2>Barbearia</h2>
        <Campo rotulo="Nome da barbearia" valor={nomeDaBarbearia} onChange={setNomeDaBarbearia} />
        <Campo
          rotulo="Telefone da barbearia"
          formato="telefone"
          valor={telefoneDaBarbearia}
          onChange={setTelefoneDaBarbearia}
          erro={erro.telefoneDaBarbearia}
        />
        <Campo rotulo="Endereço" valor={endereco} onChange={setEndereco} />
        <Botao onClick={salvarDados}>Salvar dados</Botao>
      </section>

      <section>
        <h2>Horário de funcionamento</h2>
        {semana.map((dia) => (
          <div key={dia.diaSemana} className={estilos.dia}>
            <span>{DIAS[dia.diaSemana]}</span>
            <label>
              <input
                type="checkbox"
                aria-label={`Fechado na ${DIAS[dia.diaSemana]}`}
                checked={dia.fechado}
                onChange={(evento) =>
                  // Fechar limpa as horas: deixar a hora antiga junto de
                  // fechado guardaria um estado que a API não usa e que
                  // a próxima leitura reexibiria.
                  trocarDia(
                    dia.diaSemana,
                    evento.target.checked
                      ? { fechado: true, horaAbertura: null, horaFechamento: null }
                      : { fechado: false, horaAbertura: "09:00", horaFechamento: "18:00" }
                  )
                }
              />
              fechado
            </label>
            {dia.fechado ? null : (
              <>
                <Campo
                  rotulo={`Abre na ${DIAS[dia.diaSemana]}`}
                  valor={dia.horaAbertura ?? ""}
                  onChange={(valor) => trocarDia(dia.diaSemana, { horaAbertura: valor })}
                />
                <Campo
                  rotulo={`Fecha na ${DIAS[dia.diaSemana]}`}
                  valor={dia.horaFechamento ?? ""}
                  onChange={(valor) => trocarDia(dia.diaSemana, { horaFechamento: valor })}
                />
              </>
            )}
          </div>
        ))}
        <Botao onClick={salvarHorarios}>Salvar horários</Botao>
      </section>

      <section>
        <h2>Seu perfil</h2>
        <Campo rotulo="Seu nome" valor={nome} onChange={setNome} />
        <Campo
          rotulo="Seu telefone"
          formato="telefone"
          valor={telefone}
          onChange={setTelefone}
          erro={erro.telefone}
        />
        <Botao onClick={salvarPerfil}>Salvar perfil</Botao>
      </section>
    </div>
  );
}
```

**A assimetria que este arquivo esbarra, já verificada:** a API tem
`PATCH /barbearias/me` (`apps/api/src/routers/barbearias.ts:38`) e
**nenhum `GET`**. A única leitura dos dados da própria barbearia é a
rota pública `GET /barbearias/:slug`, que devolve
`PerfilPublicoBarbearia`. É o mesmo tipo de buraco que a Tarefa 11
encontrou com o `servico(id)` ausente, e a saída é a mesma: usar o que
existe, com o comentário dizendo por quê. Fechar de verdade seria um
`GET /barbearias/me` na API, que é mudança de API e está fora do escopo
deste sub-projeto — registre nas dívidas do roadmap na Tarefa 13.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/configuracoes.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/telas/painel/ConfiguracoesDaBarbearia.tsx apps/web/src/telas/painel/ConfiguracoesDaBarbearia.module.css "apps/web/app/(painel)/painel/(guardado)/configuracoes" apps/web/tests/telas/painel/configuracoes.test.tsx
git commit -m "feat(web): edit the barbershop, its week and the barber's profile

The week goes out whole on every save: a day missing from the body
becomes closed in the API, on purpose, because \"no row\" and \"closed\"
are different states for the availability calculation. Three blocks with
three save buttons rather than one, so a failure leaves the other two
untouched."
```

---

### Task 13: Limpeza e documentação

Fecha o critério 4 da spec da fundação e registra a divergência do mapa,
como o sub-projeto B fez com a oitava tela.

**Files:**

- Delete: `apps/web/app/primitivos/page.tsx`
- Delete: `apps/web/app/primitivos/page.module.css`
- Modify: `docs/screens.md`
- Modify: `docs/roadmap.md`
- Modify: `apps/web/README.md`

- [ ] **Step 1: Conferir que nada aponta pra vitrine**

Run: `rg -n "primitivos" --glob '!node_modules' .`
Expected: só os dois arquivos que vão sair, mais menções em specs (que
ficam — spec é registro do que foi decidido, não documentação viva).

- [ ] **Step 2: Remover a vitrine**

```bash
git rm -r apps/web/app/primitivos
```

Run: `pnpm --filter @barchop/web build`
Expected: PASS — se algum CSS global dependia da página, o build acusa.

- [ ] **Step 3: Atualizar `docs/screens.md`**

Substituir a seção "Painel web (6 telas)" por:

```markdown
## Painel web (12 rotas)

O mapa previa seis telas — Login, Dashboard, Agenda, Clientes, Serviços
e Configurações. São doze rotas, por duas razões.

Quatro são telas que este mapa deu ao app do barbeiro e não ao painel,
para a mesma função: detalhe do agendamento, novo agendamento, cadastro
de cliente e cadastro de serviço.

A décima segunda o mapa não tem em lugar nenhum: **criar barbearia**. O
primeiro acesso estava na tela de login do app do barbeiro, que é o
sub-projeto D; como o painel veio antes, ele é o único caminho pelo qual
uma barbearia pode existir.

| Rota | O que faz |
|---|---|
| `/painel/entrar` | Entrar, e criar a barbearia no primeiro acesso |
| `/painel` | Dashboard: contagem, ocupação, previsto e a lista do dia |
| `/painel/agenda` | O dia em faixas, com a semana em cima |
| `/painel/agendamentos/novo` | Cliente, serviços, data e horário numa tela |
| `/painel/agendamentos/[id]` | Status e observações |
| `/painel/clientes` | Lista com busca na URL |
| `/painel/clientes/novo` | Nome, telefone e email |
| `/painel/clientes/[id]` | Dados e histórico |
| `/painel/servicos` | Lista, inativos inclusive |
| `/painel/servicos/novo` | Nome, duração e preço |
| `/painel/servicos/[id]` | Editar, desativar e reativar |
| `/painel/configuracoes` | Barbearia, horários da semana e perfil |

O prefixo `/painel` existe porque o slug da barbearia não tem lista de
reservados: uma rota estática na raiz tornaria aquele slug inalcançável.
```

- [ ] **Step 4: Atualizar `docs/roadmap.md`**

No passo 3, marcar o C como pronto, no formato dos dois anteriores:
PR, commit de merge, data, número de rotas, contagem final de testes, e
a divergência do mapa. Acrescentar às "Dívidas conhecidas" as duas que a
spec registra: o slug em `localStorage` ficando velho numa aba antiga, e
a ausência de lista de slugs reservados na API.

- [ ] **Step 5: Verificação final**

Run: `pnpm test`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

Run: `pnpm build`
Expected: PASS

Suba a API e o web e percorra à mão o critério 3 da spec: criar
barbearia em `/painel/entrar`, cadastrar um serviço e o horário de
funcionamento, e abrir `/<slug>` para agendar pelo fluxo do cliente. É a
prova de que B e C se encontram.

Confirme também o critério 4: trocar o tema pelo botão, recarregar e ver
que ele permanece sem piscar; e abrir `/<slug>` com o sistema em modo
escuro e ver que a página continua clara.

- [ ] **Step 6: Commit**

```bash
git add docs/screens.md docs/roadmap.md apps/web/README.md
git commit -m "docs: record the panel as done, and the twelve routes

The map gave the panel six screens. Four of the remaining six are
screens it gave to the Expo app for the same function; the twelfth,
creating a barbershop, it has nowhere — first access lived on the app's
login, and the panel shipped first. The primitives showcase goes away,
closing the foundation spec's fourth completion criterion."
```
