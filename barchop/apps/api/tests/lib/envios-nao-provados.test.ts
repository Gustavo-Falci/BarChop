import { afterEach, describe, expect, it, vi } from "vitest";
import { contarEnvioNaoProvado } from "../../src/lib/envios-nao-provados";

// Auditoria de 15/11, SEC-012: a visão do todo dos envios a destinos que
// ninguém provou. Avisa no log; não bloqueia ninguém.
describe("contarEnvioNaoProvado", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function logFalso() {
    return { error: vi.fn(), warn: vi.fn() };
  }

  it("avisa ao chegar no limite do dia, e de novo a cada múltiplo dele", async () => {
    vi.stubEnv("ALERTA_DE_ENVIOS_POR_DIA", "3");
    const log = logFalso();
    const agora = new Date("2026-11-15T10:00:00-03:00");

    for (let envio = 1; envio <= 7; envio += 1) {
      await contarEnvioNaoProvado(log, agora);
    }

    // No 3º e no 6º: uma linha por degrau, não uma por mensagem.
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(log.error.mock.calls[0][0]).toEqual({ contagem: 3, limite: 3 });
    expect(log.error.mock.calls[1][0]).toEqual({ contagem: 6, limite: 3 });
  });

  it("no dia seguinte a conta recomeça", async () => {
    vi.stubEnv("ALERTA_DE_ENVIOS_POR_DIA", "2");
    const log = logFalso();
    const hoje = new Date("2026-11-15T10:00:00-03:00");
    const amanha = new Date("2026-11-16T10:00:01-03:00");

    await contarEnvioNaoProvado(log, hoje);
    await contarEnvioNaoProvado(log, amanha);

    expect(log.error).not.toHaveBeenCalled();
  });
});
