// Os direitos do titular e o encerramento de barbearia (auditoria de
// segurança de 15/11, SEC-009). Não há rota pra isto, de propósito: quem
// atende o pedido é o responsável pela plataforma, depois de conferir a
// identidade de quem pede. Cada comando deixa uma linha na trilha de
// auditoria.
//
// Uso (de barchop/, em desenvolvimento):
//   pnpm --filter @barchop/api titular exportar <link-da-barbearia> <telefone-ou-e-mail>
//   pnpm --filter @barchop/api titular apagar   <link-da-barbearia> <telefone-ou-e-mail> --confirmar
//   pnpm --filter @barchop/api titular encerrar-barbearia <link> --confirmar <link>
//
// Em produção vai no bundle (tsup.config.ts) e roda dentro do contêiner
// da API: `node dist/titular.js ...` (ver infra/README.md).
//
// `exportar` escreve o JSON na saída padrão: redirecione pra um arquivo
// e entregue ao titular por um canal seguro. O arquivo tem dado pessoal
// — apague depois de entregar.
//
// `apagar` e `encerrar-barbearia` não têm volta: só rodam com
// `--confirmar`. O encerramento pede o link de novo, pra um erro de
// digitação não apagar a barbearia errada.
import { prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { armazenamentoDoAmbiente } from "../src/lib/armazenamento";
import { normalizarTelefoneObrigatorio } from "../src/lib/telefone";
import { anonimizarCliente, encerrarBarbearia, exportarCliente } from "../src/lib/titular";

const USO =
  "uso:\n" +
  "  titular exportar <link-da-barbearia> <telefone-ou-e-mail>\n" +
  "  titular apagar <link-da-barbearia> <telefone-ou-e-mail> --confirmar\n" +
  "  titular encerrar-barbearia <link-da-barbearia> --confirmar <link-da-barbearia>";

async function acharCliente(slug: string, contato: string): Promise<string> {
  const barbearia = await prisma.barbearia.findUnique({ where: { slug }, select: { id: true } });
  if (!barbearia) throw new Error(`a barbearia "${slug}" não existe`);

  const cliente = contato.includes("@")
    ? await prisma.cliente.findUnique({
        where: { barbeariaId_email: { barbeariaId: barbearia.id, email: normalizarEmail(contato)! } },
        select: { id: true },
      })
    : await prisma.cliente.findUnique({
        where: {
          barbeariaId_telefone: { barbeariaId: barbearia.id, telefone: normalizarTelefoneObrigatorio(contato) },
        },
        select: { id: true },
      });
  if (!cliente) throw new Error("não há cliente com esse contato nessa barbearia");
  return cliente.id;
}

async function main() {
  const [comando, slug, ...resto] = process.argv.slice(2);
  if (!comando || !slug) throw new Error(USO);

  if (comando === "exportar") {
    const [contato] = resto;
    if (!contato) throw new Error(USO);
    const dados = await exportarCliente(await acharCliente(slug, contato));
    console.log(JSON.stringify(dados, null, 2));
    return;
  }

  if (comando === "apagar") {
    const [contato, confirmar] = resto;
    if (!contato) throw new Error(USO);
    if (confirmar !== "--confirmar") {
      throw new Error("apagar não tem volta: repita o comando com --confirmar no fim");
    }
    await anonimizarCliente(await acharCliente(slug, contato));
    // Pro erro, não pra saída: a saída padrão pode estar indo pra um arquivo.
    console.error("cadastro esvaziado: nome, telefone, e-mail, CPF e senha saíram; os horários ficaram, de ninguém");
    return;
  }

  if (comando === "encerrar-barbearia") {
    const [confirmar, deNovo] = resto;
    if (confirmar !== "--confirmar" || deNovo !== slug) {
      throw new Error(`encerrar não tem volta: repita o comando com --confirmar ${slug} no fim`);
    }
    const resumo = await encerrarBarbearia(slug, { armazenamento: armazenamentoDoAmbiente() });
    console.error(
      `barbearia "${resumo.slug}" encerrada: ${resumo.membros} membro(s), ${resumo.clientes} cliente(s), ` +
        `${resumo.agendamentos} agendamento(s) e ${resumo.imagens} imagem(ns) apagados`
    );
    return;
  }

  throw new Error(USO);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
