import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";

import { NavegacaoDoPainel } from "../../../src/painel/NavegacaoDoPainel";
import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { FolgasEBloqueios } from "../../../src/telas/painel/FolgasEBloqueios";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, B4: a semana de trabalho e os serviços de cada membro (na
// tela do membro) e a tela de folgas e bloqueios.

// Um instante fixo: a tela lista os bloqueios dos próximos 90 dias.
const AGORA = new Date("2037-01-01T12:00:00-03:00");

function comAna(semente: Parameters<typeof criarApiClientFalso>[0] = {}) {
  const falso = criarApiClientFalso(semente);
  falso.estado.equipe!.push({
    id: "m2",
    nome: "Ana",
    email: "ana@gr.com",
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
    podeVenderPlanos: false,
  });
  return falso;
}

// A edição do membro tem abas (17/10): Dados, Jornada e Serviços. Na
// jornada, um dia por linha (redesenho dos detalhes, PR 6): tocar abre a
// folha do dia, com o modo nos rádios e as horas embaixo, e só o "Usar
// esta" leva pra semana. O salvar é a barra de mudanças no pé da tela.
async function abrirAba(nome: "Jornada" | "Serviços") {
  await userEvent.click(await screen.findByRole("tab", { name: nome }));
}

function linhaDoDia(dia: string) {
  return screen.getByRole("button", { name: new RegExp(`^${dia}`, "i") });
}

async function abrirDia(dia: string) {
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${dia}`, "i") }));
  return within(screen.getByRole("dialog"));
}

async function usar() {
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usar esta" }));
}

function barra() {
  return screen.getByRole("region", { name: "Mudanças" });
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
});

// As Folgas abrem na lista (17/10); o formulário mora na mesma janela
// "Bloquear horário" da Agenda, aberta pelo "+ Bloquear" do cabeçalho.
async function abrirBloquear() {
  await userEvent.click(await screen.findByRole("button", { name: "+ Bloquear" }));
}

describe("jornada do membro", () => {
  it("troca a segunda pra horário próprio e salva a semana inteira", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    expect(folha.getByRole("group", { name: "Jornada na segunda" })).toBeInTheDocument();
    await userEvent.click(folha.getByRole("radio", { name: "Horário próprio" }));
    fireEvent.change(folha.getByLabelText("Entrada na segunda"), { target: { value: "13:00" } });
    fireEvent.change(folha.getByLabelText("Saída na segunda"), { target: { value: "20:00" } });
    await usar();
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const [id, semana] = salvar.mock.calls[0];
    expect(id).toBe("m2");
    expect(semana).toHaveLength(7);
    expect(semana[1]).toEqual({
      diaSemana: 1,
      modo: "proprio",
      horaInicio: "13:00",
      horaFim: "20:00",
      // Sem `pausaInicio`/`pausaFim`: com eles no corpo, a API trataria
      // o pedido como da web antiga (PUT /equipe/:id/jornada).
      pausas: [],
    });
    expect(semana[2]).toMatchObject({ modo: "barbearia" });
    expect(await screen.findByText(/jornada salva/i)).toBeInTheDocument();
    // A tela fica com o que salvou, e não volta pra semana de antes.
    expect(linhaDoDia("segunda")).toHaveTextContent("Horário próprio · 13:00–20:00");
  });

  it("horário próprio sem saída para na folha, sem chamar a API", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("radio", { name: "Horário próprio" }));
    fireEvent.change(folha.getByLabelText("Entrada na segunda"), { target: { value: "13:00" } });
    await usar();

    expect(folha.getByText(/segunda.*entrada e a saída/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("a barra só aparece depois de mudar a semana, diz o que mudou, e Descartar volta como estava", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    await screen.findByRole("button", { name: /^segunda/i });
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();

    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("radio", { name: "Folga" }));
    await usar();
    expect(barra()).toHaveTextContent("Segunda: Horário da barbearia → Folga");
    expect(linhaDoDia("segunda")).toHaveTextContent("Folga");

    await userEvent.click(within(barra()).getByRole("button", { name: "Descartar" }));
    expect(linhaDoDia("segunda")).toHaveTextContent("Horário da barbearia");
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });

  it("abrir um dia e usar sem mexer não é mudança", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("terça");
    expect(folha.getByRole("radio", { name: "Horário da barbearia" })).toBeChecked();
    await usar();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });

  it("fechar a folha sem usar desiste do que foi escolhido nela", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("radio", { name: "Folga" }));
    await userEvent.click(folha.getByRole("button", { name: "Fechar" }));

    expect(linhaDoDia("segunda")).toHaveTextContent("Horário da barbearia");
    expect(screen.queryByRole("region", { name: "Mudanças" })).not.toBeInTheDocument();
  });

  it("trocar de aba não perde o que ainda não foi salvo", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    await abrirDia("segunda");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: "Folga" }));
    await usar();
    await abrirAba("Serviços");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Barba" }));
    await abrirAba("Jornada");

    expect(await screen.findByRole("button", { name: /^segunda/i })).toHaveTextContent("Folga");
    expect(barra()).toHaveTextContent("Segunda: Horário da barbearia → Folga");
    await abrirAba("Serviços");
    expect(screen.getByRole("checkbox", { name: "Barba" })).not.toBeChecked();
  });

  it("a edição abre na aba Dados; Jornada e Serviços ficam nas próprias abas", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    expect(await screen.findByRole("tab", { name: "Dados" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /^segunda/i })).not.toBeInTheDocument();

    await abrirAba("Jornada");
    expect(await screen.findByRole("button", { name: /^segunda/i })).toBeInTheDocument();
  });

  it("folga esconde as horas e a pausa do dia", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("domingo");
    await userEvent.click(folha.getByRole("radio", { name: "Folga" }));

    expect(folha.queryByLabelText("Entrada no domingo")).not.toBeInTheDocument();
    expect(folha.queryByRole("button", { name: "Adicionar pausa no domingo" })).not.toBeInTheDocument();
  });
});

// Painel v2, marco 3: a pausa é de cada profissional, por dia (decisão do
// dono, 2026-10-07). Desde 08/11, quantas o barbeiro precisar no mesmo
// dia (pedido do barbeiro; canvas "Várias pausas").
const ALMOCO = { inicio: "12:00", fim: "13:00" };
const CAFE = { inicio: "16:00", fim: "16:15" };

function horas(folha: ReturnType<typeof within>, n: number, quando: string, inicio: string, fim: string) {
  fireEvent.change(folha.getByLabelText(`Início da pausa ${n} ${quando}`), { target: { value: inicio } });
  fireEvent.change(folha.getByLabelText(`Fim da pausa ${n} ${quando}`), { target: { value: fim } });
}

// A sexta com o almoço e o café; o resto acompanha a barbearia.
function comAnaESextaComDuas() {
  return comAna({
    jornadas: {
      m2: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        modo: "barbearia" as const,
        horaInicio: null,
        horaFim: null,
        pausas: diaSemana === 5 ? [ALMOCO, CAFE] : [],
      })),
    },
  });
}

describe("pausas na jornada", () => {
  it("aplica as pausas de sempre aos dias de trabalho, menos à folga, e salva", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const domingo = await abrirDia("domingo");
    await userEvent.click(domingo.getByRole("radio", { name: "Folga" }));
    await usar();
    const folha = await abrirDia("pausas de sempre");
    horas(folha, 1, "de sempre", "12:00", "13:00");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar outra pausa de sempre" }));
    horas(folha, 2, "de sempre", "16:00", "16:15");
    await userEvent.click(folha.getByRole("button", { name: /aplicar aos dias de trabalho/i }));
    expect(linhaDoDia("pausas de sempre")).toHaveTextContent("12:00–13:00 e 16:00–16:15");
    expect(linhaDoDia("segunda")).toHaveTextContent("pausas 12:00–13:00 e 16:00–16:15");
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const [, semana] = salvar.mock.calls[0];
    expect(semana[1].pausas).toEqual([ALMOCO, CAFE]);
    expect(semana[6].pausas).toEqual([ALMOCO, CAFE]);
    expect(semana[0]).toMatchObject({ modo: "folga", pausas: [] });
    // A web nova nunca manda os campos antigos: com eles, a API trataria
    // o pedido como da web antiga.
    for (const dia of semana) {
      expect(dia).not.toHaveProperty("pausaInicio");
      expect(dia).not.toHaveProperty("pausaFim");
    }
  });

  it("as pausas de sempre nascem do primeiro dia com pausa e trocam as de cada dia", async () => {
    montarPainel(<CadastroDeMembro />, comAnaESextaComDuas());

    await abrirAba("Jornada");
    expect(await screen.findByRole("button", { name: /^pausas de sempre/i })).toHaveTextContent(
      "12:00–13:00 e 16:00–16:15"
    );
    const folha = await abrirDia("pausas de sempre");
    await userEvent.click(folha.getByRole("button", { name: "Tirar a pausa 2 de sempre" }));
    await userEvent.click(folha.getByRole("button", { name: /aplicar aos dias de trabalho/i }));

    expect(linhaDoDia("sexta")).toHaveTextContent("pausa 12:00–13:00");
    expect(linhaDoDia("sexta")).not.toHaveTextContent("16:00");
    expect(linhaDoDia("terça")).toHaveTextContent("pausa 12:00–13:00");
  });

  it("um dia ganha duas pausas e outro perde a dele", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const terca = await abrirDia("terça");
    await userEvent.click(terca.getByRole("button", { name: "Adicionar pausa na terça" }));
    horas(terca, 1, "na terça", "14:00", "14:30");
    await userEvent.click(terca.getByRole("button", { name: "Adicionar outra pausa na terça" }));
    horas(terca, 2, "na terça", "10:00", "10:15");
    await usar();
    // Em ordem de início, como a API devolve.
    expect(linhaDoDia("terça")).toHaveTextContent("pausas 10:00–10:15 e 14:00–14:30");
    const quarta = await abrirDia("quarta");
    await userEvent.click(quarta.getByRole("button", { name: "Adicionar pausa na quarta" }));
    await userEvent.click(quarta.getByRole("button", { name: "Tirar a pausa 1 na quarta" }));
    await usar();
    expect(barra()).toHaveTextContent("Terça: horário ou pausas");
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const [, semana] = salvar.mock.calls[0];
    expect(semana[2].pausas).toEqual([
      { inicio: "10:00", fim: "10:15" },
      { inicio: "14:00", fim: "14:30" },
    ]);
    expect(semana[3].pausas).toEqual([]);
  });

  it("tirar só a segunda pausa do dia", async () => {
    montarPainel(<CadastroDeMembro />, comAnaESextaComDuas());

    await abrirAba("Jornada");
    expect(await screen.findByRole("button", { name: /^sexta/i })).toHaveTextContent(
      "pausas 12:00–13:00 e 16:00–16:15"
    );
    const folha = await abrirDia("sexta");
    await userEvent.click(folha.getByRole("button", { name: "Tirar a pausa 2 na sexta" }));
    await usar();

    expect(linhaDoDia("sexta")).toHaveTextContent("pausa 12:00–13:00");
    expect(linhaDoDia("sexta")).not.toHaveTextContent("16:00");
  });

  it("pausas que se cruzam param na folha, sem chamar a API", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na segunda" }));
    horas(folha, 1, "na segunda", "12:00", "13:00");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar outra pausa na segunda" }));
    horas(folha, 2, "na segunda", "12:30", "13:30");
    await usar();

    expect(folha.getByText("Segunda: as pausas 12:00–13:00 e 12:30–13:30 se cruzam.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("encostar pode: 12:00–13:00 e 13:00–13:30", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na segunda" }));
    horas(folha, 1, "na segunda", "12:00", "13:00");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar outra pausa na segunda" }));
    horas(folha, 2, "na segunda", "13:00", "13:30");
    await usar();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linhaDoDia("segunda")).toHaveTextContent("pausas 12:00–13:00 e 13:00–13:30");
  });

  it("pausa que termina antes de começar, ou sem as horas, para na folha", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Jornada");
    const folha = await abrirDia("segunda");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na segunda" }));
    horas(folha, 1, "na segunda", "13:00", "12:00");
    await usar();
    expect(folha.getByText(/segunda.*pausa precisa começar antes de terminar/i)).toBeInTheDocument();

    horas(folha, 1, "na segunda", "12:00", "13:00");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar outra pausa na segunda" }));
    await usar();
    expect(folha.getByText(/segunda.*começo e o fim da pausa/i)).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("pausa fora do horário do dia ganha o aviso, e ainda dá pra usar", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("sexta");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na sexta" }));
    horas(folha, 1, "na sexta", "12:00", "13:00");
    expect(folha.queryByText(/fora do horário/)).not.toBeInTheDocument();
    await userEvent.click(folha.getByRole("button", { name: "Adicionar outra pausa na sexta" }));
    horas(folha, 2, "na sexta", "19:00", "19:30");

    expect(
      await folha.findByText("19:00–19:30 fica fora do horário deste dia (09:00–18:00): não muda nada na agenda.")
    ).toBeInTheDocument();
    horas(folha, 2, "na sexta", "17:30", "18:30");
    expect(
      folha.getByText("17:30–18:30 passa do horário deste dia (09:00–18:00): só vale a parte de dentro.")
    ).toBeInTheDocument();
    await usar();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linhaDoDia("sexta")).toHaveTextContent("pausas 12:00–13:00 e 17:30–18:30");
  });

  it("no horário próprio, o aviso segue as horas dele", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("quarta");
    await userEvent.click(folha.getByRole("radio", { name: "Horário próprio" }));
    fireEvent.change(folha.getByLabelText("Entrada na quarta"), { target: { value: "13:00" } });
    fireEvent.change(folha.getByLabelText("Saída na quarta"), { target: { value: "18:00" } });
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na quarta" }));
    horas(folha, 1, "na quarta", "12:00", "12:30");

    expect(
      await folha.findByText("12:00–12:30 fica fora do horário deste dia (13:00–18:00): não muda nada na agenda.")
    ).toBeInTheDocument();
  });

  it("folga não tem pausa: escolher folga tira as do dia", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Jornada");
    const folha = await abrirDia("sexta");
    await userEvent.click(folha.getByRole("button", { name: "Adicionar pausa na sexta" }));
    await userEvent.click(folha.getByRole("radio", { name: "Folga" }));

    expect(folha.queryByLabelText("Início da pausa 1 na sexta")).not.toBeInTheDocument();
    expect(folha.queryByRole("button", { name: "Adicionar pausa na sexta" })).not.toBeInTheDocument();
  });
});

describe("serviços do membro", () => {
  it("desmarca a barba e salva a lista inteira", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarServicosDoMembro");
    montarPainel(<CadastroDeMembro />, falso);

    await abrirAba("Serviços");
    const barba = await screen.findByRole("checkbox", { name: "Barba" });
    expect(barba).toBeChecked();
    await userEvent.click(barba);
    await userEvent.click(screen.getByRole("button", { name: /salvar serviços/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalledWith("m2", ["s1"]));
    expect(await screen.findByText(/serviços salvos/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Barba" })).not.toBeChecked();
  });

  it("Salvar serviços só aparece enquanto a marcação difere da salva", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await abrirAba("Serviços");
    const barba = await screen.findByRole("checkbox", { name: "Barba" });
    expect(screen.queryByRole("button", { name: /salvar serviços/i })).not.toBeInTheDocument();

    await userEvent.click(barba);
    expect(screen.getByRole("button", { name: /salvar serviços/i })).toBeInTheDocument();

    await userEvent.click(barba);
    expect(screen.queryByRole("button", { name: /salvar serviços/i })).not.toBeInTheDocument();
  });
});

describe("folgas e bloqueios", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/bloqueios" }));

  it("lista os bloqueios dos próximos dias com o nome de quem e o motivo", async () => {
    const falso = comAna({
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "m2",
          dataInicio: "2037-01-05",
          dataFim: "2037-01-09",
          horaInicio: null,
          horaFim: null,
          motivo: "Férias",
        },
      ],
    });
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);
    await abrirBloquear();

    // Pelo período: "Férias" também é um atalho do motivo no formulário.
    const item = (await screen.findByText("5 a 9 de janeiro")).closest("li") as HTMLElement;
    expect(within(item).getByText("Férias")).toBeInTheDocument();
    expect(within(item).getByText("Ana")).toBeInTheDocument();
    expect(within(item).getByText(/dia inteiro/i)).toBeInTheDocument();
  });

  it("bloqueia o almoço da Ana numa faixa de horas", async () => {
    const falso = comAna();
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);
    await abrirBloquear();

    // Espera a pílula da Ana: o grupo aparece antes de a equipe chegar.
    await userEvent.click(await screen.findByRole("radio", { name: "Ana" }));
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2037-01-12" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-16" } });
    await userEvent.click(screen.getByRole("radio", { name: "Só algumas horas" }));
    fireEvent.change(screen.getByLabelText("Das"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Às"), { target: { value: "13:00" } });
    await userEvent.type(screen.getByLabelText(/motivo/i), "Almoço");
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        barbeiroId: "m2",
        dataInicio: "2037-01-12",
        dataFim: "2037-01-16",
        horaInicio: "12:00",
        horaFim: "13:00",
        motivo: "Almoço",
      })
    );
    // Na lista, pelo período ("Almoço" também é atalho do motivo).
    const novo = (await screen.findByText("12 a 16 de janeiro")).closest("li") as HTMLElement;
    expect(within(novo).getByText("Almoço")).toBeInTheDocument();
  });

  it("período invertido para na tela, sem chamar a API", async () => {
    const falso = comAna();
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);
    await abrirBloquear();

    fireEvent.change(await screen.findByLabelText("De"), { target: { value: "2037-01-16" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-12" } });
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    expect(await screen.findByText(/termina antes de começar/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("remove um bloqueio", async () => {
    const falso = comAna({
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "bb1",
          dataInicio: "2037-01-05",
          dataFim: "2037-01-05",
          horaInicio: null,
          horaFim: null,
          motivo: "Médico",
        },
      ],
    });
    const apagar = vi.spyOn(falso.barbeiro, "apagarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);
    await abrirBloquear();

    const item = (await screen.findByText("5 de janeiro")).closest("li") as HTMLElement;
    await userEvent.click(within(item).getByRole("button", { name: /remover/i }));

    await waitFor(() => expect(apagar).toHaveBeenCalledWith("x1"));
    await waitFor(() => expect(screen.queryByText("5 de janeiro")).not.toBeInTheDocument());
  });

  it("o profissional bloqueia só a própria agenda: sem escolher membro", async () => {
    const falso = comAna({ papel: "profissional" });
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);
    await abrirBloquear();

    fireEvent.change(await screen.findByLabelText("De"), { target: { value: "2037-01-05" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-05" } });
    expect(screen.queryByRole("group", { name: "Membro" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ barbeiroId: "bb1" }))
    );
  });

  it("todo papel vê Folgas na barra", async () => {
    montarPainel(<NavegacaoDoPainel />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByRole("link", { name: /folgas/i })).toHaveAttribute(
      "href",
      "/painel/bloqueios"
    );
  });
});
