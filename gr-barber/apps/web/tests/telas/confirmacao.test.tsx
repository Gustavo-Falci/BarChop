import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { gravarDadosDoCliente, lerDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Oito da manhã do dia 10 — antes das 09:00 que o `beforeEach` escolhe
// como hora do agendamento, e antes de toda outra data usada neste
// arquivo (as de remarcar são todas depois de setembro). A suíte não
// pode depender do dia em que roda, senão passa hoje e falha sozinha
// amanhã: sem este padrão fixo, `montar()` sem `agora` explícito caía
// no relógio real da máquina, e "2026-09-10" deixaria de ser "hoje ou
// depois" assim que a data virasse.
const MANHA = new Date("2026-09-10T08:00:00-03:00");

function montar(falso = criarApiClientFalso(), agora: Date = MANHA) {
  render(
    <ProvedorDaApi valor={falso}>
      <Confirmacao agora={agora} />
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
      // O aviso vai na URL, não em estado local: a tela de horário
      // monta do zero, e o `setAviso` desta tela morreria com ela.
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/horario?servicos=s1%2Cs2&data=2026-09-10&aviso=horario_ocupado"
      )
    );
  });

  it("volta pro passo de dados quando não há nome e telefone guardados", async () => {
    sessionStorage.clear();
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/dados?servicos=s1%2Cs2&data=2026-09-10&hora=09%3A00"
      )
    );
    // Uma vez só: o array de dependências do efeito usa primitivos
    // (join da lista, não a lista), senão um array novo a cada render
    // repetiria o replace indefinidamente.
    expect(navegacaoFalsa.replace).toHaveBeenCalledTimes(1);
    // Sem asserção não-nula: o botão simplesmente não existe enquanto
    // faltam os dados, em vez de existir e confiar num `!` pra chamar a
    // API sem cliente.
    expect(screen.queryByRole("button", { name: /confirmar/i })).toBeNull();
  });

  it("I5: horário que expirou entre o carregar e o confirmar volta pro passo de horário", async () => {
    // Duas da tarde do dia 10 — depois das 09:00 escolhidas no
    // beforeEach. Sem essa checagem no clique, uma decisão lenta cria
    // um agendamento inalterável sem precisar de URL velha nenhuma.
    const TARDE = new Date("2026-09-10T14:00:00-03:00");
    const falso = montar(criarApiClientFalso(), TARDE);
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/horario?servicos=s1%2Cs2&data=2026-09-10&aviso=horario_expirou"
      )
    );
    // Não chegou a criar nada: a checagem barra antes da chamada à API.
    expect(falso.estado.agendamentos).toHaveLength(0);
  });

  it("M7: remarcar não apaga um rascunho de outro agendamento em andamento", async () => {
    // limparDadosDoCliente() incondicional apagaria nome e telefone de
    // uma OUTRA reserva ainda no passo de dados — remarcar nem usa
    // esses dados (o cliente vem do token), então não tem por que
    // mexer neles.
    const rascunhoDeOutroAgendamento = {
      nome: "Outra Pessoa",
      telefone: "(11) 91111-2222",
    };
    const falso = criarApiClientFalso();
    const original = await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-20",
      horaInicio: "11:00",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });
    sessionStorage.clear();
    gravarDadosDoCliente(rascunhoDeOutroAgendamento);
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
    expect(lerDadosDoCliente()).toEqual(rascunhoDeOutroAgendamento);
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

  it("com sessão, a tela de sucesso leva aos agendamentos", async () => {
    // Quem acabou de agendar logado quer conferir, cancelar ou remarcar
    // — e a confirmação era um beco: só voltava pra página inicial.
    localStorage.clear();
    sessaoDoCliente("gr-barber").gravar("token");
    montar();
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByRole("link", { name: "Ver meus agendamentos" })
    ).toHaveAttribute("href", "/gr-barber/minha-conta");
  });

  it("sem sessão, a tela de sucesso não promete uma conta que não existe", async () => {
    localStorage.clear();
    montar();
    await waitFor(() => screen.getByRole("button", { name: /confirmar/i }));

    await userEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() =>
      expect(screen.getByText(/agendamento confirmado/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("link", { name: "Ver meus agendamentos" })).toBeNull();
  });
});
