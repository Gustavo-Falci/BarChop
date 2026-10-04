import { PgBoss } from "pg-boss";
import { buildApp } from "./app";
import { filaDoPgBoss, urlDoPg } from "./lib/fila";
import { enderecoDasBarbearias } from "./lib/endereco";
import { criarLinkDoLembrete, registrarLembrete } from "./lib/lembrete";

// Entrypoint do bundle (ver tsup.config.ts). Toda a montagem da
// aplicação está no app.ts, que os testes usam sem abrir porta.
//
// A fila de trabalhos (pg-boss) só existe aqui: os testes passam a de
// memória pro buildApp e nunca abrem conexão com o pg-boss. O worker
// roda no mesmo processo da API — trocar por um processo à parte é
// outro entrypoint montando a mesma fila.
async function main(): Promise<void> {
  const boss = new PgBoss({
    connectionString: urlDoPg(process.env.DATABASE_URL ?? ""),
    // O Prisma já tem o pool dele; a fila precisa de pouco.
    max: 3,
  });

  const app = buildApp({ logger: true, fila: filaDoPgBoss(boss) });

  // O pg-boss é um EventEmitter: um "error" sem ouvinte lança e derruba
  // o processo inteiro — a API junto. Erro da fila vai pro log.
  boss.on("error", (erro) => app.log.error(erro, "fila de trabalhos"));

  // Antes do listen: a fila cria o schema dela no primeiro start, e uma
  // API que aceita agendamento sem conseguir agendar o lembrete é pior
  // que uma que não sobe.
  await boss.start();
  app.addHook("onClose", async () => {
    await boss.stop();
  });

  // O `ready` antes dos workers: o `app.jwt`, que assina o link do
  // lembrete, só existe depois que os plugins sobem — e um trabalho
  // atrasado roda assim que o worker é registrado. Os testes não veem
  // isso: o `inject` sobe o app antes.
  await app.ready();

  // A página "Confirmar ou cancelar" mora no endereço da barbearia: o
  // host próprio dela com URL_DAS_BARBEARIAS, ou o caminho no host do
  // painel sem. Um molde torto lança aqui e a API não sobe.
  const link = criarLinkDoLembrete(app, enderecoDasBarbearias(process.env));
  if (!link) {
    app.log.warn(
      "URL_DAS_BARBEARIAS e URL_DO_PAINEL ausentes: o lembrete sai sem o link de confirmar ou cancelar"
    );
  }

  // Os workers depois do start: `work` num pg-boss parado lança. No
  // buildApp rodaria antes, e os testes (fila de memória) não veriam.
  await registrarLembrete(app.fila, { canal: app.canal, log: app.log, link });

  for (const sinal of ["SIGINT", "SIGTERM"] as const) {
    process.once(sinal, () => {
      app.close().then(
        () => process.exit(0),
        (erro: unknown) => {
          app.log.error(erro, "erro ao encerrar");
          process.exit(1);
        }
      );
    });
  }

  await app.listen({ port: 3333, host: "0.0.0.0" });
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
