import type { ProximosHorariosDoServico } from "@barchop/types";
import { agendaDoPeriodo, descartarPassados, PODE_ATENDER, type ClientePrisma } from "./disponibilidade";
import { dataParaDate, dateParaData } from "./horas";

type ProximosDoServico = ProximosHorariosDoServico;

const UM_DIA = 24 * 60 * 60 * 1000;

// Os próximos horários livres de cada serviço, pra página pública da
// barbearia. Todo horário mostrado tem que ser marcável: é a união do
// "qualquer um" — quem pode atender e faz o serviço —, com a mesma
// conta por profissional e dia que a escolha de horário e o POST usam,
// e o mesmo filtro de "já passou".
//
// É a rota pública mais pesada e a página mais aberta do produto: o
// período inteiro sai de uma consulta por tabela (`agendaDoPeriodo`), e
// cada serviço para assim que junta os seus.
export async function proximosHorarios(
  db: ClientePrisma,
  params: {
    barbeariaId: string;
    agora: { data: string; hora: string };
    // Até onde procurar. Duas semanas cobrem a barbearia que abre poucos
    // dias sem fazer a página carregar um mês de agenda.
    dias?: number;
    quantos?: number;
  }
): Promise<ProximosDoServico[]> {
  const { barbeariaId, agora, dias = 14, quantos = 3 } = params;

  const [servicos, membros] = await Promise.all([
    // A mesma lista e a mesma ordem da escolha de serviços pública.
    db.servico.findMany({
      where: { barbeariaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, duracaoMinutos: true },
    }),
    db.barbeiro.findMany({
      where: { barbeariaId, ...PODE_ATENDER },
      select: { id: true, servicos: { select: { servicoId: true } } },
    }),
  ]);

  const primeiroDia = dataParaDate(agora.data);
  const ultimoDia = new Date(primeiroDia.getTime() + (dias - 1) * UM_DIA);
  const horariosDoDia = await agendaDoPeriodo(db, {
    barbeariaId,
    barbeiroIds: membros.map((membro) => membro.id),
    primeiroDia,
    ultimoDia,
  });

  return servicos.map((servico) => {
    const candidatos = membros
      .filter((membro) => membro.servicos.some((s) => s.servicoId === servico.id))
      .map((membro) => membro.id);

    const horarios: ProximosDoServico["horarios"] = [];
    for (let i = 0; i < dias && horarios.length < quantos; i++) {
      const data = new Date(primeiroDia.getTime() + i * UM_DIA);
      const chave = dateParaData(data);
      const uniao = [
        ...new Set(candidatos.flatMap((id) => horariosDoDia(id, data, servico.duracaoMinutos))),
      ].sort();
      for (const horaInicio of descartarPassados({ data: chave, horarios: uniao, agora })) {
        horarios.push({ data: chave, horaInicio });
        if (horarios.length === quantos) break;
      }
    }
    return { servicoId: servico.id, horarios };
  });
}
