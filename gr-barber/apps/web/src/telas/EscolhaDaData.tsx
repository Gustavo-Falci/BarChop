"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Calendario } from "../componentes/Calendario";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { hojeIso, horaJaPassou } from "../formato/datas";
import estilos from "./EscolhaDaData.module.css";

// `agora` é prop com padrão, do mesmo jeito que o agoraNaBarbearia da
// API recebe o instante: é o que deixa o teste escolher o dia sem fake
// timers.
export function EscolhaDaData({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, remarcar, pronto } = usePassoDoFluxo("data", agora);
  const router = useRouter();
  const api = useApi();
  const [mes, setMes] = useState(() => hojeIso(agora).slice(0, 7));

  const { dados, carregando, erro } = useRequisicao(async () => {
    if (!pronto) return {};
    const perfil = await api.publico.perfilDaBarbearia(slug);
    // O barbeiroId sai do perfil, e não da URL: é a única rota pública
    // que o entrega, e a barbearia do MVP tem um barbeiro só.
    const barbeiroId = perfil.barbeiros[0].id;
    const dias = await api.publico.disponibilidadeDoMes(slug, {
      barbeiroId,
      mes,
      servicoIds,
    });

    // A rota do mês não sabe que horas são (de propósito — ver o
    // comentário dela), então "hoje" chega `true` mesmo depois do
    // último horário. Sem esta checagem o dia ficava tocável e o passo
    // seguinte abria em "nenhum horário": um beco sem saída. O filtro é
    // o mesmo `horaJaPassou` que a tela de horário aplica, pra as duas
    // telas nunca discordarem sobre o mesmo dia.
    //
    // Só uma chamada a mais, e só quando hoje está no mês mostrado e a
    // API diz que tem vaga — nos outros casos não há o que corrigir.
    const hoje = hojeIso(agora);
    if (dias[hoje]) {
      const horarios = await api.publico.disponibilidadeDoDia(slug, {
        barbeiroId,
        data: hoje,
        servicoIds,
      });
      if (horarios.every((hora) => horaJaPassou(hoje, hora, agora))) {
        return { ...dias, [hoje]: false };
      }
    }

    return dias;
  }, [slug, mes, servicoIds.join(","), pronto]);

  if (!pronto) return null;

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // Sem isso, uma falha de rede desenharia o mês inteiro como
  // indisponível — uma tela enganosa, indistinguível de uma agenda
  // lotada de verdade. Diferente da tela de perfil, aqui um 404 não é
  // o caso comum: o slug já passou pelas telas de perfil e serviços
  // antes de chegar aqui, então uma mensagem genérica cobre os dois
  // casos sem inventar uma distinção que o cliente não vai notar.
  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar a agenda</h1>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Escolha a data</h1>
      <Calendario
        mes={mes}
        dias={dados ?? {}}
        agora={agora}
        aoTrocarMes={setMes}
        aoEscolher={(data) =>
          router.push(
            caminhoDoPasso(slug, "horario", { servicoIds, data, remarcar })
          )
        }
      />
    </main>
  );
}
