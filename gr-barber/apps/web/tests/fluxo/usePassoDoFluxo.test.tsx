import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { usePassoDoFluxo } from "../../src/fluxo/usePassoDoFluxo";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Nove da manhã do dia 9 — o "hoje" fixo que toda asserção envolvendo
// data usa, inclusive as que já existiam antes da checagem de data
// passada. A suíte não pode depender do dia em que roda, senão passa
// hoje e falha sozinha amanhã: qualquer caso com uma data hardcoded na
// query precisa deste `agora` amarrado à mesma data-base, senão vira
// passado de verdade assim que o relógio real da máquina avançar.
const HOJE = new Date("2026-09-09T09:00:00-03:00");

// Componente de prova que chama o hook e expõe seus valores pra assertion.
function ProvaDoFluxo({
  passo,
  agora,
}: {
  passo: "servicos" | "data" | "dados" | "confirmar";
  agora?: Date;
}) {
  const resultado = usePassoDoFluxo(passo, agora);
  return (
    <div>
      <p>pronto: {resultado.pronto ? "sim" : "não"}</p>
      <p>slug: {resultado.slug}</p>
      <p>servicoIds: {resultado.servicoIds.join(",")}</p>
      <p>data: {resultado.data ?? "vazio"}</p>
      <p>hora: {resultado.hora ?? "vazio"}</p>
    </div>
  );
}

// Componente de prova com estado local que força re-renders.
function ProvaComEstado() {
  const [contador, setContador] = useState(0);
  const resultado = usePassoDoFluxo("dados");
  return (
    <div>
      <p>pronto: {resultado.pronto ? "sim" : "não"}</p>
      <p>contador: {contador}</p>
      <button onClick={() => setContador((c) => c + 1)}>incrementar</button>
    </div>
  );
}

describe("usePassoDoFluxo", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("retorna pronto=true quando o passo tem tudo que precisa", async () => {
    // Passo "dados" precisa de serviço, data e hora. A query tem os três,
    // então está pronto. `agora` fixo: sem ele este caso passa hoje e falha
    // sozinho no dia seguinte, quando "2026-09-09" vira passado de
    // verdade pro relógio real da máquina que roda o teste.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-09", hora: "09:30" },
    });

    render(<ProvaDoFluxo passo="dados" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: sim")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
  });

  it("redireciona quando falta pré-requisito", async () => {
    // Passo "dados" precisa de data. A query só tem servicos, então
    // falta a data e deve redirecionar pra "data".
    navegacaoFalsa.redefinir({
      query: { servicos: "s1" },
    });

    render(<ProvaDoFluxo passo="dados" />);

    await waitFor(() => {
      expect(screen.getByText("pronto: não")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1"
    );
  });

  it("chama replace exatamente uma vez mesmo com múltiplos re-renders", async () => {
    // A identidade do objeto `escolhas` muda a cada render porque é
    // recriado por `lerEscolhas`. Uma dependência que incluísse o objeto
    // inteiro dispararia o efeito novamente a cada commit, redirecionando
    // de novo e de novo. Este teste força vários re-renders mudando estado
    // local e verifica que replace foi chamado uma única vez.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1" },
    });

    const user = userEvent.setup();
    render(<ProvaComEstado />);

    await waitFor(() => {
      expect(screen.getByText("pronto: não")).toBeInTheDocument();
    });

    // Força dois re-renders do componente mudando estado local, sem alterar
    // nada que o hook lê da query.
    await user.click(screen.getByRole("button", { name: "incrementar" }));
    await user.click(screen.getByRole("button", { name: "incrementar" }));

    // Com o array antigo contendo `escolhas`, replace seria chamado
    // múltiplas vezes. Com primitivas, é chamado uma única vez.
    expect(navegacaoFalsa.replace).toHaveBeenCalledTimes(1);
  });

  it("data no passado redireciona pro passo de data mesmo com hora presente", async () => {
    // C1: a barreira contra agendar no passado até agora só olhava se
    // `data` e `hora` existiam, nunca se a data já tinha passado. Um
    // link velho com data de ontem passava reto pelo passo de horário.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-08" },
    });

    render(<ProvaDoFluxo passo="dados" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: não")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&data=2026-09-08"
    );
  });

  it("data no passado redireciona pro passo de data também na confirmação", async () => {
    // Mesma checagem, agora no último passo: `/confirmar?...&data=ontem
    // &hora=09:00` pulava a tela de horário inteira sem este redirect.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-08", hora: "09:00" },
    });

    render(<ProvaDoFluxo passo="confirmar" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: não")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&data=2026-09-08&hora=09%3A00"
    );
  });

  it("hoje continua um passo válido no horário e na confirmação", async () => {
    // A guarda não pode superagir: o dia de hoje não é "passado".
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-09", hora: "09:00" },
    });

    render(<ProvaDoFluxo passo="confirmar" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: sim")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
  });

  it("amanhã continua um passo válido nos dados", async () => {
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", hora: "09:00" },
    });

    render(<ProvaDoFluxo passo="dados" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: sim")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
  });

  it("o passo de dia e horário não exige data: sem ela, a tela abre no primeiro dia com vaga", async () => {
    // Nem data passada: lá ela é ignorada. Mandar de volta pra "data" a
    // partir de "data" seria um replace pra mesma tela, em laço.
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-08" } });

    render(<ProvaDoFluxo passo="data" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: sim")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
  });

  it("I2: confirmar só com hora redireciona pro primeiro passo que falta, não renderiza em branco", async () => {
    // Antes desta correção os pré-requisitos eram por campo: "confirmar"
    // só olhava `hora`, então essa URL renderizava a tela real, que por
    // sua vez devolvia null sem redirecionar — uma página em branco sem
    // saída. Cumulativo, a falta de serviços é o primeiro requisito não
    // atendido, e o redirect vai pro passo de serviços.
    navegacaoFalsa.redefinir({ query: { hora: "09:00" } });

    render(<ProvaDoFluxo passo="confirmar" agora={HOJE} />);

    await waitFor(() => {
      expect(screen.getByText("pronto: não")).toBeInTheDocument();
    });
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar?hora=09%3A00"
    );
  });
});
