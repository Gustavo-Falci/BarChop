import { textoDoLlms } from "../../src/site/llms";

// O texto mora em src/site/llms.ts, puro e testado. O charset vai
// explícito: sem ele, o acento sai torto em quem lê.
export function GET() {
  return new Response(textoDoLlms(process.env.NEXT_PUBLIC_URL_DO_SITE), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
