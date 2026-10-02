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
  aoAbrirDia?: (data: string) => void;
  agora?: Date;
}) {
  const grade = gradeDeTempo({
    dias: entrada.dias ?? [TERCA],
    horarios: HORARIOS,
    agendamentos: entrada.agendamentos ?? [],
    agora: entrada.agora ?? AGORA,
  });

  render(
    <GradeDeTempo
      grade={grade}
      aoAbrir={entrada.aoAbrir ?? (() => {})}
      aoCriar={entrada.aoCriar ?? (() => {})}
      aoAbrirDia={entrada.aoAbrirDia}
    />
  );

  return grade;
}

const MEIA_HORA: HorarioSerializado[] = [
  { diaSemana: 2, horaAbertura: "09:30", horaFechamento: "18:30", fechado: false },
];

// Monta com outro horário de funcionamento — o `montar` acima fixa o
// HORARIOS de 09:00 às 18:00, que é hora cheia nas duas pontas.
function montarCom(horarios: HorarioSerializado[], dias: string[] = [TERCA]) {
  const grade = gradeDeTempo({
    dias,
    horarios,
    agendamentos: [],
    agora: AGORA,
  });

  render(<GradeDeTempo grade={grade} aoAbrir={() => {}} aoCriar={() => {}} />);

  return grade;
}

// O eixo é o único que escreve hora em <span>: a faixa livre ainda por
// vir é <button> com a hora dentro, e casaria por texto com o rótulo da
// mesma hora. (A faixa que já passou é span, mas vazio — por isso os
// testes de rótulo escritos antes deste helper nunca esbarraram nela.)
function rotuloDoEixo(hora: string) {
  return screen.queryByText(hora, { selector: "span" });
}

function rotulosDoEixo(hora: string) {
  return screen.queryAllByText(hora, { selector: "span" });
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

  it("desce a régua dentro da linha quando o minuto não é múltiplo de 5", () => {
    montar({ dias: [TERCA], agora: new Date("2026-09-08T10:02:00-03:00") });

    const regua = screen.getByTestId("regua-do-agora");
    expect(regua.style.getPropertyValue("--linha")).toBe("13");
    expect(regua.style.getPropertyValue("--fracao")).toBe("0.4");
  });

  it("anuncia o dia fechado em vez de deixar a coluna em branco", () => {
    montar({ dias: ["2026-09-06"] });

    // Fechado e aberto-sem-nada são estados diferentes; confundi-los faz
    // o barbeiro achar que perdeu o dia.
    expect(screen.getByText("Fechado neste dia.")).toBeInTheDocument();
  });

  it("com aoAbrirDia, cada coluna ganha cabeçalho que abre o dia", async () => {
    const aoAbrirDia = vi.fn((_data: string) => {});
    montar({ dias: ["2026-09-07", TERCA], aoAbrirDia });

    await userEvent.click(screen.getByRole("button", { name: "8 de setembro" }));

    expect(aoAbrirDia).toHaveBeenCalledWith(TERCA);
  });

  it("marca só o rótulo de hora que encosta no topo da grade", () => {
    // O rótulo da linha 1 seria recortado pela borda de cima do invólucro
    // que rola, então não pode subir meia linha como os outros — e a
    // grade não pode descer pra abrir espaço, senão nasce uma faixa
    // vazia antes da primeira linha tracejada.
    montar({ dias: [TERCA] });

    // Abrindo às 09:00, o rótulo das 09:00 está na linha 1.
    expect(screen.getByText("09:00")).toHaveAttribute("data-no-topo", "true");
    expect(screen.getByText("10:00")).not.toHaveAttribute("data-no-topo");
  });

  it("rotula a abertura e o fechamento fora da hora cheia", () => {
    // Os dois números que o barbeiro procura são quando o dia começa e
    // quando termina. Só com horas cheias, abrir 09:30 e fechar 18:30
    // deixava as duas pontas da grade sem marca nenhuma.
    montarCom(MEIA_HORA);

    expect(rotuloDoEixo("09:30")).toBeInTheDocument();
    expect(rotuloDoEixo("18:30")).toBeInTheDocument();
  });

  it("marca a abertura pelo topo e o fechamento pela base", () => {
    // A abertura encosta no cabeçalho grudado e não pode subir meia
    // linha. O fechamento é o espelho: marca o FIM da última linha, e
    // pedir a linha seguinte — que não existe — abriria uma linha
    // implícita só no eixo, deixando-o mais alto que as colunas irmãs.
    const grade = montarCom(MEIA_HORA);

    expect(rotuloDoEixo("09:30")).toHaveAttribute("data-no-topo", "true");
    expect(rotuloDoEixo("10:00")).not.toHaveAttribute("data-no-topo");

    const fechamento = rotuloDoEixo("18:30")!;
    expect(fechamento).toHaveAttribute("data-no-fim", "true");
    expect(fechamento.style.getPropertyValue("--linha")).toBe(
      String(grade.totalLinhas)
    );
  });

  it("marca de meia em meia hora entre as pontas", () => {
    // Só as horas cheias deixavam 30 minutos sem nenhuma referência: no
    // meio de um vão de 144px, uma faixa vaga de 10h e pouco não se lê
    // sem contar linha tracejada.
    montar({ dias: [TERCA] });

    expect(rotuloDoEixo("10:30")).toBeInTheDocument();
    expect(rotuloDoEixo("17:30")).toBeInTheDocument();
    // E não desce a 15: dois rótulos a 36px um do outro viram parede.
    expect(rotuloDoEixo("10:15")).not.toBeInTheDocument();
  });

  it("não repete a hora cheia que coincide com uma ponta", () => {
    // Abrindo 09:00, ponta e hora cheia são o mesmo minuto: dois rótulos
    // iguais se empilhariam no mesmo pixel — e `getByText` estouraria.
    montar({ dias: [TERCA] });

    expect(rotulosDoEixo("09:00")).toHaveLength(1);
    expect(rotulosDoEixo("18:00")).toHaveLength(1);
  });

  it("cede a hora cheia que passa perto demais de uma ponta", () => {
    // Abrindo 08:55, o rótulo das 09:00 fica a uma linha de distância —
    // 12px para dois textos. Quem sai é a hora cheia, que é a repetida.
    montarCom([
      { diaSemana: 2, horaAbertura: "08:55", horaFechamento: "18:00", fechado: false },
    ]);

    expect(rotuloDoEixo("08:55")).toBeInTheDocument();
    expect(rotuloDoEixo("09:00")).not.toBeInTheDocument();
    // A de 10:00, longe da ponta, continua lá.
    expect(rotuloDoEixo("10:00")).toBeInTheDocument();
  });

  it("cede também a hora cheia que passa perto do fechamento", () => {
    // O espelho do caso da abertura: fechando 18:05, o rótulo das 18:00
    // ficaria a uma linha do fim. Some, e o último número do eixo antes
    // da ponta passa a ser o das 17:00.
    montarCom([
      { diaSemana: 2, horaAbertura: "09:00", horaFechamento: "18:05", fechado: false },
    ]);

    expect(rotuloDoEixo("18:05")).toBeInTheDocument();
    expect(rotuloDoEixo("18:00")).not.toBeInTheDocument();
    expect(rotuloDoEixo("17:00")).toBeInTheDocument();
  });

  it("na semana, rotula a ponta mais cedo e a mais tarde dos dias à vista", () => {
    // A janela da semana é uma só para as sete colunas, então as pontas
    // são o envelope: quem abre mais cedo e quem fecha mais tarde. Sete
    // pares de abertura e fechamento numa calha de 3.5rem seria ilegível,
    // e a grade não desenha sete escalas diferentes — desenha uma.
    montarCom(
      [
        { diaSemana: 2, horaAbertura: "09:30", horaFechamento: "18:30", fechado: false },
        { diaSemana: 3, horaAbertura: "08:00", horaFechamento: "19:00", fechado: false },
      ],
      [TERCA, "2026-09-09"]
    );

    expect(rotuloDoEixo("08:00")).toHaveAttribute("data-no-topo", "true");
    expect(rotuloDoEixo("19:00")).toHaveAttribute("data-no-fim", "true");
    // As horas da terça não viram ponta. Elas ainda aparecem — 09:30 e
    // 18:30 caem na marcação de meia em meia hora —, mas como marca do
    // meio, sem a medida de ponta que o CSS lê.
    expect(rotuloDoEixo("09:30")).not.toHaveAttribute("data-no-topo");
    expect(rotuloDoEixo("18:30")).not.toHaveAttribute("data-no-fim");
  });

  it("põe o cabeçalho fora da área que rola, com o dia da semana", async () => {
    const aoAbrirDia = vi.fn((_data: string) => {});
    montar({ dias: ["2026-09-07", TERCA], aoAbrirDia });

    const cabecalho = screen.getByTestId("cabecalho-da-grade");

    // Fora do corpo: se o cabeçalho voltar pra dentro das colunas, ele
    // volta a rolar junto — foi assim que ele estava.
    expect(cabecalho).not.toContainElement(screen.getByTestId("corpo-da-grade"));
    expect(screen.getByTestId("corpo-da-grade")).not.toContainElement(cabecalho);

    // O cabeçalho fica FORA do container de rolagem, para a barra começar
    // abaixo dele em vez de correr ao lado dos dias.
    const rolagem = screen.getByTestId("rolagem-da-grade");
    expect(rolagem).not.toContainElement(cabecalho);
    expect(rolagem).toContainElement(screen.getByTestId("corpo-da-grade"));

    // O botão do dia mora no cabeçalho, e leva o dia da semana junto do
    // número.
    const botao = screen.getByRole("button", { name: "8 de setembro" });
    expect(cabecalho).toContainElement(botao);
    expect(botao).toHaveTextContent("ter.");
    expect(botao).toHaveTextContent("8");
  });

  it("dá ao cabeçalho e ao corpo as mesmas trilhas de coluna", () => {
    // As divisórias dos dois só coincidem se as duas grades declararem o
    // mesmo número de colunas. O valor sai do domínio e desce por custom
    // property no quadro: ler de lugares diferentes é como eles saem de
    // sincronia sem nada quebrar até alguém reparar que as linhas
    // deslizam.
    //
    // O que falta aqui é a calha da barra de rolagem, reservada dos dois
    // lados pela mesma regra CSS (ver o módulo). jsdom não faz layout e
    // não a enxerga — a conferência dessa parte é no navegador.
    montar({ dias: ["2026-09-07", TERCA] });

    expect(
      screen.getByTestId("quadro-da-grade").style.getPropertyValue("--colunas")
    ).toBe("2");
  });

  it("sem aoAbrirDia, o cabeçalho ainda mostra os dias, sem virar botão", () => {
    // A vista de dia não navega, mas continua precisando dizer que dia
    // está na tela — antes o cabeçalho sumia inteiro junto com o clique.
    montar({ dias: [TERCA] });

    const cabecalho = screen.getByTestId("cabecalho-da-grade");
    expect(cabecalho).toHaveTextContent("ter.");
    expect(cabecalho).toHaveTextContent("8");
  });

  it("sem aoAbrirDia, não há cabeçalho de coluna", () => {
    // A vista de dia não passa a prop: um botão para abrir o dia que já
    // está aberto seria ruído. Este teste morre se o cabeçalho passar a
    // ser incondicional.
    montar({ dias: [TERCA] });

    expect(
      screen.queryByRole("button", { name: "8 de setembro" })
    ).not.toBeInTheDocument();
  });
});
