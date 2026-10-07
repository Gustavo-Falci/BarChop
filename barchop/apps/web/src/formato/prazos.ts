import { prazoDoClientePassou, type Agora } from "@barchop/formato";
import { hojeIso } from "./datas";

// Os prazos da barbearia pra o cliente remarcar e cancelar pelo link
// (painel v2, marco 3). A conta é a mesma da API (@barchop/formato); o
// relógio é o do aparelho, a mesma limitação do `hojeIso`.

export function agoraDoAparelho(instante: Date = new Date()): Agora {
  const hora = `${String(instante.getHours()).padStart(2, "0")}:${String(instante.getMinutes()).padStart(2, "0")}`;
  return { data: hojeIso(instante), hora };
}

// Prazo 0 é "até o horário começar": a tela não esconde nada, como antes
// das regras — o que já passou a API recusa com a mensagem dela. Com
// prazo, o botão some quando falta menos que ele.
export function prazoAcabou(prazoHoras: number, data: string, hora: string, instante: Date = new Date()): boolean {
  return prazoHoras > 0 && prazoDoClientePassou(prazoHoras, agoraDoAparelho(instante), data, hora);
}
