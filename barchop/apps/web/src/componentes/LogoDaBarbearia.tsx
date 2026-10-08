import type { FormatoDaLogo } from "@barchop/types";
import estilos from "./LogoDaBarbearia.module.css";

// A logo da barbearia na moldura do formato dela: círculo, quadrado de
// cantos arredondados, ou sem moldura nenhuma (a imagem inteira, como o
// dono desenhou). Um componente só pros três lugares onde ela aparece —
// a página pública, o topo do fluxo e a marca do painel — e pra prévia
// da aba Marca, pra o dono ver exatamente o que o cliente vai ver.
//
// `decorativa` quando o nome da barbearia já está escrito ao lado: o
// leitor de tela leria o nome duas vezes.
export function LogoDaBarbearia({
  url,
  formato,
  nome,
  tamanho = "m",
  decorativa = false,
  className,
}: {
  url: string;
  formato: FormatoDaLogo;
  nome: string;
  tamanho?: "p" | "m" | "g";
  decorativa?: boolean;
  className?: string;
}) {
  return (
    <span
      className={[estilos.moldura, estilos[formato], estilos[tamanho], className ?? ""].join(" ")}
      data-formato={formato}
    >
      {/* <img> simples: vem do bucket, e o otimizador do Next exigiria
          liberar o domínio dele. */}
      <img className={estilos.imagem} src={url} alt={decorativa ? "" : `Logo da ${nome}`} />
    </span>
  );
}
