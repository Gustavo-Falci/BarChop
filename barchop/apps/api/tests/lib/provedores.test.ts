import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { cifrar } from "../../src/lib/cifra";
import {
  ErroDoProvedor,
  modoDosPagamentosOnline,
  provedoresDeMemoria,
  provedoresDoAmbiente,
} from "../../src/lib/provedores";

// A fábrica dos conectores (Onda 2, marco 3, PR 8 do plano
// planos-de-assinatura): cada vendedor tem a própria chave, então a
// instância guarda a fábrica, e não um conector.

describe("modoDosPagamentosOnline", () => {
  it("sem a variável: real em produção, teste fora", () => {
    expect(modoDosPagamentosOnline({ NODE_ENV: "production" })).toBe("real");
    expect(modoDosPagamentosOnline({ NODE_ENV: "development" })).toBe("teste");
    expect(modoDosPagamentosOnline({})).toBe("teste");
  });

  it("a variável escolhe, mesmo em produção (o teste ponta a ponta na VM)", () => {
    expect(modoDosPagamentosOnline({ NODE_ENV: "production", PAGAMENTOS_ONLINE_MODO: "teste" })).toBe("teste");
    expect(modoDosPagamentosOnline({ PAGAMENTOS_ONLINE_MODO: "real" })).toBe("real");
    expect(() => modoDosPagamentosOnline({ PAGAMENTOS_ONLINE_MODO: "sandbox" })).toThrow(/PAGAMENTOS_ONLINE_MODO/);
  });
});

describe("provedoresDoAmbiente", () => {
  const corpoVazio = () =>
    new Response(JSON.stringify({ object: "list", data: [] }), { headers: { "content-type": "application/json" } });

  it("da chave colada: o modo vem do prefixo; chave de outro formato é inválida", async () => {
    const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(corpoVazio());
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "development" }, { fetch: fetchFalso });

    expect(fabrica.modoDaChave("asaas", "$aact_prod_x")).toBe("real");
    expect(fabrica.modoDaChave("asaas", "qualquer")).toBeNull();
    const provedor = fabrica.daChave({ provedor: "asaas", chave: "$aact_hmlg_x" });
    expect(provedor.modo).toBe("teste");
    await provedor.conferirChave();
    expect(String(fetchFalso.mock.calls[0][0])).toMatch(/^https:\/\/api-sandbox\.asaas\.com\//);

    expect(() => fabrica.daChave({ provedor: "asaas", chave: "sk_live_x" })).toThrow(ErroDoProvedor);
  });

  it("da conexão gravada: decifra a chave com a CHAVE_DE_CIFRA na hora", async () => {
    const chaveDeCifra = randomBytes(32);
    const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(corpoVazio());
    const fabrica = provedoresDoAmbiente(
      { NODE_ENV: "development", CHAVE_DE_CIFRA: chaveDeCifra.toString("base64") },
      { fetch: fetchFalso }
    );

    const provedor = fabrica.daConexao({
      provedor: "asaas",
      modo: "real",
      chaveCifrada: cifrar("$aact_prod_gravada", chaveDeCifra),
    });
    await provedor.conferirChave();

    expect(provedor.modo).toBe("real");
    expect(new Headers(fetchFalso.mock.calls[0][1]?.headers).get("access_token")).toBe("$aact_prod_gravada");
  });

  it("sem a CHAVE_DE_CIFRA, só a conexão gravada falha, e na hora de usar", () => {
    const fabrica = provedoresDoAmbiente({ NODE_ENV: "production" });

    expect(() =>
      fabrica.daConexao({ provedor: "asaas", modo: "real", chaveCifrada: Buffer.alloc(40) })
    ).toThrow(/CHAVE_DE_CIFRA/);
    expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_x" }).modo).toBe("real");
  });

  it("nos testes, o padrão é o de memória", () => {
    expect(provedoresDoAmbiente({ NODE_ENV: "test" }).nome).toBe("memoria");
  });
});

describe("provedoresDeMemoria", () => {
  it("guarda o que foi pedido e responde como o Asaas responderia", async () => {
    const fabrica = provedoresDeMemoria();
    const provedor = fabrica.daChave({ provedor: "asaas", chave: "$aact_hmlg_memoria" });

    await provedor.conferirChave();
    const webhook = await provedor.registrarWebhook({ url: "https://x/webhooks/asaas/c1", token: "t", email: null });
    const cliente = await provedor.criarCliente({
      nome: "Ana",
      cpfCnpj: "52998224725",
      email: null,
      telefone: null,
      referencia: "c1",
    });
    const assinatura = await provedor.criarAssinatura({
      clienteId: cliente,
      valorCentavos: 12000,
      ciclo: "mensal",
      primeiroVencimento: "2026-10-24",
      descricao: "Corte ilimitado",
      referencia: "as1",
      urlDeVolta: null,
    });

    expect(fabrica.webhooks).toEqual([{ id: webhook, url: "https://x/webhooks/asaas/c1", token: "t", email: null }]);
    expect(fabrica.clientes[0]).toMatchObject({ id: cliente, cpfCnpj: "52998224725" });
    expect(assinatura.linkDaFatura).toMatch(/^https:\/\//);
    expect(await provedor.lerAssinatura(assinatura.id)).toMatchObject({ situacao: "ativa", removida: false });

    await provedor.cancelarAssinatura(assinatura.id);
    await provedor.apagarWebhook(webhook);
    expect(await provedor.lerAssinatura(assinatura.id)).toMatchObject({ removida: true });
    expect(fabrica.cancelamentos).toEqual([assinatura.id]);
    expect(fabrica.webhooks).toEqual([]);
  });

  it("a chave marcada como inválida falha no conferir; cobrança desconhecida é não encontrada", async () => {
    const fabrica = provedoresDeMemoria();
    fabrica.chavesInvalidas.add("$aact_prod_revogada");

    await expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_revogada" }).conferirChave()).rejects.toMatchObject({
      codigo: "chave_invalida",
    });
    await expect(fabrica.daChave({ provedor: "asaas", chave: "$aact_prod_ok" }).lerCobranca("pay_x")).rejects.toMatchObject({
      codigo: "nao_encontrado",
    });
  });
});
