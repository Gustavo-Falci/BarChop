import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { IndiceDeConfiguracoes } from "../../../src/telas/painel/configuracoes/IndiceDeConfiguracoes";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 2: Configurações vira um índice de áreas. Cada linha
// mostra o que vale hoje ou, se a área nunca foi salva, o que acontece
// se ficar assim — e a contagem "X de 6 decididas" no topo. Decidida =
// salva pelo menos uma vez (decisão do dono do produto, 2026-10-06).

describe("índice das configurações", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("conta quantas áreas já foram decididas", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios", "comunicacao"] }));

    expect(await screen.findByText("2 de 6 decididas")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /decididas/i })).toHaveAttribute("aria-valuenow", "2");
  });

  it("a divisão do dinheiro tem linha própria, fora da contagem", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios", "comunicacao"] }));

    const divisao = await screen.findByRole("link", { name: /^Divisão do dinheiro/ });
    expect(divisao).toHaveAttribute("href", "/painel/configuracoes/divisao");
    expect(divisao).toHaveTextContent(/quem atendeu fica com tudo/i);
    expect(screen.getByText("2 de 6 decididas")).toBeInTheDocument();
  });

  it("cada área leva à subtela dela", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso());

    expect(await screen.findByRole("link", { name: /^Horários/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/horarios"
    );
    expect(screen.getByRole("link", { name: /^Regras de agendamento/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/regras-de-agendamento"
    );
    expect(screen.getByRole("link", { name: /^Dados do negócio/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/dados-do-negocio"
    );
    expect(screen.getByRole("link", { name: /^Aparência/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/aparencia"
    );
    expect(screen.getByRole("link", { name: /^Comunicação/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/comunicacao"
    );
    expect(screen.getByRole("link", { name: /^Notificações/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/notificacoes"
    );
    expect(screen.getByRole("link", { name: /^Seu perfil/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/perfil"
    );
  });

  it("área decidida mostra o que vale hoje, sem pedir pra configurar", async () => {
    montarPainel(
      <IndiceDeConfiguracoes />,
      criarApiClientFalso({
        areasDecididas: ["horarios", "regras_de_agendamento", "dados_do_negocio", "aparencia", "comunicacao", "notificacoes"],
      })
    );

    expect(await screen.findByRole("link", { name: /^Horários/ })).toHaveTextContent("Aberto 6 dias por semana");
    expect(screen.getByRole("link", { name: /^Dados do negócio/ })).toHaveTextContent(
      "GR Barber · Rua das Tesouras, 123"
    );
    expect(screen.getByRole("link", { name: /^Comunicação/ })).toHaveTextContent("1 canal de contato");
    expect(screen.getByRole("link", { name: /^Notificações/ })).toHaveTextContent(
      "Lembrete por e-mail 24 horas antes"
    );
    expect(screen.getByRole("link", { name: /^Regras de agendamento/ })).toHaveTextContent(
      "Grade de 15 min · agenda sem limite"
    );
    // Publicada, a Aparência diz o tema e o modo.
    expect(screen.getByRole("link", { name: /^Aparência/ })).toHaveTextContent("BarChop · segue o celular do cliente");
    expect(screen.getByText("6 de 6 decididas")).toBeInTheDocument();
    // Redesenho (01/11): o selo da subtela, e nenhum "Faltando".
    expect(screen.getByRole("link", { name: /^Horários/ })).toHaveTextContent("Configurado");
    expect(screen.queryByText("Faltando")).not.toBeInTheDocument();
    expect(screen.getByText("tudo decidido")).toBeInTheDocument();
  });

  // Redesenho das Configurações (01/11): o "Configurar →" de cada linha
  // virou o selo "Faltando", o mesmo da subtela; a linha toda já é o link.
  it("área não decidida mostra a consequência e o selo Faltando", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios"] }));

    const comunicacao = await screen.findByRole("link", { name: /^Comunicação/ });
    expect(comunicacao).toHaveTextContent(/sem whatsapp/i);
    expect(comunicacao).toHaveTextContent("Faltando");
    expect(screen.getByRole("link", { name: /^Horários/ })).not.toHaveTextContent("Faltando");
    expect(screen.queryByText(/configurar/i)).not.toBeInTheDocument();
  });

  // A contagem saiu do lado do título, onde a frase de apoio passava por
  // cima dela no celular: agora é um cartão embaixo, com quantas faltam
  // e a frase dentro.
  it("a contagem diz quantas faltam e explica o selo", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios", "comunicacao"] }));

    const progresso = await screen.findByRole("region", { name: "Áreas decididas" });
    expect(progresso).toHaveTextContent("2 de 6 decididas");
    expect(progresso).toHaveTextContent("faltam 4");
    expect(progresso).toHaveTextContent(/faltando/i);
    expect(screen.getByRole("heading", { level: 1, name: "Configurações" }).closest("header")).not.toHaveTextContent(
      /decididas/
    );
  });

  it("Aparência nunca publicada: a página está com as cores padrão", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso());

    const aparencia = await screen.findByRole("link", { name: /^Aparência/ });
    expect(aparencia).toHaveTextContent(/cores padrão/i);
    expect(aparencia).toHaveTextContent("Faltando");
  });

  it("barbearia que nunca salvou as regras vê que vale o padrão", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios"] }));

    const regras = await screen.findByRole("link", { name: /^Regras de agendamento/ });
    expect(regras).toHaveTextContent(/vale o padrão/i);
    expect(regras).toHaveTextContent("Faltando");
    expect(screen.getByText("1 de 6 decididas")).toBeInTheDocument();
  });

  it("o perfil é de cada pessoa: não entra na contagem nem leva selo", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso());

    const perfil = await screen.findByRole("link", { name: /^Seu perfil/ });
    expect(perfil).not.toHaveTextContent(/faltando|configurado/i);
    expect(screen.getByText("0 de 6 decididas")).toBeInTheDocument();
  });

  // O profissional não tem as áreas da barbearia, mas tem duas coisas
  // suas: o perfil e a conta do Asaas dos planos que vende. Sem o índice,
  // Pagamentos online só se achava pelo atalho na tela de Planos.
  it("o profissional vê o próprio perfil e os pagamentos online, sem as áreas da barbearia", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByRole("link", { name: /^Seu perfil/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/perfil"
    );
    expect(screen.getByRole("link", { name: /^Pagamentos online/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/pagamentos-online"
    );
    expect(screen.queryByText(/decididas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Horários/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Divisão do dinheiro/ })).not.toBeInTheDocument();
  });

  it("o profissional com conta conectada vê a final da chave dele na linha", async () => {
    montarPainel(
      <IndiceDeConfiguracoes />,
      criarApiClientFalso({
        papel: "profissional",
        contasOnline: {
          bb1: {
            provedor: "asaas",
            modo: "real",
            chaveFinal: "9876",
            conectadaEm: "2026-10-25T15:00:00.000Z",
            infiniteTag: null,
            diasParaCancelar: null,
          },
        },
      })
    );

    // A linha aparece antes da conta chegar, com a frase geral.
    expect(await screen.findByText("Sua conta conectada · chave terminando em 9876")).toBeInTheDocument();
  });

  it("a recepção vê só o próprio perfil, sem o índice", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ papel: "recepcao" }));

    expect(await screen.findByLabelText(/seu nome/i)).toBeInTheDocument();
    expect(screen.queryByText(/decididas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Horários/ })).not.toBeInTheDocument();
  });
});
