import { apagarAuditoriaAntiga } from "./auditoria";
import { apagarCodigosVelhos } from "./codigos";
import { apagarContadoresVencidos } from "./contador-de-limite";
import { cifrarCpfsEmClaro } from "./cpf";
import type { Fila } from "./fila";
import type { LogDoWebhook } from "./webhook-dos-planos";

// A faxina diária: apaga do banco o que já não serve pra nada. Existe
// pra que tabela de apoio não vire arquivo morto com rastro de gente —
// o contador de limite guarda (em resumo) quem tentou entrar, e não tem
// por que lembrar disso depois que a janela acabou.
//
// Cada passo é independente: a falha de um vai pro log e não impede os
// outros. Rodar duas vezes não faz mal — só apaga o que já venceu.

export const TRABALHO_FAXINA = "faxina";
// De madrugada, longe da varredura das 8h e do horário das barbearias.
const CRON_DA_FAXINA = "30 3 * * *";

export interface DepsDaFaxina {
  log: LogDoWebhook;
  // O relógio de quem testa.
  agora?: Date;
}

export async function fazerFaxina({ log, agora = new Date() }: DepsDaFaxina): Promise<void> {
  try {
    const contadores = await apagarContadoresVencidos(agora);
    log.info({ contadores }, "faxina: contadores de limite vencidos apagados");
  } catch (erro) {
    log.warn({ erro }, "faxina: falha ao apagar contadores de limite");
  }

  try {
    const auditoria = await apagarAuditoriaAntiga(agora);
    log.info({ auditoria }, "faxina: linhas antigas da trilha de auditoria apagadas");
  } catch (erro) {
    log.warn({ erro }, "faxina: falha ao apagar a trilha de auditoria antiga");
  }

  try {
    const codigos = await apagarCodigosVelhos(agora);
    log.info({ codigos }, "faxina: códigos de verificação usados ou vencidos apagados");
  } catch (erro) {
    log.warn({ erro }, "faxina: falha ao apagar códigos de verificação");
  }

  try {
    const cpfs = await cifrarCpfsEmClaro();
    log.info({ cpfs }, "faxina: CPFs em claro cifrados");
  } catch (erro) {
    log.warn({ erro }, "faxina: falha ao cifrar CPFs em claro");
  }
}

export async function registrarFaxina(fila: Fila, deps: Omit<DepsDaFaxina, "agora">): Promise<void> {
  await fila.trabalhar(TRABALHO_FAXINA, () => fazerFaxina(deps));
  await fila.repetir(TRABALHO_FAXINA, CRON_DA_FAXINA);
}
