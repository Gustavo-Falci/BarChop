import { vendedor } from "../../../src/site/controlador";

// A quem avisar de uma falha de segurança (RFC 9116; auditoria de 15/11,
// SEC-022). O contato é o mesmo da página de privacidade, e vem do
// ambiente: o repositório é público e não guarda o e-mail.

// Lido a cada pedido: a validade anda com o relógio.
export const dynamic = "force-dynamic";

// A RFC pede um vencimento, e recomenda menos de um ano: o arquivo
// velho demais deixa de ser confiável. Seis meses a contar de agora — a
// cada deploy (e a cada pedido) ele se renova sozinho.
const VALIDADE_EM_DIAS = 180;

export function GET(): Response {
  const { email } = vendedor();
  if (!email) return new Response("Not found\n", { status: 404 });

  const vence = new Date(Date.now() + VALIDADE_EM_DIAS * 24 * 60 * 60 * 1000);
  const site = process.env.NEXT_PUBLIC_URL_DO_SITE;
  const linhas = [
    `Contact: mailto:${email}`,
    `Expires: ${vence.toISOString()}`,
    "Preferred-Languages: pt-BR, en",
    ...(site ? [`Canonical: ${new URL("/.well-known/security.txt", site).toString()}`] : []),
  ];

  return new Response(`${linhas.join("\n")}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
