"use client";

import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { ListaDeHorarios } from "../componentes/ListaDeHorarios";
import { Resumo } from "../componentes/Resumo";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { formatarDataLonga, horaJaPassou } from "../formato/datas";
import estilos from "./EscolhaDoHorario.module.css";

// `agora` é prop com padrão, igual ao da tela de data: o instante entra
// por parâmetro em vez de vir de um relógio congelado.
export function EscolhaDoHorario({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, data, remarcar, aviso, pronto } =
    usePassoDoFluxo("horario", agora);
  const router = useRouter();
  const api = useApi();

  const { dados, carregando, erro } = useRequisicao(async () => {
    if (!pronto || !data) return [];
    const perfil = await api.publico.perfilDaBarbearia(slug);
    return api.publico.disponibilidadeDoDia(slug, {
      barbeiroId: perfil.barbeiros[0].id,
      data,
      servicoIds,
    });
  }, [slug, data, servicoIds.join(","), pronto]);

  if (!pronto || !data) return null;

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // Sem isso, uma falha de rede desenharia a mesma tela de "nenhum
  // horário disponível" de uma agenda lotada de verdade — o cliente não
  // teria como distinguir as duas, e tentaria de novo achando que é a
  // agenda.
  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar os horários</h1>
      </main>
    );
  }

  // A API devolve os horários da janela de funcionamento sem saber que
  // horas são: às 14h ela ainda oferece 09:00. Filtrar aqui é o que
  // impede um agendamento que nasce inalterável.
  const horarios = (dados ?? []).filter(
    (hora) => !horaJaPassou(data, hora, agora)
  );

  return (
    <main className={estilos.pagina}>
      <h1>Escolha o horário</h1>
      <Resumo itens={[formatarDataLonga(data)]} />

      {/* Recado que veio pela URL da tela anterior: ela montou do
          zero, e o estado local de lá não atravessa a navegação. */}
      {aviso === "horario_ocupado" ? (
        <Aviso>Esse horário acabou de ser ocupado. Escolha outro.</Aviso>
      ) : null}
      {aviso === "horario_expirou" ? (
        <Aviso>Esse horário já passou. Escolha outro.</Aviso>
      ) : null}

      {horarios.length === 0 ? (
        // O calendário já esconde o "hoje" sem sobra, mas este estado
        // ainda aparece: link antigo, ou a última vaga ocupada entre um
        // passo e outro. O botão é o que impede de virar beco — antes o
        // único caminho era o voltar do navegador.
        <>
          <p>Nenhum horário disponível nesse dia.</p>
          <Botao
            variante="contorno"
            onClick={() =>
              router.push(caminhoDoPasso(slug, "data", { servicoIds, remarcar }))
            }
          >
            Escolher outra data
          </Botao>
        </>
      ) : (
        <ListaDeHorarios
          horarios={horarios}
          aoEscolher={(hora) =>
            router.push(
              caminhoDoPasso(
                slug,
                // Quem remarca já está autenticado e a API tira o
                // cliente do token — o passo de dados não tem o que
                // perguntar.
                remarcar ? "confirmar" : "dados",
                { servicoIds, data, hora, remarcar }
              )
            )
          }
        />
      )}
    </main>
  );
}
