import { redirect } from "next/navigation";

// Dia e horário viraram uma tela só, em /agendar/data. Esta rota fica
// só pra não quebrar o que já apontava pra cá: abas abertas antes da
// mudança e links guardados. A query vai inteira — `data`, `aviso` e
// `remarcar` são entendidos lá do mesmo jeito.
export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;

  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    if (typeof valor === "string") query.set(chave, valor);
  }
  const texto = query.toString();

  // encodeURIComponent, e não o slug cru: se o segmento algum dia
  // chegasse decodificado, `/%2F%2Foutro-site/agendar/horario` viraria
  // "//outro-site" — endereço absoluto pro navegador, redirecionamento
  // aberto num link que circula por WhatsApp. Medido no Next 16.3 em
  // dev: ele entrega o `%2F` ainda codificado, e o redirect sai como
  // `/%252F%252Foutro-site/...`, na mesma origem. A codificação garante
  // isso sem depender de qual das duas formas o Next escolher.
  redirect(
    `/${encodeURIComponent(slug)}/agendar/data${texto ? `?${texto}` : ""}`
  );
}
