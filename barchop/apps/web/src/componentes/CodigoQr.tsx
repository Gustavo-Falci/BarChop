"use client";

import { useEffect, useState } from "react";

// O QR é gerado no navegador, sem API. A biblioteca só carrega quando
// um QR aparece na tela: o resto do painel não paga por ela.
//
// Correção "M" e margem de 4 módulos: o padrão que as câmeras leem bem
// impresso num cartaz ou na tela de outro celular.
export const OPCOES_DO_QR = { errorCorrectionLevel: "M", margin: 4 } as const;

type Qrcode = typeof import("qrcode");

// O pacote é CommonJS: conforme o empacotador, as funções chegam no
// próprio módulo ou no `default`.
export async function carregarQrcode(): Promise<Qrcode> {
  const modulo = (await import("qrcode")) as Qrcode & { default?: Qrcode };
  return modulo.default ?? modulo;
}

export function CodigoQr({ texto, rotulo, className }: { texto: string; rotulo: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void carregarQrcode()
      .then((qrcode) => qrcode.toString(texto, { type: "svg", ...OPCOES_DO_QR }))
      .then((gerado) => {
        if (vivo) setSvg(gerado);
      });
    return () => {
      vivo = false;
    };
  }, [texto]);

  // O SVG sai da biblioteca a partir do link da própria barbearia: só
  // caminhos, nenhum texto de usuário vira marcação.
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={className}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
