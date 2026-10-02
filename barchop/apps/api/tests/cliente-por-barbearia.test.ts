import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";

async function criarBarbearia(slug: string) {
  return prisma.barbearia.create({ data: { nome: `Barbearia ${slug}`, slug } });
}

describe("cliente por barbearia", () => {
  it("aceita o mesmo telefone em barbearias diferentes", async () => {
    const uma = await criarBarbearia("uma");
    const outra = await criarBarbearia("outra");

    await prisma.cliente.create({
      data: { barbeariaId: uma.id, nome: "João", telefone: "11999998888" },
    });

    // Com o telefone único na plataforma inteira, este create falharia —
    // e o barbeiro da segunda barbearia não conseguiria cadastrar um
    // cliente que já é cliente de outra.
    const segundo = await prisma.cliente.create({
      data: { barbeariaId: outra.id, nome: "João", telefone: "11999998888" },
    });

    expect(segundo.barbeariaId).toBe(outra.id);
    expect(await prisma.cliente.count()).toBe(2);
  });

  it("recusa telefone repetido dentro da mesma barbearia", async () => {
    const barbearia = await criarBarbearia("unica");

    await prisma.cliente.create({
      data: {
        barbeariaId: barbearia.id,
        nome: "João",
        telefone: "11999998888",
      },
    });

    await expect(
      prisma.cliente.create({
        data: {
          barbeariaId: barbearia.id,
          nome: "João de novo",
          telefone: "11999998888",
        },
      })
      // `code` é propriedade própria do PrismaClientKnownRequestError —
      // o toMatchObject enxerga, e o teste fixa o código exato que o
      // tratador de erros traduz pra 409.
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("permite buscar cliente pelo par barbearia + telefone", async () => {
    const barbearia = await criarBarbearia("busca");
    await prisma.cliente.create({
      data: {
        barbeariaId: barbearia.id,
        nome: "João",
        telefone: "11999998888",
      },
    });

    // Esta é a forma que o upsert por telefone da fase 4 vai usar.
    const achado = await prisma.cliente.findUnique({
      where: {
        barbeariaId_telefone: {
          barbeariaId: barbearia.id,
          telefone: "11999998888",
        },
      },
    });

    expect(achado?.nome).toBe("João");
  });

  it("apaga os clientes junto com a barbearia", async () => {
    const barbearia = await criarBarbearia("cascata");
    await prisma.cliente.create({
      data: {
        barbeariaId: barbearia.id,
        nome: "João",
        telefone: "11999998888",
      },
    });

    await prisma.barbearia.delete({ where: { id: barbearia.id } });

    expect(await prisma.cliente.count()).toBe(0);
  });
});
