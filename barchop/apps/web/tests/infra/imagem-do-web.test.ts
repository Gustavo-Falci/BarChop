import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// O standalone do Next não leva o public/ nem o .next/static: a imagem
// copia os dois. Sem o public/, a cadeira da home (imagem e 3D) dava 404
// em produção, com o HTML já apontando pra ela.
describe("imagem do web", () => {
  const dockerfile = () =>
    readFileSync(join(__dirname, "../../../../infra/web.Dockerfile"), "utf8").replace(/\r\n/g, "\n");

  it("copia o .next/static pro lado do server.js", () => {
    expect(dockerfile()).toMatch(
      /COPY --from=build [^\n]*\/app\/apps\/web\/\.next\/static \.\/apps\/web\/\.next\/static/
    );
  });

  it("copia o public/ pro lado do server.js", () => {
    expect(dockerfile()).toMatch(/COPY --from=build [^\n]*\/app\/apps\/web\/public \.\/apps\/web\/public/);
  });
});
