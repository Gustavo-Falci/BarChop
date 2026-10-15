import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { colors } from "@barchop/design-tokens";

// A prévia de quem cola barchop.com.br no WhatsApp, no Instagram ou no
// LinkedIn. Gerada no build (nada aqui lê a requisição), então a fonte
// só precisa existir na máquina que builda — o standalone leva o PNG
// pronto. TTF e não woff2: o gerador do Next não lê woff2. Os estáticos,
// não o variável, que ele também não desenha direito.
export const alt = "BarChop — agenda online para barbearias. Sua barbearia agenda sozinha.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PASTA_DAS_FONTES = join(
  process.cwd(),
  "../../font/ClashGrotesk_Complete/Fonts/WEB/fonts"
);

const cor = colors.light;

export default async function Imagem() {
  const [negrito, medio] = await Promise.all([
    readFile(join(PASTA_DAS_FONTES, "ClashGrotesk-Bold.ttf")),
    readFile(join(PASTA_DAS_FONTES, "ClashGrotesk-Medium.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: cor.paper,
          color: cor.ink,
          fontFamily: "Clash Grotesk",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: "10px 26px",
              background: cor.accent,
              border: `4px solid ${cor.ink}`,
              borderRadius: 18,
              boxShadow: `0 6px 0 ${cor.shadow}`,
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            BarChop
          </div>
          <div style={{ display: "flex", marginLeft: 28, fontSize: 32, fontWeight: 500, color: cor.inkSoft }}>
            Agenda online para barbearias
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 112,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            maxWidth: 980,
          }}
        >
          Sua barbearia agenda sozinha.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              padding: "14px 26px",
              background: cor.surface,
              border: `4px solid ${cor.ink}`,
              borderRadius: 999,
              fontSize: 34,
              fontWeight: 500,
            }}
          >
            suabarbearia.barchop.com.br
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: cor.inkSoft }}>
            14 dias grátis, sem cartão
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Clash Grotesk", data: negrito, weight: 700, style: "normal" },
        { name: "Clash Grotesk", data: medio, weight: 500, style: "normal" },
      ],
    }
  );
}
