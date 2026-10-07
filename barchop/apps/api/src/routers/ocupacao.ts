import { prisma } from "@barchop/database";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dataParaDate } from "../lib/horas";
import { ocupacaoDoDia } from "../lib/ocupacao";
import { PADRAO_DATA } from "../lib/padroes";
import { agendaVisivel } from "../plugins/auth";
import type { App } from "../tipos";

const filtroOcupacao = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: { type: "string", pattern: PADRAO_DATA },
  },
} as const;

// A ocupação do Hoje (painel v2, marco 4). Qualquer membro: dono e
// recepção veem a casa inteira; o profissional, só a dele — o mesmo
// recorte da lista de agendamentos (`agendaVisivel`). A data vem da
// tela, como na lista: a API não decide que dia é hoje.
export function registrarRotasOcupacao(app: App): void {
  app.get(
    "/barbearias/me/ocupacao",
    { schema: { querystring: filtroOcupacao } },
    async (request) => {
      const { data } = request.query;
      let dia: Date;
      try {
        dia = dataParaDate(data);
      } catch {
        throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
      }

      return ocupacaoDoDia(prisma, {
        barbeariaId: request.user.barbeariaId,
        data: dia,
        dataIso: data,
        somente: agendaVisivel(request).barbeiroId,
      });
    }
  );
}
