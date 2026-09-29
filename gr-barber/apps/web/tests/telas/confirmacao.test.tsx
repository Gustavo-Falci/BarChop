import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { gravarDadosDoCliente, lerDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Oito da manhã do dia 10 — antes das 09:00 que o `beforeEach` escolhe
// como hora do agendamento, e antes de toda outra data usada neste
// arquivo (as de remarcar são todas depois de setembro). A suíte não
// pode depender do dia em que roda, senão passa hoje e falha sozinha
// amanhã.
const MANHA = new Date("2026-09-10T08:00:00-03:00");

function montar(falso = criarApiClientFalso(), agora: Date = MANHA) {
  render(
    <ProvedorDaApi valor={falso}>
      <Confirmacao agora={agora} />
    </ProvedorDaApi>
  );
  return falso;
}

const botaoConfirmar = () =>
  screen.findByRole("button", { name: /confirmar agendamento/i });

// A confirmação é o último passo e também onde a pessoa se identifica:
// eram duas telas (a pergunta "quem é você?" e depois o resumo), e a
// pergunta custava um toque só pra escolher entre dois botões.
describe("confirmação", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navegacaoFalsa.redefinir({
      query: { servicos: "s1,s2", data: "2026-09-10", hora: "09:00" },
    });
  });

  it("mostra o resumo do que vai ser agendado", async () => {
    montar();
    await waitFor(() => screen.getByText(/corte/i));

    expect(screen.getByText("10 de setembro")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
  });

  describe("sem conta", () => {
    it("pede nome e telefone na própria tela, sem passo antes", async () => {
      montar();

      expect(await screen.findByLabelText(/nome/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/telefone/i)).toBeInTheDocument();
    });

    it("formata o telefone enquanto digita", async () => {
      montar();

      await userEvent.type(await screen.findByLabelText(/telefone/i), "11999998888");

      expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 99999-8888");
    });

    it("manda o telefone normalizado pra API e vira tela de sucesso", async () => {
      // É pelo telefone normalizado que a API acha o cadastro. Outro
      // formato cria um cliente duplicado, e a resposta é 201 igual —
      // por isso a asserção é no corpo enviado, não na mensagem.
      const falso = criarApiClientFalso();
      const agendar = vi.spyOn(falso.publico, "agendar");
      montar(falso);

      await userEvent.type(await screen.findByLabelText(/nome/i), "  João Silva ");
      await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");
      await userEvent.click(await botaoConfirmar());

      await screen.findByText(/agendamento confirmado/i);
      expect(agendar.mock.calls[0][1].cliente).toEqual({
        nome: "João Silva",
        telefone: "(11) 99999-8888",
      });
      // Os dados pessoais somem assim que deixam de ser necessários.
      expect(lerDadosDoCliente()).toBeNull();
    });

    it("Enter no telefone também confirma", async () => {
      // Era dívida de toda tela: formulário sem <form>, e o Enter do
      // teclado do celular não fazia nada.
      const falso = montar();

      await userEvent.type(await screen.findByLabelText(/nome/i), "João");
      await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888{Enter}");

      await screen.findByText(/agendamento confirmado/i);
      expect(falso.estado.agendamentos).toHaveLength(1);
    });

    it("vem preenchido com o rascunho guardado", async () => {
      gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
      montar();

      expect(await screen.findByLabelText(/nome/i)).toHaveValue("João");
      expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 99999-8888");
    });

    it("recusa telefone sem DDD antes de mandar pra API", async () => {
      const falso = montar();

      await userEvent.type(await screen.findByLabelText(/nome/i), "João");
      await userEvent.type(screen.getByLabelText(/telefone/i), "999998888");
      await userEvent.click(await botaoConfirmar());

      expect(screen.getByText(/informe o ddd/i)).toBeInTheDocument();
      expect(falso.estado.agendamentos).toHaveLength(0);
    });

    it("aponta o nome vazio sem culpar o telefone, que está certo", async () => {
      const falso = montar();

      await userEvent.type(await screen.findByLabelText(/telefone/i), "11999998888");
      await userEvent.click(await botaoConfirmar());

      expect(screen.getByText(/informe seu nome/i)).toBeInTheDocument();
      expect(screen.queryByText(/informe o ddd/i)).not.toBeInTheDocument();
      expect(falso.estado.agendamentos).toHaveLength(0);
    });

    it("some com o erro do telefone assim que a pessoa volta a digitar", async () => {
      montar();

      await userEvent.type(await screen.findByLabelText(/nome/i), "João");
      await userEvent.type(screen.getByLabelText(/telefone/i), "999998888");
      await userEvent.click(await botaoConfirmar());
      expect(screen.getByText(/informe o ddd/i)).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText(/telefone/i));
      await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");

      expect(screen.queryByText(/informe o ddd/i)).not.toBeInTheDocument();
    });

    it("'já tem conta' leva pro login e volta pra esta mesma tela", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: /entrar/i }));

      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/entrar?servicos=s1%2Cs2&data=2026-09-10&hora=09%3A00&voltar=confirmar"
      );
    });
  });

  describe("quem já está logada", () => {
    beforeEach(() => sessaoDoCliente("gr-barber").gravar("jwt-do-cliente"));

    it("vê de quem vai ser o agendamento, sem formulário nenhum", async () => {
      // Num celular emprestado, campos preenchidos em silêncio marcariam
      // pra outra pessoa: o cartão diz de quem é.
      montar();

      expect(await screen.findByText("João Silva")).toBeInTheDocument();
      expect(screen.getByText("(11) 99999-8888")).toBeInTheDocument();
      expect(screen.queryByLabelText(/nome/i)).toBeNull();
    });

    it("confirma com os dados do cadastro, sem digitar nada", async () => {
      const falso = criarApiClientFalso();
      const agendar = vi.spyOn(falso.publico, "agendar");
      montar(falso);
      await screen.findByText("João Silva");

      await userEvent.click(await botaoConfirmar());

      await screen.findByText(/agendamento confirmado/i);
      expect(agendar.mock.calls[0][1].cliente).toEqual({
        nome: "João Silva",
        telefone: "(11) 99999-8888",
      });
    });

    it("'outra pessoa' troca o cartão pelo formulário sem sair da tela", async () => {
      montar();
      await userEvent.click(
        await screen.findByRole("button", { name: /agendar para outra pessoa/i })
      );

      expect(screen.getByLabelText(/nome/i)).toHaveValue("");
      expect(sessaoDoCliente("gr-barber").ler()).toBeNull();
      expect(navegacaoFalsa.push).not.toHaveBeenCalled();
      expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
    });

    it("token que a API recusa cai no formulário, não num cartão pela metade", async () => {
      const falso = criarApiClientFalso();
      falso.cliente.meuCadastro = async () => {
        throw new ErroDaApi(401, "nao_autenticado", "");
      };
      montar(falso);

      expect(await screen.findByLabelText(/nome/i)).toBeInTheDocument();
      expect(screen.queryByText("João Silva")).toBeNull();
    });

    it("enquanto a conta não foi apurada, não dá pra confirmar", async () => {
      // Confirmar nesse instante mandaria o formulário vazio por cima de
      // uma conta que ainda está chegando.
      const falso = criarApiClientFalso();
      falso.cliente.meuCadastro = () => new Promise(() => {});
      montar(falso);

      expect(await botaoConfirmar()).toBeDisabled();
    });
  });

  describe("tela de sucesso", () => {
    async function confirmarComRascunho(falso = criarApiClientFalso()) {
      gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
      montar(falso);
      await userEvent.click(await botaoConfirmar());
      await screen.findByText(/agendamento confirmado/i);
      return falso;
    }

    it("diz o que, quando, quanto e onde", async () => {
      // Antes era só "Quando": quem abria a tela depois (print, aba
      // esquecida) não sabia o que tinha marcado nem pra onde ir.
      await confirmarComRascunho();

      expect(screen.getByText("Corte, Barba")).toBeInTheDocument();
      expect(screen.getByText("09:00 · quinta, 10 de setembro")).toBeInTheDocument();
      expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
      expect(screen.getByText("Rua das Tesouras, 123")).toBeInTheDocument();
    });

    it("oferece pôr o horário no calendário do celular", async () => {
      const criarUrl = vi.fn((_blob: Blob) => "blob:agendamento");
      const revogar = vi.fn();
      Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: revogar });
      await confirmarComRascunho();

      await userEvent.click(screen.getByRole("button", { name: /adicionar à agenda/i }));

      expect(criarUrl).toHaveBeenCalledTimes(1);
      const arquivo = criarUrl.mock.calls[0][0];
      expect(arquivo.type).toBe("text/calendar;charset=utf-8");
      expect(await arquivo.text()).toContain("DTSTART:20260910T090000");
    });

    it("sem conta, não aponta pra 'meus agendamentos', que pediria login", async () => {
      await confirmarComRascunho();

      expect(screen.queryByRole("link", { name: /meus agendamentos/i })).toBeNull();
    });

    it("logada, aponta pra 'meus agendamentos'", async () => {
      sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
      montar();
      await screen.findByText("João Silva");
      await userEvent.click(await botaoConfirmar());
      await screen.findByText(/agendamento confirmado/i);

      expect(
        screen.getByRole("link", { name: /ver meus agendamentos/i })
      ).toHaveAttribute("href", "/gr-barber/minha-conta");
    });
  });

  it("no horario_ocupado volta pro passo de dia e horário", async () => {
    // A trava do banco pega a corrida depois de a disponibilidade já ter
    // dito que cabia. Repetir o envio daria o mesmo 409.
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    const falso = criarApiClientFalso();
    await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "09:00",
      cliente: { nome: "Outro", telefone: "(11) 98888-7777" },
    });

    montar(falso);
    await userEvent.click(await botaoConfirmar());

    await waitFor(() =>
      // O aviso vai na URL, não em estado local: a outra tela monta do
      // zero, e o estado desta morreria com ela.
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/data?servicos=s1%2Cs2&data=2026-09-10&aviso=horario_ocupado"
      )
    );
  });

  it("I5: horário que expirou entre o carregar e o confirmar volta pro passo de dia e horário", async () => {
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    const TARDE = new Date("2026-09-10T14:00:00-03:00");
    const falso = montar(criarApiClientFalso(), TARDE);

    await userEvent.click(await botaoConfirmar());

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/data?servicos=s1%2Cs2&data=2026-09-10&aviso=horario_expirou"
      )
    );
    expect(falso.estado.agendamentos).toHaveLength(0);
  });

  describe("remarcar", () => {
    async function prepararRemarcar() {
      const falso = criarApiClientFalso();
      const original = await falso.publico.agendar("gr-barber", {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data: "2026-09-20",
        horaInicio: "11:00",
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      });
      navegacaoFalsa.redefinir({
        query: {
          servicos: "s1",
          data: "2026-09-21",
          hora: "10:00",
          remarcar: original.id,
        },
      });
      return { falso, original };
    }

    it("chama remarcar em vez de agendar, sem pedir dados", async () => {
      const { falso, original } = await prepararRemarcar();

      montar(falso);
      await userEvent.click(await botaoConfirmar());

      await screen.findByText(/agendamento confirmado/i);
      expect(screen.queryByLabelText(/nome/i)).toBeNull();
      const cancelado = falso.estado.agendamentos.find((a) => a.id === original.id);
      expect(cancelado?.status).toBe("cancelado");
    });

    it("M7: não apaga um rascunho de outro agendamento em andamento", async () => {
      // Remarcar nem usa esses dados (o cliente vem do token), então não
      // tem por que mexer neles.
      const rascunhoDeOutroAgendamento = {
        nome: "Outra Pessoa",
        telefone: "(11) 91111-2222",
      };
      const { falso } = await prepararRemarcar();
      gravarDadosDoCliente(rascunhoDeOutroAgendamento);

      montar(falso);
      await userEvent.click(await botaoConfirmar());

      await screen.findByText(/agendamento confirmado/i);
      expect(lerDadosDoCliente()).toEqual(rascunhoDeOutroAgendamento);
    });
  });
});
