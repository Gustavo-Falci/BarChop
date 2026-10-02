# Agenda com estrutura de calendário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** substituir `/painel/agenda` por três vistas — dia, semana e mês
— com eixo de tempo e eventos de altura proporcional à duração, de modo
que a agenda pare de mostrar como livre um horário ocupado.

**Architecture:** um módulo de domínio puro (`src/painel/grade.ts`)
devolve índices de linha e span; os componentes só posicionam com CSS
Grid, uma linha por 5 minutos. Dia e semana são o mesmo componente com 1
ou 7 colunas. O mês é outro componente, célula por dia. Estado de vista e
data na URL.

**Tech Stack:** Next 16.3, React 19.2, TypeScript, CSS Modules, Vitest 4
com jsdom e Testing Library, `@barchop/api-client` (com
`criarApiClientFalso`), `@barchop/types`.

**Spec:** `docs/superpowers/specs/2026-09-12-agenda-calendario-design.md`

## Global Constraints

Valem em toda tarefa.

- **Trabalhe na `main`.** O dono do projeto pediu explicitamente para não
  criar branch nova nesta leva.
- **Uma linha da grade é 5 minutos.** `duracaoMinutos` é `multipleOf: 5`
  (`apps/api/src/routers/servicos.ts:21`) e os inícios caem na grade de
  15 do `packages/scheduling`. Nunca arredonde: se algum cálculo precisar
  de `Math.round`, o cálculo está errado.
- **Toda função que olhe relógio recebe `agora: Date` por parâmetro**,
  com `new Date()` como padrão, e todo teste com data fixa passa o
  instante. Fake timers não entram nesta suíte. Teste que compara data
  fixa com relógio real passa hoje e falha sozinho depois — já aconteceu
  neste repositório.
- **Rodar um arquivo só:**
  `pnpm --filter @barchop/web exec vitest run <caminho>`. O `--` do
  pnpm não chega ao vitest.
- **Não existe `next lint` no Next 16.** A verificação é
  `pnpm --filter @barchop/web exec tsc --noEmit` e a suíte.
- **`pnpm test` na raiz fica vermelho enquanto a API de dev estiver
  rodando** — o processo segura
  `node_modules/.prisma/client/query_engine-windows.dll.node` e
  `prisma generate` falha com `EPERM`, derrubando
  `@barchop/database#build`, que é dependência de `turbo run test`.
  Use `pnpm -r test`, ou mate a API antes.
- **CSS Modules, um arquivo por componente.** Tokens sempre por
  `var(--cor-*)`, `var(--espaco-*)`, `var(--texto-*)`, `var(--raio-*)`,
  `var(--borda-*)`. Sem CSS-in-JS.
- **A sombra deslocada usa `var(--cor-shadow)`**, nunca `--cor-ink`. São
  cores diferentes no tema claro.
- **A suíte roda sem `globals: true`**: importe `describe`, `it`,
  `expect`, `beforeEach` e `vi` de `vitest` em todo arquivo.
- **`vi.fn()` declara os parâmetros** (`vi.fn(async (id: string) => …)`).
  Sem eles `mock.calls` vira tupla vazia e a asserção quebra no
  type-check com o teste verde.
- **Trace toda asserção contra a REMOÇÃO do ramo, não só a inversão.**
  Antes de dar uma tarefa por pronta, apague a linha que o teste
  deveria proteger e confirme que ele fica vermelho.
- **Commits em inglês**, no formato dos que já existem (`feat(web): …`,
  `fix(web): …`, `test(web): …`, `docs: …`), terminando com:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TQCtyPJTvhXSkodwgPDK2D
  ```

### Armadilha registrada: não unifique `gradeDoMes` com `diasDoMes`

`apps/web/src/formato/datas.ts:47` já tem `diasDoMes(mes)`, que devolve
`(string | null)[]` com `null` nas casas antes do dia 1. Ela serve o
`Calendario` do fluxo do cliente e **fica como está**.

`gradeDoMes` desta leva é outra coisa: precisa de **datas reais** nas
bordas, porque as células de preenchimento mostram agendamentos dos meses
vizinhos. Trocar uma pela outra faz esses agendamentos sumirem.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
| --- | --- | --- |
| `apps/web/src/painel/grade.ts` | domínio puro: janela, posições, pistas, células do mês | 1, 2, 3 |
| `apps/web/tests/painel/grade.test.ts` | testes do domínio | 1, 2, 3 |
| `apps/web/src/componentes/GradeDeTempo.tsx` | eixo de tempo; dia e semana | 4 |
| `apps/web/src/componentes/GradeDeTempo.module.css` | grid de 5 min, pistas, linha do agora | 4 |
| `apps/web/src/componentes/GradeDoMes.tsx` | células do mês com chips | 5 |
| `apps/web/src/componentes/GradeDoMes.module.css` | grade 7 × N | 5 |
| `apps/web/src/componentes/SeletorDeVista.tsx` | `[Dia][Semana][Mês]` e `‹ Hoje ›` | 6 |
| `apps/web/src/componentes/SeletorDeVista.module.css` | estilo do seletor | 6 |
| `apps/web/src/telas/painel/Agenda.tsx` | orquestra; substitui `AgendaDoDia.tsx` | 7 |
| `apps/web/src/telas/painel/Agenda.module.css` | substitui `AgendaDoDia.module.css` | 7 |
| `apps/web/app/(painel)/painel/(guardado)/agenda/page.tsx` | passa a montar `Agenda` | 7 |

**Removidos na Tarefa 7:** `src/componentes/GradeDeAgenda.tsx`,
`src/componentes/GradeDeAgenda.module.css`,
`src/telas/painel/AgendaDoDia.tsx`, `src/telas/painel/AgendaDoDia.module.css`,
`tests/componentes/GradeDeAgenda.test.tsx`.

---

### Task 1: Domínio — janela de tempo, colunas e faixas livres

**Files:**
- Modify: `apps/web/src/painel/grade.ts` (reescreve `faixasDoDia`; mantém `diasDaSemana`)
- Test: `apps/web/tests/painel/grade.test.ts` (criar)

**Interfaces:**
- Consumes: `AgendamentoComCliente` e `HorarioSerializado` de `@barchop/types`; `horaJaPassou` de `../formato/datas`.
- Produces: `MINUTOS_POR_LINHA`, `EventoPosicionado`, `FaixaLivre`, `ColunaDeDia`, `GradeDeTempo`, `gradeDeTempo(entrada)`. As tarefas 2, 4 e 7 dependem destes nomes exatos.

Nesta tarefa `pista` é sempre `0` e `pistas` sempre `1`. A Tarefa 2 os
calcula de verdade — o campo já existe aqui para o tipo não mudar depois.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/tests/painel/grade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { gradeDeTempo, MINUTOS_POR_LINHA } from "../../src/painel/grade";

const CLIENTE = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-0001",
  email: null,
  temConta: false,
};

// Segunda a sábado das 09 às 18; domingo fechado — o mesmo desenho do
// `criarApiClientFalso`, para que domínio e dublê não discordem.
const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

function agendamento(
  entrada: { id: string; data: string; horaInicio: string; horaFim: string }
): AgendamentoComCliente {
  return {
    id: entrada.id,
    data: entrada.data,
    horaInicio: entrada.horaInicio,
    horaFim: entrada.horaFim,
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    servicos: [
      { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
    ],
    cliente: CLIENTE,
  };
}

// 2026-09-08 é uma terça-feira.
const TERCA = "2026-09-08";
const AGORA = new Date("2026-09-08T10:00:00-03:00");

describe("gradeDeTempo", () => {
  it("posiciona o evento pela hora de início e o dimensiona pela duração", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
      ],
      agora: AGORA,
    });

    expect(MINUTOS_POR_LINHA).toBe(5);
    // Janela abre às 09:00; 10:00 é 60 minutos depois = 12 linhas, e a
    // linha é 1-based porque entra direto em grid-row.
    const evento = grade.colunas[0].eventos[0];
    expect(evento.linha).toBe(13);
    expect(evento.linhas).toBe(12);
    expect(evento.agendamento.id).toBe("a1");
  });

  it("não oferece faixa livre dentro do intervalo que o agendamento ocupa", () => {
    // ESTE é o bug que motivou o trabalho: a grade antiga casava o
    // agendamento só por horaInicio, então 10:15, 10:30 e 10:45 saíam
    // como "livre" em cima da cadeira ocupada.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
      ],
      agora: AGORA,
    });

    const horasLivres = grade.colunas[0].livres.map((faixa) => faixa.hora);

    expect(horasLivres).not.toContain("10:00");
    expect(horasLivres).not.toContain("10:15");
    expect(horasLivres).not.toContain("10:30");
    expect(horasLivres).not.toContain("10:45");
    // E a faixa imediatamente seguinte volta a ser oferecida, senão o
    // teste passaria com uma implementação que apaga tudo.
    expect(horasLivres).toContain("11:00");
  });

  it("estica a janela para conter agendamento fora do horário de funcionamento", () => {
    // PATCH /horarios não valida contra agendamentos existentes: mudar o
    // funcionamento depois de alguém marcar deixaria o agendamento fora
    // da janela. Sem esticar, ele fica invisível na agenda.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "07:30", horaFim: "08:00" }),
      ],
      agora: AGORA,
    });

    expect(grade.minutoInicial).toBe(7 * 60 + 30);
    expect(grade.colunas[0].eventos[0].linha).toBe(1);
  });

  it("marca o dia fechado e não gera faixa livre nele", () => {
    const domingo = "2026-09-06";

    const grade = gradeDeTempo({
      dias: [domingo, "2026-09-07"],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    expect(grade.colunas[0].fechado).toBe(true);
    expect(grade.colunas[0].livres).toHaveLength(0);
    // A segunda-feira ao lado continua aberta — sem isto, uma
    // implementação que marca tudo como fechado passaria.
    expect(grade.colunas[1].fechado).toBe(false);
    expect(grade.colunas[1].livres.length).toBeGreaterThan(0);
  });

  it("ignora agendamento de dia que não está na grade", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: "2026-09-09", horaInicio: "10:00", horaFim: "11:00" }),
      ],
      agora: AGORA,
    });

    expect(grade.colunas).toHaveLength(1);
    expect(grade.colunas[0].eventos.map((e) => e.agendamento.id)).toEqual(["a1"]);
  });

  it("descarta agendamento cancelado", () => {
    const cancelado = {
      ...agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
      status: "cancelado",
    };

    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [cancelado],
      agora: AGORA,
    });

    expect(grade.colunas[0].eventos).toHaveLength(0);
    // E a faixa volta a ser oferecida: cancelar libera a cadeira.
    expect(grade.colunas[0].livres.map((f) => f.hora)).toContain("10:00");
  });

  it("põe a linha do agora no dia de hoje, e em nenhum outro", () => {
    const grade = gradeDeTempo({
      dias: ["2026-09-07", TERCA, "2026-09-09"],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    // 10:00 com janela abrindo às 09:00 = 60 min = linha 13.
    expect(grade.agora).toEqual({ data: TERCA, linha: 13 });
  });

  it("não põe linha do agora quando hoje está fora dos dias mostrados", () => {
    const grade = gradeDeTempo({
      dias: ["2026-10-06"],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    expect(grade.agora).toBeNull();
  });

  it("marca como passada só a faixa de hoje que já passou", () => {
    const grade = gradeDeTempo({
      dias: [TERCA, "2026-09-09"],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    const hoje = grade.colunas[0];
    expect(hoje.livres.find((f) => f.hora === "09:00")?.passada).toBe(true);
    expect(hoje.livres.find((f) => f.hora === "11:00")?.passada).toBe(false);
    // Amanhã às 09:00 não passou, por mais tarde que seja agora.
    const amanha = grade.colunas[1];
    expect(amanha.livres.find((f) => f.hora === "09:00")?.passada).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: FAIL — `gradeDeTempo` não é exportado por `../../src/painel/grade`.

- [ ] **Step 3: Write the implementation**

Em `apps/web/src/painel/grade.ts`, remova `faixasDoDia` e a interface
`Faixa`, mantenha `diasDaSemana`, `emMinutos` e `emHora`, e acrescente:

```ts
// Uma linha da grade é 5 minutos. `duracaoMinutos` é multipleOf 5
// (apps/api/src/routers/servicos.ts:21) e os inícios caem na grade de 15
// do packages/scheduling: todo evento alinha exato, e nenhum cálculo
// aqui arredonda.
export const MINUTOS_POR_LINHA = 5;

// A granularidade que se oferece para criar, que é a do motor de
// disponibilidade — não a da grade.
const PASSO_LIVRE = 15;

export interface EventoPosicionado {
  agendamento: AgendamentoComCliente;
  linha: number;    // 1-based, entra direto em grid-row
  linhas: number;   // span
  pista: number;    // 0-based, qual pista dentro do grupo sobreposto
  pistas: number;   // quantas pistas o grupo tem
}

export interface FaixaLivre {
  hora: string;     // "HH:mm" — o que vai na URL de novo agendamento
  linha: number;
  linhas: number;
  passada: boolean;
}

export interface ColunaDeDia {
  data: string;
  fechado: boolean;
  eventos: EventoPosicionado[];
  livres: FaixaLivre[];
}

export interface GradeDeTempo {
  minutoInicial: number;
  minutoFinal: number;
  totalLinhas: number;
  colunas: ColunaDeDia[];
  // Onde desenhar a régua do agora, ou null quando o instante não cai
  // em nenhum dos dias mostrados.
  agora: { data: string; linha: number } | null;
}

function diaDaSemanaDe(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

function horarioDe(
  data: string,
  horarios: HorarioSerializado[]
): HorarioSerializado | undefined {
  return horarios.find((h) => h.diaSemana === diaDaSemanaDe(data));
}

function aberto(
  horario: HorarioSerializado | undefined
): horario is HorarioSerializado & { horaAbertura: string; horaFechamento: string } {
  return Boolean(
    horario && !horario.fechado && horario.horaAbertura && horario.horaFechamento
  );
}

export function gradeDeTempo(entrada: {
  dias: string[];
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
  agora: Date;
}): GradeDeTempo {
  const { dias, horarios, agendamentos, agora } = entrada;

  // Só o que pertence aos dias mostrados: quem chama pode ter buscado um
  // intervalo maior (o mês busca a grade inteira).
  const doPeriodo = agendamentos.filter(
    (a) => dias.includes(a.data) && a.status !== "cancelado"
  );

  const aberturas = dias.map((d) => horarioDe(d, horarios)).filter(aberto);

  // A janela cobre o horário de funcionamento E todo agendamento que
  // exista. Agendamento fora do horário acontece: PATCH /horarios não
  // valida contra os já marcados, e deixá-lo fora da janela o tornaria
  // invisível — a pior falha possível nesta tela.
  const inicios = [
    ...aberturas.map((h) => emMinutos(h.horaAbertura)),
    ...doPeriodo.map((a) => emMinutos(a.horaInicio)),
  ];
  const fins = [
    ...aberturas.map((h) => emMinutos(h.horaFechamento)),
    ...doPeriodo.map((a) => emMinutos(a.horaFim)),
  ];

  const minutoInicial = inicios.length ? Math.min(...inicios) : 0;
  const minutoFinal = fins.length ? Math.max(...fins) : 0;
  const totalLinhas = Math.max(
    0,
    (minutoFinal - minutoInicial) / MINUTOS_POR_LINHA
  );

  const linhaDe = (minuto: number) =>
    (minuto - minutoInicial) / MINUTOS_POR_LINHA + 1;

  const colunas: ColunaDeDia[] = dias.map((data) => {
    const horario = horarioDe(data, horarios);
    const doDia = doPeriodo
      .filter((a) => a.data === data)
      .sort((um, outro) => um.horaInicio.localeCompare(outro.horaInicio));

    const eventos: EventoPosicionado[] = doDia.map((agendamento) => {
      const inicio = emMinutos(agendamento.horaInicio);
      const fim = emMinutos(agendamento.horaFim);
      return {
        agendamento,
        linha: linhaDe(inicio),
        linhas: (fim - inicio) / MINUTOS_POR_LINHA,
        // A Tarefa 2 calcula as pistas de verdade.
        pista: 0,
        pistas: 1,
      };
    });

    const livres: FaixaLivre[] = [];
    if (aberto(horario)) {
      const abre = emMinutos(horario.horaAbertura);
      const fecha = emMinutos(horario.horaFechamento);

      for (let minuto = abre; minuto < fecha; minuto += PASSO_LIVRE) {
        // Ocupado é qualquer minuto entre início e fim, não só o início:
        // é exatamente o que a grade antiga errava.
        const ocupado = doDia.some(
          (a) =>
            emMinutos(a.horaInicio) <= minuto && minuto < emMinutos(a.horaFim)
        );
        if (ocupado) continue;

        const hora = emHora(minuto);
        livres.push({
          hora,
          linha: linhaDe(minuto),
          linhas: PASSO_LIVRE / MINUTOS_POR_LINHA,
          passada: horaJaPassou(data, hora, agora),
        });
      }
    }

    return { data, fechado: !aberto(horario), eventos, livres };
  });

  const hoje = hojeIso(agora);
  const minutoAgora = agora.getHours() * 60 + agora.getMinutes();
  const mostrandoHoje = dias.includes(hoje);
  const dentroDaJanela =
    minutoAgora >= minutoInicial && minutoAgora < minutoFinal;

  return {
    minutoInicial,
    minutoFinal,
    totalLinhas,
    colunas,
    agora:
      mostrandoHoje && dentroDaJanela
        ? { data: hoje, linha: linhaDe(minutoAgora) }
        : null,
  };
}
```

Ajuste o topo do arquivo para importar o que passou a usar:

```ts
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { hojeIso, horaJaPassou } from "../formato/datas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Confirme a regressão por mutação**

Troque a condição de ocupado por `emMinutos(a.horaInicio) === minuto`
(que é o bug antigo) e rode de novo.
Expected: FAIL em "não oferece faixa livre dentro do intervalo".
Desfaça em seguida.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/painel/grade.ts apps/web/tests/painel/grade.test.ts
git commit -m "feat(web): position agenda events by start and duration"
```

---

### Task 2: Domínio — pistas para agendamentos sobrepostos

**Files:**
- Modify: `apps/web/src/painel/grade.ts`
- Test: `apps/web/tests/painel/grade.test.ts`

**Interfaces:**
- Consumes: `EventoPosicionado`, `gradeDeTempo` da Tarefa 1.
- Produces: nada novo; `pista` e `pistas` passam a ser calculados. A Tarefa 4 os usa para `grid-column`.

Contexto: `GET /agendamentos` filtra por `barbeariaId`
(`apps/api/src/routers/agendamentos.ts:214`), mas a exclusion constraint é
`EXCLUDE USING gist (barbeiro_id WITH =, periodo WITH &&)`
(`migration.sql:174`) — impede sobreposição por barbeiro, não por
barbearia. Hoje toda barbearia tem um barbeiro só (`barbeiro.create` só
existe no signup), então isto é defesa, não recurso.

- [ ] **Step 1: Write the failing test**

Acrescente ao `describe("gradeDeTempo")` de
`apps/web/tests/painel/grade.test.ts`:

```ts
  it("põe agendamentos sobrepostos em pistas, sem descartar nenhum", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: TERCA, horaInicio: "10:30", horaFim: "11:30" }),
      ],
      agora: AGORA,
    });

    const eventos = grade.colunas[0].eventos;
    // Os dois sobrevivem: a grade antiga usava .find() e ficava só com
    // o primeiro, sumindo com o segundo em silêncio.
    expect(eventos).toHaveLength(2);
    expect(eventos.map((e) => e.pista)).toEqual([0, 1]);
    expect(eventos.every((e) => e.pistas === 2)).toBe(true);
  });

  it("devolve pista única quando os agendamentos apenas se encostam", () => {
    // 11:00 começa exatamente quando 10:00–11:00 termina: encostar não é
    // sobrepor. Sem esta distinção, um dia cheio viraria uma coluna
    // espremida em N pistas.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: TERCA, horaInicio: "11:00", horaFim: "12:00" }),
      ],
      agora: AGORA,
    });

    expect(grade.colunas[0].eventos.every((e) => e.pistas === 1)).toBe(true);
  });

  it("agrupa em três pistas quando três se cruzam", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: TERCA, horaInicio: "10:15", horaFim: "11:15" }),
        agendamento({ id: "a3", data: TERCA, horaInicio: "10:30", horaFim: "11:30" }),
      ],
      agora: AGORA,
    });

    const eventos = grade.colunas[0].eventos;
    expect(eventos.map((e) => e.pista)).toEqual([0, 1, 2]);
    expect(eventos.every((e) => e.pistas === 3)).toBe(true);
  });

  it("reaproveita a pista livre depois que o grupo se fecha", () => {
    // a3 não cruza com a1 nem com a2, então abre grupo novo e volta pra
    // pista 0 ocupando a coluna inteira. Sem fechar o grupo, a tela
    // inteira herdaria a largura do pior momento do dia.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: TERCA, horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: TERCA, horaInicio: "10:30", horaFim: "11:30" }),
        agendamento({ id: "a3", data: TERCA, horaInicio: "14:00", horaFim: "15:00" }),
      ],
      agora: AGORA,
    });

    const a3 = grade.colunas[0].eventos.find((e) => e.agendamento.id === "a3");
    expect(a3?.pista).toBe(0);
    expect(a3?.pistas).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: FAIL — `pistas` é sempre 1 e `pista` sempre 0.

- [ ] **Step 3: Write the implementation**

Acrescente a `apps/web/src/painel/grade.ts`, antes de `gradeDeTempo`:

```ts
// Agrupa os eventos que se cruzam e distribui cada grupo em pistas.
// Recebe a lista já ordenada por início. Encostar não é sobrepor: um
// evento que começa exatamente no fim do anterior fecha o grupo — senão
// um dia cheio viraria uma coluna espremida em dezenas de pistas.
function distribuirEmPistas(eventos: EventoPosicionado[]): void {
  let grupo: EventoPosicionado[] = [];
  let fimDoGrupo = -1;

  const fecharGrupo = () => {
    for (const evento of grupo) evento.pistas = pistasUsadas(grupo);
    grupo = [];
    fimDoGrupo = -1;
  };

  const pistasUsadas = (doGrupo: EventoPosicionado[]) =>
    doGrupo.reduce((maior, e) => Math.max(maior, e.pista + 1), 0);

  for (const evento of eventos) {
    const inicio = evento.linha;
    const fim = evento.linha + evento.linhas;

    if (grupo.length > 0 && inicio >= fimDoGrupo) fecharGrupo();

    // Primeira pista em que nenhum evento do grupo ainda está no ar.
    const ocupadas = new Set(
      grupo.filter((e) => e.linha + e.linhas > inicio).map((e) => e.pista)
    );
    let pista = 0;
    while (ocupadas.has(pista)) pista += 1;

    evento.pista = pista;
    grupo.push(evento);
    fimDoGrupo = Math.max(fimDoGrupo, fim);
  }

  if (grupo.length > 0) fecharGrupo();
}
```

Dentro de `gradeDeTempo`, logo depois de montar `eventos` e antes de
montar `livres`:

```ts
    distribuirEmPistas(eventos);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: PASS — 13 testes.

- [ ] **Step 5: Confirme por mutação**

Remova a chamada `distribuirEmPistas(eventos)` e rode.
Expected: FAIL em "põe agendamentos sobrepostos em pistas". Desfaça.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/painel/grade.ts apps/web/tests/painel/grade.test.ts
git commit -m "feat(web): lay overlapping appointments out in lanes"
```

---

### Task 3: Domínio — grade do mês

**Files:**
- Modify: `apps/web/src/painel/grade.ts`
- Test: `apps/web/tests/painel/grade.test.ts`

**Interfaces:**
- Consumes: `horarioDe`, `aberto` da Tarefa 1.
- Produces: `CelulaDoMes`, `gradeDoMes(entrada)`. A Tarefa 5 os consome.

Lembre da armadilha nas Global Constraints: **não** reutilize
`diasDoMes` de `src/formato/datas.ts`. Ela devolve `null` nas bordas, e
aqui as bordas precisam de datas reais.

- [ ] **Step 1: Write the failing test**

Acrescente a `apps/web/tests/painel/grade.test.ts` (e inclua `gradeDoMes`
no import do topo do arquivo):

```ts
describe("gradeDoMes", () => {
  it("fecha sempre em semanas completas, começando no domingo", () => {
    // Setembro de 2026 começa numa terça e tem 30 dias.
    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [],
    });

    expect(celulas.length % 7).toBe(0);
    expect(new Date(`${celulas[0].data}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(
      new Date(`${celulas[celulas.length - 1].data}T12:00:00Z`).getUTCDay()
    ).toBe(6);
  });

  it("marca as bordas com datas reais, não com buracos", () => {
    // É a diferença para `diasDoMes` de src/formato/datas.ts, que devolve
    // null antes do dia 1. Aqui a borda precisa de data real: ela mostra
    // agendamentos dos meses vizinhos, e um null os esconderia.
    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [],
    });

    const primeira = celulas[0];
    expect(primeira.data).toBe("2026-08-30");
    expect(primeira.doMes).toBe(false);
    expect(celulas.find((c) => c.data === "2026-09-01")?.doMes).toBe(true);
  });

  it("põe cada agendamento na célula do seu dia", () => {
    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: "2026-09-08", horaInicio: "10:00", horaFim: "11:00" }),
        agendamento({ id: "a2", data: "2026-09-08", horaInicio: "14:00", horaFim: "15:00" }),
        agendamento({ id: "a3", data: "2026-09-09", horaInicio: "10:00", horaFim: "11:00" }),
      ],
    });

    const dia8 = celulas.find((c) => c.data === "2026-09-08");
    expect(dia8?.agendamentos.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(
      celulas.find((c) => c.data === "2026-09-09")?.agendamentos.map((a) => a.id)
    ).toEqual(["a3"]);
  });

  it("mostra na borda o agendamento do mês vizinho", () => {
    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "a1", data: "2026-08-31", horaInicio: "10:00", horaFim: "11:00" }),
      ],
    });

    const borda = celulas.find((c) => c.data === "2026-08-31");
    expect(borda?.doMes).toBe(false);
    expect(borda?.agendamentos.map((a) => a.id)).toEqual(["a1"]);
  });

  it("ordena os agendamentos do dia por hora", () => {
    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [
        agendamento({ id: "tarde", data: "2026-09-08", horaInicio: "16:00", horaFim: "17:00" }),
        agendamento({ id: "cedo", data: "2026-09-08", horaInicio: "09:00", horaFim: "10:00" }),
      ],
    });

    expect(
      celulas.find((c) => c.data === "2026-09-08")?.agendamentos.map((a) => a.id)
    ).toEqual(["cedo", "tarde"]);
  });

  it("marca domingo como fechado e descarta cancelado", () => {
    const cancelado = {
      ...agendamento({ id: "x", data: "2026-09-08", horaInicio: "10:00", horaFim: "11:00" }),
      status: "cancelado",
    };

    const celulas = gradeDoMes({
      mes: "2026-09",
      horarios: HORARIOS,
      agendamentos: [cancelado],
    });

    expect(celulas.find((c) => c.data === "2026-09-06")?.fechado).toBe(true);
    expect(celulas.find((c) => c.data === "2026-09-08")?.fechado).toBe(false);
    expect(celulas.find((c) => c.data === "2026-09-08")?.agendamentos).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: FAIL — `gradeDoMes` não é exportado.

- [ ] **Step 3: Write the implementation**

Acrescente ao fim de `apps/web/src/painel/grade.ts`:

```ts
export interface CelulaDoMes {
  data: string;
  doMes: boolean;   // false nas células de preenchimento das bordas
  fechado: boolean;
  agendamentos: AgendamentoComCliente[];
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Semanas completas de domingo a sábado, com datas REAIS nas bordas.
// Diferente de `diasDoMes` (src/formato/datas.ts), que devolve null
// antes do dia 1: aqui a borda mostra agendamentos dos meses vizinhos, e
// um buraco os esconderia.
export function gradeDoMes(entrada: {
  mes: string;
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
}): CelulaDoMes[] {
  const { mes, horarios, agendamentos } = entrada;
  const [ano, numero] = mes.split("-").map(Number);

  const primeiroDoMes = `${mes}-01`;
  const diasNoMes = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  const ultimoDoMes = `${mes}-${String(diasNoMes).padStart(2, "0")}`;

  const inicio = somarDias(primeiroDoMes, -diaDaSemanaDe(primeiroDoMes));
  const fim = somarDias(ultimoDoMes, 6 - diaDaSemanaDe(ultimoDoMes));

  const validos = agendamentos.filter((a) => a.status !== "cancelado");

  const celulas: CelulaDoMes[] = [];
  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    celulas.push({
      data,
      doMes: data >= primeiroDoMes && data <= ultimoDoMes,
      fechado: !aberto(horarioDe(data, horarios)),
      agendamentos: validos
        .filter((a) => a.data === data)
        .sort((um, outro) => um.horaInicio.localeCompare(outro.horaInicio)),
    });
  }

  return celulas;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/painel/grade.test.ts`
Expected: PASS — 19 testes.

- [ ] **Step 5: Confirme por mutação**

Troque `doMes` por `true` fixo e rode.
Expected: FAIL em "marca as bordas com datas reais". Desfaça.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/painel/grade.ts apps/web/tests/painel/grade.test.ts
git commit -m "feat(web): build the month grid with real border dates"
```

---

### Task 4: Componente `GradeDeTempo`

**Files:**
- Create: `apps/web/src/componentes/GradeDeTempo.tsx`
- Create: `apps/web/src/componentes/GradeDeTempo.module.css`
- Test: `apps/web/tests/componentes/GradeDeTempo.test.tsx` (criar)

**Interfaces:**
- Consumes: `GradeDeTempo` (tipo), `MINUTOS_POR_LINHA` das Tarefas 1 e 2.
- Produces: `<GradeDeTempo grade={…} aoAbrir={(id) => …} aoCriar={(data, hora) => …} aoAbrirDia={(data) => …} />`, sendo `aoAbrirDia` opcional. A Tarefa 7 monta este componente.

Dois detalhes de assinatura que a Tarefa 7 depende:

- `aoCriar` recebe **dois** parâmetros. Na vista de semana a hora sozinha
  não diria qual coluna foi clicada, e o antigo `aoCriar(hora)` não
  bastaria.
- `aoAbrirDia` é **opcional**. Quando presente, cada coluna ganha um
  cabeçalho clicável que abre aquele dia — é o que a vista de semana usa.
  A vista de dia não passa a prop, e aí não há cabeçalho: um botão para
  abrir o dia que já está aberto seria ruído.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/tests/componentes/GradeDeTempo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { GradeDeTempo } from "../../src/componentes/GradeDeTempo";
import { gradeDeTempo } from "../../src/painel/grade";

const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

const TERCA = "2026-09-08";
const AGORA = new Date("2026-09-08T10:00:00-03:00");

function agendamento(): AgendamentoComCliente {
  return {
    id: "a1",
    data: TERCA,
    horaInicio: "11:00",
    horaFim: "12:00",
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    servicos: [
      { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 60 },
    ],
    cliente: {
      id: "c1",
      nome: "João Silva",
      telefone: "(11) 99999-0001",
      email: null,
      temConta: false,
    },
  };
}

function montar(entrada: {
  dias?: string[];
  agendamentos?: AgendamentoComCliente[];
  aoAbrir?: (id: string) => void;
  aoCriar?: (data: string, hora: string) => void;
}) {
  const grade = gradeDeTempo({
    dias: entrada.dias ?? [TERCA],
    horarios: HORARIOS,
    agendamentos: entrada.agendamentos ?? [],
    agora: AGORA,
  });

  render(
    <GradeDeTempo
      grade={grade}
      aoAbrir={entrada.aoAbrir ?? (() => {})}
      aoCriar={entrada.aoCriar ?? (() => {})}
    />
  );

  return grade;
}

describe("GradeDeTempo", () => {
  it("posiciona o evento na linha que o domínio calculou", () => {
    montar({ agendamentos: [agendamento()] });

    const evento = screen.getByRole("button", { name: /João Silva/ });
    // 11:00 com janela abrindo às 09:00 = 120 min = linha 25, span 12.
    // Lê-se da custom property porque é ela que alimenta o grid-row: um
    // teste que olhasse o style computado mediria o jsdom, não o CSS.
    expect(evento.style.getPropertyValue("--linha")).toBe("25");
    expect(evento.style.getPropertyValue("--linhas")).toBe("12");
  });

  it("abre o agendamento ao clicar no evento", async () => {
    const aoAbrir = vi.fn((_id: string) => {});
    montar({ agendamentos: [agendamento()], aoAbrir });

    await userEvent.click(screen.getByRole("button", { name: /João Silva/ }));

    expect(aoAbrir).toHaveBeenCalledWith("a1");
  });

  it("cria informando o dia e a hora da faixa clicada", async () => {
    const aoCriar = vi.fn((_data: string, _hora: string) => {});
    montar({ dias: ["2026-09-09"], aoCriar });

    await userEvent.click(screen.getByRole("button", { name: "09:00" }));

    // O dia vai junto: na semana, a hora sozinha não diria qual coluna.
    expect(aoCriar).toHaveBeenCalledWith("2026-09-09", "09:00");
  });

  it("não oferece criar em faixa que já passou", () => {
    montar({ dias: [TERCA] });

    // 09:00 de hoje já passou às 10:00; 11:00 não.
    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11:00" })).toBeInTheDocument();
  });

  it("desenha a régua do agora uma vez, na coluna de hoje", () => {
    montar({ dias: ["2026-09-07", TERCA, "2026-09-09"] });

    const reguas = screen.getAllByTestId("regua-do-agora");
    expect(reguas).toHaveLength(1);
    expect(reguas[0].style.getPropertyValue("--linha")).toBe("13");
  });

  it("anuncia o dia fechado em vez de deixar a coluna em branco", () => {
    montar({ dias: ["2026-09-06"] });

    // Fechado e aberto-sem-nada são estados diferentes; confundi-los faz
    // o barbeiro achar que perdeu o dia.
    expect(screen.getByText("Fechado neste dia.")).toBeInTheDocument();
  });

  it("com aoAbrirDia, cada coluna ganha cabeçalho que abre o dia", async () => {
    const aoAbrirDia = vi.fn((_data: string) => {});
    const grade = gradeDeTempo({
      dias: ["2026-09-07", TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    render(
      <GradeDeTempo
        grade={grade}
        aoAbrir={() => {}}
        aoCriar={() => {}}
        aoAbrirDia={aoAbrirDia}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /8 de setembro/ }));

    expect(aoAbrirDia).toHaveBeenCalledWith(TERCA);
  });

  it("sem aoAbrirDia, não há cabeçalho de coluna", () => {
    // A vista de dia não passa a prop: um botão para abrir o dia que já
    // está aberto seria ruído. Este teste morre se o cabeçalho passar a
    // ser incondicional.
    montar({ dias: [TERCA] });

    expect(
      screen.queryByRole("button", { name: /8 de setembro/ })
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/GradeDeTempo.test.tsx`
Expected: FAIL — o módulo `../../src/componentes/GradeDeTempo` não existe.

- [ ] **Step 3: Write the component**

Crie `apps/web/src/componentes/GradeDeTempo.tsx`:

```tsx
"use client";

import type { CSSProperties } from "react";
// O tipo e o componente têm o mesmo nome de propósito — um descreve o
// que o outro desenha. O alias existe só para os dois conviverem no
// mesmo módulo.
import type { GradeDeTempo as Grade } from "../painel/grade";
import { MINUTOS_POR_LINHA } from "../painel/grade";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./GradeDeTempo.module.css";

// Rótulos de hora cheia no eixo da esquerda.
function horasCheias(grade: Grade): { rotulo: string; linha: number }[] {
  const horas: { rotulo: string; linha: number }[] = [];
  const primeira = Math.ceil(grade.minutoInicial / 60) * 60;

  for (let minuto = primeira; minuto < grade.minutoFinal; minuto += 60) {
    horas.push({
      rotulo: `${String(minuto / 60).padStart(2, "0")}:00`,
      linha: (minuto - grade.minutoInicial) / MINUTOS_POR_LINHA + 1,
    });
  }

  return horas;
}

export function GradeDeTempo({
  grade,
  aoAbrir,
  aoCriar,
  aoAbrirDia,
}: {
  grade: Grade;
  aoAbrir: (id: string) => void;
  // O dia vai junto da hora: na vista de semana a hora sozinha não diz
  // qual coluna foi clicada.
  aoCriar: (data: string, hora: string) => void;
  // Só a vista de semana passa: é o cabeçalho clicável de cada coluna.
  aoAbrirDia?: (data: string) => void;
}) {
  if (grade.totalLinhas === 0) {
    return <p className={estilos.vazio}>Fechado neste dia.</p>;
  }

  const estiloDaGrade = {
    "--total-linhas": grade.totalLinhas,
  } as CSSProperties;

  return (
    <div className={estilos.quadro} style={estiloDaGrade}>
      <div className={estilos.eixo}>
        {horasCheias(grade).map((hora) => (
          <span
            key={hora.rotulo}
            className={estilos.hora}
            style={{ "--linha": hora.linha } as CSSProperties}
          >
            {hora.rotulo}
          </span>
        ))}
      </div>

      {grade.colunas.map((coluna) => (
        <div key={coluna.data} className={estilos.coluna}>
          {aoAbrirDia ? (
            <button
              type="button"
              className={estilos.cabecalhoDoDia}
              // A data por extenso é o nome acessível: "8" sozinho não
              // distingue uma coluna da outra numa lista de sete.
              aria-label={formatarDataLonga(coluna.data)}
              onClick={() => aoAbrirDia(coluna.data)}
            >
              {Number(coluna.data.slice(8))}
            </button>
          ) : null}

          {coluna.fechado ? (
            <p className={estilos.fechado}>Fechado neste dia.</p>
          ) : null}

          {coluna.livres.map((faixa) =>
            // Faixa passada não vira botão: oferecer 09:00 às 10h é
            // ruído. A linha continua ocupada pra grade não ganhar
            // buraco.
            faixa.passada ? (
              <span
                key={faixa.hora}
                className={estilos.passada}
                style={
                  { "--linha": faixa.linha, "--linhas": faixa.linhas } as CSSProperties
                }
              />
            ) : (
              <button
                key={faixa.hora}
                type="button"
                className={estilos.livre}
                style={
                  { "--linha": faixa.linha, "--linhas": faixa.linhas } as CSSProperties
                }
                onClick={() => aoCriar(coluna.data, faixa.hora)}
              >
                {faixa.hora}
              </button>
            )
          )}

          {coluna.eventos.map((evento) => (
            <button
              key={evento.agendamento.id}
              type="button"
              className={estilos.evento}
              style={
                {
                  "--linha": evento.linha,
                  "--linhas": evento.linhas,
                  "--pista": evento.pista,
                  "--pistas": evento.pistas,
                } as CSSProperties
              }
              onClick={() => aoAbrir(evento.agendamento.id)}
            >
              {/* O nome completo entra no texto, e quem encurta é o CSS:
                  na coluna larga da vista de dia ele cabe inteiro, na
                  coluna estreita da semana trunca com reticências. Cortar
                  no JavaScript esconderia o sobrenome também na vista de
                  dia, onde há espaço de sobra. */}
              <strong className={estilos.horaDoEvento}>
                {evento.agendamento.horaInicio}
              </strong>{" "}
              {evento.agendamento.cliente.nome}
              <span className={estilos.servicos}>
                {evento.agendamento.servicos.map((s) => s.nome).join(" + ")}
              </span>
            </button>
          ))}

          {grade.agora?.data === coluna.data ? (
            <span
              data-testid="regua-do-agora"
              className={estilos.agora}
              style={{ "--linha": grade.agora.linha } as CSSProperties}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS**

Crie `apps/web/src/componentes/GradeDeTempo.module.css`:

```css
/* O eixo de tempo e as colunas de dia. A grade tem uma linha por 5
   minutos: `duracaoMinutos` é múltiplo de 5 e os inícios caem na grade
   de 15 do scheduling, então todo evento alinha exato. */
.quadro {
  display: grid;
  grid-template-columns: 3.5rem repeat(auto-fit, minmax(0, 1fr));
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-lg);
  background: var(--cor-surface);
  box-shadow: 0 4px 0 var(--cor-shadow);
  overflow: hidden;
}

/* 1.6px por minuto: meia hora dá 48px, que é onde nome e serviço ainda
   cabem em duas linhas. */
.eixo,
.coluna {
  display: grid;
  grid-template-rows: repeat(var(--total-linhas), 8px);
}

.eixo {
  border-inline-end: var(--borda-hairline) solid var(--cor-line);
  background: var(--cor-paper-soft);
}

.hora {
  grid-row: var(--linha);
  padding-inline-end: var(--espaco-xs);
  text-align: end;
  color: var(--cor-muted);
  font-size: var(--texto-xs);
  /* Sobe meia linha pra régua da hora coincidir com o rótulo. */
  transform: translateY(-0.5em);
}

.coluna {
  position: relative;
  border-inline-end: var(--borda-hairline) solid var(--cor-line);
}

.coluna:last-child {
  border-inline-end: none;
}

.livre {
  grid-row: var(--linha) / span var(--linhas);
  grid-column: 1;
  border: none;
  border-block-start: var(--borda-hairline) dashed var(--cor-line);
  background: transparent;
  color: transparent;
  font-size: var(--texto-xs);
  cursor: pointer;
}

/* A hora só aparece ao passar o mouse ou pelo teclado: escrita sempre,
   a grade vira uma parede de números. */
.livre:hover,
.livre:focus-visible {
  background: var(--cor-pale-yellow);
  color: var(--cor-ink-soft);
}

.passada {
  grid-row: var(--linha) / span var(--linhas);
  grid-column: 1;
  border-block-start: var(--borda-hairline) dashed var(--cor-line);
  background: var(--cor-paper-soft);
}

/* O evento entra na mesma célula da grade que as faixas livres e fica
   por cima — daí o z-index. A pista divide a largura quando há
   sobreposição; com pista única a conta dá 0% e 100%. */
.evento {
  grid-row: var(--linha) / span var(--linhas);
  grid-column: 1;
  z-index: 1;
  display: block;
  overflow: hidden;
  width: calc(100% / var(--pistas));
  margin-inline-start: calc(100% / var(--pistas) * var(--pista));
  padding: 2px var(--espaco-xs);
  border: var(--borda-hairline) solid var(--cor-ink);
  border-radius: var(--raio-sm);
  background: var(--cor-accent);
  color: var(--cor-dark);
  text-align: start;
  font-size: var(--texto-xs);
  line-height: 1.25;
  cursor: pointer;
}

.horaDoEvento {
  font-family: var(--fonte-display), system-ui, sans-serif;
}

/* O cabeçalho clicável de cada coluna, só na vista de semana. Fica na
   linha 1 e por cima das faixas livres, que começam no mesmo lugar. */
.cabecalhoDoDia {
  grid-row: 1;
  grid-column: 1;
  z-index: 3;
  align-self: start;
  padding: 2px 6px;
  border: none;
  border-radius: var(--raio-pill);
  background: var(--cor-paper-soft);
  font-family: var(--fonte-display), system-ui, sans-serif;
  font-size: var(--texto-sm);
  cursor: pointer;
}

.cabecalhoDoDia:hover {
  background: var(--cor-accent);
  color: var(--cor-dark);
}

.servicos {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.8;
}

/* A régua do agora. Não usa --cor-accent, que já significa
   "selecionado" no painel, nem o vermelho de erro, que significa falha. */
.agora {
  grid-row: var(--linha);
  grid-column: 1;
  z-index: 2;
  align-self: start;
  height: 0;
  border-block-start: var(--borda-padrao) solid var(--cor-ink);
  pointer-events: none;
}

.agora::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  margin-block-start: -4px;
  width: 7px;
  height: 7px;
  border-radius: var(--raio-pill);
  background: var(--cor-ink);
}

.fechado {
  grid-row: 1 / -1;
  grid-column: 1;
  margin: 0;
  padding: var(--espaco-md) var(--espaco-xs);
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 6px,
    var(--cor-line) 6px,
    var(--cor-line) 7px
  );
  color: var(--cor-muted);
  text-align: center;
  font-size: var(--texto-xs);
}

.vazio {
  margin: 0;
  padding: var(--espaco-xl);
  text-align: center;
  color: var(--cor-muted);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/GradeDeTempo.test.tsx`
Expected: PASS — 6 testes.

Se "anuncia o dia fechado" falhar com dois elementos achados, é porque a
coluna fechada e o quadro vazio renderizam a mesma frase ao mesmo tempo.
Só um caminho deve produzi-la: com `totalLinhas === 0` a função retorna
antes de montar coluna nenhuma, então confira o retorno antecipado.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/GradeDeTempo.tsx \
        apps/web/src/componentes/GradeDeTempo.module.css \
        apps/web/tests/componentes/GradeDeTempo.test.tsx
git commit -m "feat(web): render the agenda as a proportional time grid"
```

---

### Task 5: Componente `GradeDoMes`

**Files:**
- Create: `apps/web/src/componentes/GradeDoMes.tsx`
- Create: `apps/web/src/componentes/GradeDoMes.module.css`
- Test: `apps/web/tests/componentes/GradeDoMes.test.tsx` (criar)

**Interfaces:**
- Consumes: `CelulaDoMes` da Tarefa 3.
- Produces: `<GradeDoMes celulas={…} hoje="YYYY-MM-DD" aoAbrirDia={(data) => …} />`. A Tarefa 7 monta este componente.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/tests/componentes/GradeDoMes.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { GradeDoMes } from "../../src/componentes/GradeDoMes";
import { gradeDoMes } from "../../src/painel/grade";

const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

function agendamento(id: string, hora: string): AgendamentoComCliente {
  return {
    id,
    data: "2026-09-08",
    horaInicio: hora,
    horaFim: "23:00",
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    servicos: [
      { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
    ],
    cliente: {
      id: "c1",
      nome: `Cliente ${id}`,
      telefone: "(11) 99999-0001",
      email: null,
      temConta: false,
    },
  };
}

function montar(entrada: {
  agendamentos?: AgendamentoComCliente[];
  aoAbrirDia?: (data: string) => void;
}) {
  render(
    <GradeDoMes
      celulas={gradeDoMes({
        mes: "2026-09",
        horarios: HORARIOS,
        agendamentos: entrada.agendamentos ?? [],
      })}
      hoje="2026-09-08"
      aoAbrirDia={entrada.aoAbrirDia ?? (() => {})}
    />
  );
}

describe("GradeDoMes", () => {
  it("mostra os chips do dia e abre o dia ao clicar na célula", async () => {
    const aoAbrirDia = vi.fn((_data: string) => {});
    montar({ agendamentos: [agendamento("a1", "10:00")], aoAbrirDia });

    expect(screen.getByText(/Cliente a1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /8 de setembro/ }));

    expect(aoAbrirDia).toHaveBeenCalledWith("2026-09-08");
  });

  it("passando de quatro no dia, mostra três e um +N", () => {
    montar({
      agendamentos: [
        agendamento("a1", "09:00"),
        agendamento("a2", "10:00"),
        agendamento("a3", "11:00"),
        agendamento("a4", "12:00"),
        agendamento("a5", "13:00"),
      ],
    });

    expect(screen.getByText(/Cliente a3/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente a4/)).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("com exatamente quatro no dia, mostra os quatro e nenhum +N", () => {
    // O caso que separa "corta acima de 3" de "corta acima de 4": com um
    // limite errado por um, este teste fica vermelho e o de cima não.
    montar({
      agendamentos: [
        agendamento("a1", "09:00"),
        agendamento("a2", "10:00"),
        agendamento("a3", "11:00"),
        agendamento("a4", "12:00"),
      ],
    });

    expect(screen.getByText(/Cliente a4/)).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("distingue a célula de fora do mês e a de hoje", () => {
    montar({});

    expect(screen.getByRole("button", { name: /30 de agosto/ })).toHaveAttribute(
      "data-fora-do-mes",
      "true"
    );
    expect(screen.getByRole("button", { name: /8 de setembro/ })).toHaveAttribute(
      "aria-current",
      "date"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/GradeDoMes.test.tsx`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Write the component**

Crie `apps/web/src/componentes/GradeDoMes.tsx`:

```tsx
"use client";

import type { CelulaDoMes } from "../painel/grade";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./GradeDoMes.module.css";

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Quantos chips cabem antes de virar "+N". Quatro é o que a célula
// comporta sem rolar.
const CHIPS_VISIVEIS = 4;

export function GradeDoMes({
  celulas,
  hoje,
  aoAbrirDia,
}: {
  celulas: CelulaDoMes[];
  hoje: string;
  aoAbrirDia: (data: string) => void;
}) {
  return (
    <div className={estilos.quadro}>
      {NOMES.map((nome) => (
        <span key={nome} className={estilos.cabecalho}>
          {nome}
        </span>
      ))}

      {celulas.map((celula) => {
        const excedente = celula.agendamentos.length - CHIPS_VISIVEIS;
        const mostrados =
          excedente > 0
            ? celula.agendamentos.slice(0, CHIPS_VISIVEIS - 1)
            : celula.agendamentos;

        return (
          <button
            key={celula.data}
            type="button"
            className={estilos.celula}
            // O nome acessível é a data por extenso: "8" sozinho não
            // distingue as células de meses vizinhos com o mesmo número.
            aria-label={formatarDataLonga(celula.data)}
            aria-current={celula.data === hoje ? "date" : undefined}
            data-fora-do-mes={celula.doMes ? undefined : "true"}
            data-fechado={celula.fechado ? "true" : undefined}
            onClick={() => aoAbrirDia(celula.data)}
          >
            <span className={estilos.numero}>
              {Number(celula.data.slice(8))}
            </span>

            {mostrados.map((agendamento) => (
              <span key={agendamento.id} className={estilos.chip}>
                {agendamento.horaInicio} {agendamento.cliente.nome}
              </span>
            ))}

            {excedente > 0 ? (
              <span className={estilos.excedente}>+{excedente + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
```

Atenção à aritmética do `+N`: quando há excedente, mostram-se
`CHIPS_VISIVEIS - 1` chips e o rótulo conta `excedente + 1` — os que
sobraram mais o que cedeu o lugar. Com 5 agendamentos e limite 4: 3
chips e `+2`.

- [ ] **Step 4: Write the CSS**

Crie `apps/web/src/componentes/GradeDoMes.module.css`:

```css
.quadro {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--borda-hairline);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-lg);
  background: var(--cor-line);
  box-shadow: 0 4px 0 var(--cor-shadow);
  overflow: hidden;
}

.cabecalho {
  padding: var(--espaco-sm);
  background: var(--cor-paper-soft);
  color: var(--cor-ink-soft);
  text-align: center;
  font-size: var(--texto-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.celula {
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 104px;
  padding: var(--espaco-xs);
  border: none;
  background: var(--cor-surface);
  text-align: start;
  cursor: pointer;
}

.celula:hover {
  background: var(--cor-paper-soft);
}

/* Fora do mês continua clicável e legível, só recua: apagá-lo esconderia
   agendamentos reais dos meses vizinhos. */
.celula[data-fora-do-mes="true"] {
  background: var(--cor-paper-soft);
  color: var(--cor-muted);
}

.celula[data-fechado="true"] .numero {
  text-decoration: line-through;
  color: var(--cor-muted);
}

.celula[aria-current="date"] .numero {
  border-radius: var(--raio-pill);
  background: var(--cor-accent);
  color: var(--cor-dark);
}

.numero {
  justify-self: start;
  min-width: 1.6em;
  padding: 2px 6px;
  text-align: center;
  font-family: var(--fonte-display), system-ui, sans-serif;
  font-size: var(--texto-sm);
}

.chip {
  overflow: hidden;
  padding: 1px var(--espaco-xs);
  border-radius: var(--raio-sm);
  background: var(--cor-accent);
  color: var(--cor-dark);
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--texto-xs);
}

.excedente {
  padding-inline-start: var(--espaco-xs);
  color: var(--cor-ink-soft);
  font-size: var(--texto-xs);
  font-weight: 600;
}

@media (max-width: 720px) {
  .celula {
    min-height: 72px;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/GradeDoMes.test.tsx`
Expected: PASS — 4 testes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/GradeDoMes.tsx \
        apps/web/src/componentes/GradeDoMes.module.css \
        apps/web/tests/componentes/GradeDoMes.test.tsx
git commit -m "feat(web): render the month grid with day cells"
```

---

### Task 6: Componente `SeletorDeVista`

**Files:**
- Create: `apps/web/src/componentes/SeletorDeVista.tsx`
- Create: `apps/web/src/componentes/SeletorDeVista.module.css`
- Test: `apps/web/tests/componentes/SeletorDeVista.test.tsx` (criar)

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: o tipo `Vista = "dia" | "semana" | "mes"` e
  `<SeletorDeVista vista={…} aoTrocarVista={(v) => …} aoAndar={(passos) => …} aoVoltarAHoje={() => …} />`.
  A Tarefa 7 consome os dois.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/tests/componentes/SeletorDeVista.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeletorDeVista } from "../../src/componentes/SeletorDeVista";

function montar(entrada: {
  vista?: "dia" | "semana" | "mes";
  aoTrocarVista?: (vista: "dia" | "semana" | "mes") => void;
  aoAndar?: (passos: number) => void;
  aoVoltarAHoje?: () => void;
}) {
  render(
    <SeletorDeVista
      vista={entrada.vista ?? "semana"}
      aoTrocarVista={entrada.aoTrocarVista ?? (() => {})}
      aoAndar={entrada.aoAndar ?? (() => {})}
      aoVoltarAHoje={entrada.aoVoltarAHoje ?? (() => {})}
    />
  );
}

describe("SeletorDeVista", () => {
  it("marca a vista corrente e só ela", () => {
    montar({ vista: "mes" });

    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("troca de vista ao clicar", async () => {
    const aoTrocarVista = vi.fn((_vista: "dia" | "semana" | "mes") => {});
    montar({ vista: "semana", aoTrocarVista });

    await userEvent.click(screen.getByRole("button", { name: "Dia" }));

    expect(aoTrocarVista).toHaveBeenCalledWith("dia");
  });

  it("anda para trás e para a frente", async () => {
    const aoAndar = vi.fn((_passos: number) => {});
    montar({ aoAndar });

    await userEvent.click(screen.getByRole("button", { name: "Período anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Próximo período" }));

    expect(aoAndar).toHaveBeenNthCalledWith(1, -1);
    expect(aoAndar).toHaveBeenNthCalledWith(2, 1);
  });

  it("volta a hoje", async () => {
    const aoVoltarAHoje = vi.fn(() => {});
    montar({ aoVoltarAHoje });

    await userEvent.click(screen.getByRole("button", { name: "Hoje" }));

    expect(aoVoltarAHoje).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/SeletorDeVista.test.tsx`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Write the component**

Crie `apps/web/src/componentes/SeletorDeVista.tsx`:

```tsx
"use client";

import estilos from "./SeletorDeVista.module.css";

export type Vista = "dia" | "semana" | "mes";

const VISTAS: { valor: Vista; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

export function SeletorDeVista({
  vista,
  aoTrocarVista,
  aoAndar,
  aoVoltarAHoje,
}: {
  vista: Vista;
  aoTrocarVista: (vista: Vista) => void;
  // Passos na unidade da vista corrente: um dia, uma semana ou um mês.
  aoAndar: (passos: number) => void;
  aoVoltarAHoje: () => void;
}) {
  return (
    <div className={estilos.barra}>
      <div className={estilos.vistas} role="group" aria-label="Vista da agenda">
        {VISTAS.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            className={estilos.vista}
            // aria-pressed e não aria-current: são botões que alternam um
            // modo, não links para outro lugar.
            aria-pressed={opcao.valor === vista}
            onClick={() => aoTrocarVista(opcao.valor)}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>

      <div className={estilos.navegacao}>
        <button
          type="button"
          className={estilos.passo}
          aria-label="Período anterior"
          onClick={() => aoAndar(-1)}
        >
          ‹
        </button>
        <button type="button" className={estilos.hoje} onClick={aoVoltarAHoje}>
          Hoje
        </button>
        <button
          type="button"
          className={estilos.passo}
          aria-label="Próximo período"
          onClick={() => aoAndar(1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS**

Crie `apps/web/src/componentes/SeletorDeVista.module.css`:

```css
.barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espaco-md);
}

.vistas,
.navegacao {
  display: flex;
  align-items: center;
  gap: var(--espaco-xs);
}

.vista,
.passo,
.hoje {
  min-height: 40px;
  padding: var(--espaco-xs) var(--espaco-md);
  border: var(--borda-padrao) solid var(--cor-ink);
  border-radius: var(--raio-md);
  background: var(--cor-surface);
  font-family: var(--fonte-display), system-ui, sans-serif;
  font-size: var(--texto-sm);
  cursor: pointer;
}

/* A vista corrente usa o amarelo com a sombra deslocada, igual ao item
   ativo da barra lateral — mesmo significado, mesmo desenho. */
.vista[aria-pressed="true"] {
  background: var(--cor-accent);
  box-shadow: 0 3px 0 var(--cor-shadow);
  color: var(--cor-dark);
}

.passo {
  min-width: 40px;
  padding-inline: var(--espaco-sm);
  font-size: var(--texto-lg);
  line-height: 1;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @barchop/web exec vitest run tests/componentes/SeletorDeVista.test.tsx`
Expected: PASS — 4 testes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/componentes/SeletorDeVista.tsx \
        apps/web/src/componentes/SeletorDeVista.module.css \
        apps/web/tests/componentes/SeletorDeVista.test.tsx
git commit -m "feat(web): add the agenda view switcher"
```

---

### Task 7: Tela `Agenda` — orquestração, URL e remoção do que sobrou

**Files:**
- Create: `apps/web/src/telas/painel/Agenda.tsx`
- Create: `apps/web/src/telas/painel/Agenda.module.css`
- Modify: `apps/web/app/(painel)/painel/(guardado)/agenda/page.tsx`
- Delete: `apps/web/src/telas/painel/AgendaDoDia.tsx`, `apps/web/src/telas/painel/AgendaDoDia.module.css`, `apps/web/src/componentes/GradeDeAgenda.tsx`, `apps/web/src/componentes/GradeDeAgenda.module.css`, `apps/web/tests/componentes/GradeDeAgenda.test.tsx`
- Test: `apps/web/tests/telas/painel/agenda.test.tsx` (reescreve)

**Interfaces:**
- Consumes: `gradeDeTempo`, `gradeDoMes`, `diasDaSemana` (Tarefas 1–3); `GradeDeTempo`, `GradeDoMes`, `SeletorDeVista`, `Vista` (Tarefas 4–6).
- Produces: `<Agenda agora={…} />`, montada por `page.tsx`.

- [ ] **Step 1: Write the failing test**

Substitua o conteúdo de `apps/web/tests/telas/painel/agenda.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// 2026-09-08 é uma terça-feira.
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

describe("agenda", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08" },
    });
  });

  it("sem ?vista= na URL, abre na semana", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // Sete colunas: a semana de 2026-09-08 vai de domingo 06 a sábado 12.
    expect(screen.getByRole("button", { name: /6 de setembro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12 de setembro/ })).toBeInTheDocument();
  });

  it("mostra o agendamento na vista de dia", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "dia" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: /João Silva/ })).toBeInTheDocument();
  });

  it("clicar numa faixa livre leva ao novo agendamento com data e hora", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "dia" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "14:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=14%3A00"
    );
  });

  it("trocar de vista preserva a data", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Mês" }));

    // Setembro, não o mês corrente do relógio da máquina.
    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=mes&data=2026-09-08"
    );
  });

  it("andar na vista de semana pula sete dias", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "Próximo período" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=semana&data=2026-09-15"
    );
  });

  it("andar na vista de mês pula um mês", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "mes" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "Período anterior" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=mes&data=2026-08-08"
    );
  });

  it("clicar num dia do mês abre aquele dia", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "mes" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: /15 de setembro/ })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=dia&data=2026-09-15"
    );
  });

  it("vista inválida na URL cai na semana, sem quebrar", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "banana" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("erro ao carregar horários avisa, em vez de ficar carregando pra sempre", async () => {
    const falso = semear();
    falso.barbeiro.horarios = async () => {
      throw new ErroDaApi(500, "erro_interno", "Falha ao buscar horários.");
    };

    montarPainel(<Agenda agora={AGORA} />, falso);

    expect(await screen.findByText("Falha ao buscar horários.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @barchop/web exec vitest run tests/telas/painel/agenda.test.tsx`
Expected: FAIL — o módulo `../../../src/telas/painel/Agenda` não existe.

- [ ] **Step 3: Write the screen**

Crie `apps/web/src/telas/painel/Agenda.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { GradeDeTempo } from "../../componentes/GradeDeTempo";
import { GradeDoMes } from "../../componentes/GradeDoMes";
import { SeletorDeVista, type Vista } from "../../componentes/SeletorDeVista";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { diasDaSemana, gradeDeTempo, gradeDoMes } from "../../painel/grade";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./Agenda.module.css";

const VISTAS: Vista[] = ["dia", "semana", "mes"];

function lerVista(bruta: string | null): Vista {
  // Vista desconhecida cai no padrão em silêncio, como a leitura do tema
  // faz: a URL é digitável, e um valor estranho não pode quebrar a tela.
  return VISTAS.includes(bruta as Vista) ? (bruta as Vista) : "semana";
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somarMeses(data: string, meses: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  const diaOriginal = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  // 31 de janeiro + 1 mês não é 3 de março: prende ao último dia do mês
  // de destino.
  const ultimo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(diaOriginal, ultimo));
  return d.toISOString().slice(0, 10);
}

// `agora` por parâmetro, como toda tela que olhe relógio: fake timers
// não entram nesta suíte, e teste que compara data fixa com o relógio
// real falha sozinho depois.
export function Agenda({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();

  const vista = lerVista(query.get("vista"));
  const data = query.get("data") ?? hojeIso(agora);

  const semana = diasDaSemana(data);
  const mes = data.slice(0, 7);

  // Um caminho de dados só, com os limites variando por vista. O mês pede
  // a grade INTEIRA, e não o mês civil: as células de borda mostram
  // agendamentos dos meses vizinhos, e buscar só o mês civil as deixaria
  // falsamente vazias.
  //
  // As listas vazias aqui são de propósito — os limites da grade do mês
  // dependem só do calendário, não dos dados, e esta chamada acontece
  // antes de a busca resolver.
  const bordasDoMes = gradeDoMes({ mes, horarios: [], agendamentos: [] });
  const [de, ate] =
    vista === "dia"
      ? [data, data]
      : vista === "semana"
        ? [semana[0], semana[6]]
        : [bordasDoMes[0].data, bordasDoMes[bordasDoMes.length - 1].data];

  const agendamentos = useRequisicao(
    () => api.barbeiro.agendamentosDoIntervalo(de, ate),
    [de, ate]
  );
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  function irPara(proxima: Vista, proximaData: string) {
    router.push(`/painel/agenda?vista=${proxima}&data=${proximaData}`);
  }

  if (agendamentos.erro) {
    return (
      <Aviso>
        {agendamentos.erro.mensagem || "Não foi possível carregar a agenda agora."}
      </Aviso>
    );
  }
  // Sem os horários não há janela de tempo, e a tela ficaria em
  // "Carregando…" para sempre esperando uma resposta que já chegou como
  // erro.
  if (horarios.erro) {
    return (
      <Aviso>
        {horarios.erro.mensagem || "Não foi possível carregar os horários agora."}
      </Aviso>
    );
  }
  if (!agendamentos.dados || !horarios.dados) return <p>Carregando…</p>;

  const titulo =
    vista === "mes"
      ? formatarDataLonga(`${mes}-01`).replace(/^\d+ de /, "")
      : formatarDataLonga(data);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo={titulo}
        apoio={
          agendamentos.dados.length === 1
            ? "1 agendamento no período"
            : `${agendamentos.dados.length} agendamentos no período`
        }
      />

      <SeletorDeVista
        vista={vista}
        aoTrocarVista={(proxima) => irPara(proxima, data)}
        aoAndar={(passos) =>
          irPara(
            vista,
            vista === "dia"
              ? somarDias(data, passos)
              : vista === "semana"
                ? somarDias(data, passos * 7)
                : somarMeses(data, passos)
          )
        }
        aoVoltarAHoje={() => irPara(vista, hojeIso(agora))}
      />

      {vista === "mes" ? (
        <GradeDoMes
          celulas={gradeDoMes({
            mes,
            horarios: horarios.dados,
            agendamentos: agendamentos.dados,
          })}
          hoje={hojeIso(agora)}
          aoAbrirDia={(dia) => irPara("dia", dia)}
        />
      ) : (
        <GradeDeTempo
          grade={gradeDeTempo({
            dias: vista === "dia" ? [data] : semana,
            horarios: horarios.dados,
            agendamentos: agendamentos.dados,
            agora,
          })}
          aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
          aoCriar={(dia, hora) =>
            router.push(
              `/painel/agendamentos/novo?data=${dia}&hora=${encodeURIComponent(hora)}`
            )
          }
          // Só na semana: na vista de dia, um botão para abrir o dia que
          // já está aberto seria ruído.
          aoAbrirDia={
            vista === "semana" ? (dia) => irPara("dia", dia) : undefined
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS**

Crie `apps/web/src/telas/painel/Agenda.module.css`:

```css
.pagina {
  display: grid;
  gap: var(--espaco-lg);
  align-content: start;
}
```

- [ ] **Step 5: Point the route at the new screen**

Substitua o conteúdo de
`apps/web/app/(painel)/painel/(guardado)/agenda/page.tsx`:

```tsx
import { Agenda } from "../../../../../src/telas/painel/Agenda";

export default function Pagina() {
  return <Agenda />;
}
```

Confira o número de `../` contra o arquivo que já estava lá — a
profundidade não muda, só o nome importado.

- [ ] **Step 6: Delete what the rewrite replaced**

```bash
git rm apps/web/src/telas/painel/AgendaDoDia.tsx \
       apps/web/src/telas/painel/AgendaDoDia.module.css \
       apps/web/src/componentes/GradeDeAgenda.tsx \
       apps/web/src/componentes/GradeDeAgenda.module.css \
       apps/web/tests/componentes/GradeDeAgenda.test.tsx
```

- [ ] **Step 7: Run the whole suite and the type-check**

```bash
pnpm --filter @barchop/web exec vitest run
pnpm --filter @barchop/web exec tsc --noEmit
```

Expected: PASS, sem erro de tipo. Se algum import de `faixasDoDia` ou
`GradeDeAgenda` sobrou em outro arquivo, o `tsc` acusa aqui.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): replace the day agenda with day, week and month views"
```

---

### Task 8: Responsivo e verificação final

**Files:**
- Modify: `apps/web/src/componentes/GradeDeTempo.module.css`
- Modify: `apps/web/src/telas/painel/Agenda.tsx`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada novo.

- [ ] **Step 1: Add the narrow-screen rule**

Acrescente ao fim de `apps/web/src/componentes/GradeDeTempo.module.css`:

```css
/* Abaixo de 900px sete colunas não cabem sem espremer o evento até o
   ilegível. O quadro rola na horizontal dentro da própria caixa, em vez
   de empurrar a página — rolagem horizontal no body quebra o layout
   inteiro. O cliente móvel do barbeiro é o app do Expo, não esta tela. */
@media (max-width: 900px) {
  .quadro {
    overflow-x: auto;
  }

  .coluna {
    min-width: 120px;
  }
}
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @barchop/web exec vitest run`
Expected: PASS — nada deve mudar; é regra de CSS, que o jsdom não aplica.

- [ ] **Step 3: Verify in the browser**

Suba os dois serviços (ver `docs/` e as Global Constraints sobre o EPERM):

```bash
pnpm --filter @barchop/api dev
pnpm --filter @barchop/web dev
```

Confira em `http://localhost:3000/painel/agenda`, e **reporte o que viu**,
não o que esperava ver:

- as três vistas abrem e o seletor marca a corrente;
- `‹ ›` anda no passo certo em cada vista, e `Hoje` volta;
- a régua do agora aparece na coluna de hoje, na altura certa;
- um serviço de 60 min ocupa o dobro da altura de um de 30;
- **nenhuma faixa "livre" aparece dentro de um agendamento** — a
  correção que motivou o trabalho;
- no tema escuro, evento, chip e régua continuam legíveis;
- a página não ganha rolagem horizontal no `body` em nenhuma largura.

- [ ] **Step 4: Full verification**

```bash
pnpm -r test
pnpm -r type-check
```

Expected: PASS em todos os pacotes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/componentes/GradeDeTempo.module.css
git commit -m "feat(web): let the week grid scroll on narrow screens"
```

---

## Notas de encerramento

**O que fica registrado como dívida, não resolvido aqui:**

- `serializarAgendamento` não devolve `barbeiroId`. Quando existir um
  segundo barbeiro por barbearia, a pista precisará de rótulo — e a
  mudança é de API, não desta tela.
- A tela **Hoje** passa a se sobrepor com a vista de dia. Decidir se ela
  vira só os três números, ou se desaparece, é trabalho próprio.
- `grade.ts` e `metricas.ts` continuam em `apps/web`. A promoção para
  `packages/` acontece no começo do sub-projeto D, antes de o app do Expo
  copiá-los.
