import { buildApp } from "./app";

// Entrypoint do bundle (ver tsup.config.ts). Toda a montagem da
// aplicação está no app.ts, que os testes usam sem abrir porta.
const app = buildApp({ logger: true });

app.listen({ port: 3333, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
