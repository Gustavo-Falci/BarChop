import { useEffect, useState } from "react";

const UM_MINUTO = 60_000;

function ateOProximoMinuto(agora: Date): number {
  return UM_MINUTO - (agora.getSeconds() * 1000 + agora.getMilliseconds());
}

// O instante atual, renovado na virada de cada minuto. Uma tela que
// desenha "agora" com `new Date()` no render congela no instante em que
// montou: com a aba aberta, a régua da agenda fica parada, faixas que já
// passaram continuam oferecidas, e depois da meia-noite "hoje" ainda é
// ontem.
//
// O alarme mira a virada do minuto, e não um intervalo fixo de 60s a
// partir da montagem: senão a régua andaria até 59s atrasada do relógio
// que o barbeiro tem no pulso.
//
// `fixo`, quando vem, vence o relógio e nada agenda — é o que os testes
// passam para não depender da hora em que rodam.
export function useAgora(fixo?: Date): Date {
  const [agora, setAgora] = useState(() => fixo ?? new Date());
  const ehFixo = fixo !== undefined;

  useEffect(() => {
    if (ehFixo) return;

    let alarme: ReturnType<typeof setTimeout>;
    const tocar = () => {
      const atual = new Date();
      setAgora(atual);
      alarme = setTimeout(tocar, ateOProximoMinuto(atual));
    };

    alarme = setTimeout(tocar, ateOProximoMinuto(new Date()));
    return () => clearTimeout(alarme);
  }, [ehFixo]);

  return fixo ?? agora;
}
