"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErroDaApi } from "@gr-barber/api-client";
import type { AgendamentoSerializado } from "@gr-barber/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { formatarPreco } from "../componentes/ItemDeServico";
import { caminhoDoPasso } from "../fluxo/passos";
import { lerDadosDoCliente, limparDadosDoCliente } from "../fluxo/dadosDoCliente";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import { ehPassado, formatarDataLonga, horaJaPassou } from "../formato/datas";
import estilos from "./Confirmacao.module.css";

// `agora` fica opcional e sem valor padrão fixado aqui, ao contrário
// das outras telas do fluxo: o padrão precisa nascer dentro de
// `confirmar`, no instante do clique, não no instante do render. Esta
// é a tela em que a pessoa pode ficar parada minutos com a página
// aberta antes de decidir — um padrão resolvido no render (como
// `agora = new Date()` na assinatura) ficaria congelado desde a
// montagem e não pegaria esse intervalo.
export function Confirmacao({ agora }: { agora?: Date } = {}) {
  const { slug, servicoIds, data, hora, remarcar, pronto } = usePassoDoFluxo(
    "confirmar",
    agora ?? new Date()
  );
  const router = useRouter();
  const api = useApi();

  const [criado, setCriado] = useState<AgendamentoSerializado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  const dadosDoCliente = lerDadosDoCliente();
  // Remarcar não passa pelo passo de dados: o cliente vem do token.
  const faltamDados = !remarcar && !dadosDoCliente;

  useEffect(() => {
    if (!pronto || !faltamDados || criado) return;
    // Aba reaberta, sessionStorage limpo por outra aba, formato antigo:
    // volta um passo em vez de tentar agendar sem cliente.
    router.replace(caminhoDoPasso(slug, "dados", { servicoIds, data, hora, remarcar }));
    // Mesmo motivo do array de dependências em usePassoDoFluxo:
    // `servicoIds` é um array novo a cada leitura da query, então
    // depender dele repetiria o `replace` a cada render em vez de uma
    // vez só. `join(",")` é o primitivo que representa a mesma escolha.
  }, [pronto, faltamDados, criado, router, slug, servicoIds.join(","), data, hora, remarcar]);

  const { dados: servicos, carregando, erro } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );

  if (!pronto || !data || !hora) return null;

  // O estreitamento de `data`/`hora` acima não atravessa fronteira de
  // função: dentro das funções aninhadas abaixo, `data`/`hora` capturadas
  // do escopo continuariam com o tipo opcional. Constantes novas, cujo
  // tipo é fixado na própria declaração, resolvem sem asserção.
  const diaConfirmado = data;
  const horaConfirmada = hora;

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar os serviços</h1>
      </main>
    );
  }

  const escolhidos = (servicos ?? []).filter((s) => servicoIds.includes(s.id));
  // Centavo somado como float é o defeito que o preço em string existe
  // pra evitar: soma em centavos inteiros e só converte na borda.
  const totalEmCentavos = escolhidos.reduce(
    (soma, s) => soma + Math.round(Number(s.preco) * 100),
    0
  );

  // Isolado do `confirmar` pra não precisar de asserção não-nula: o
  // `if` abaixo é a checagem de verdade que estreita o tipo, e o botão
  // que chama esta função nem existe quando `faltamDados` é verdadeiro
  // (ver render abaixo) — então na prática nunca dispara com null.
  async function criarNovoAgendamento(): Promise<AgendamentoSerializado> {
    if (!dadosDoCliente) {
      throw new Error("dados do cliente ausentes ao confirmar");
    }
    return api.publico.agendar(slug, {
      barbeiroId: (await api.publico.perfilDaBarbearia(slug)).barbeiros[0].id,
      servicoIds,
      data: diaConfirmado,
      horaInicio: horaConfirmada,
      cliente: dadosDoCliente,
    });
  }

  async function confirmar() {
    // Recalculado aqui, e não lido do `agora` capturado no render: a
    // pessoa pode ter chegado nesta tela minutos atrás e só decidido
    // confirmar agora — sem isso, um horário que passou enquanto a
    // tela ficava aberta viraria um agendamento inalterável sem
    // precisar de URL nenhuma velha, só de uma decisão lenta.
    const instanteDoEnvio = agora ?? new Date();
    if (
      ehPassado(diaConfirmado, instanteDoEnvio) ||
      horaJaPassou(diaConfirmado, horaConfirmada, instanteDoEnvio)
    ) {
      router.push(
        caminhoDoPasso(slug, "data", {
          servicoIds,
          data,
          remarcar,
          aviso: "horario_expirou",
        })
      );
      return;
    }

    setEnviando(true);
    setAviso(undefined);

    try {
      const agendamento = remarcar
        ? await api.cliente.remarcar(remarcar, {
            data: diaConfirmado,
            horaInicio: horaConfirmada,
            servicoIds,
          })
        : await criarNovoAgendamento();

      // Só no caminho de criação: quem remarca já tinha um rascunho de
      // OUTRO agendamento em andamento, e apagar aqui destruiria nome e
      // telefone de algo que essa confirmação não tem nada a ver.
      if (!remarcar) limparDadosDoCliente();
      setCriado(agendamento);
    } catch (causa) {
      const erro = causa as ErroDaApi;

      // O único erro que uma tela correta ainda encontra: a corrida que
      // a trava do banco pega depois de a disponibilidade ter dito que
      // cabia. Reenviar daria o mesmo 409 — o certo é ver a lista nova.
      // O aviso vai na URL, não em `setAviso`: a tela de horário monta
      // do zero, e o estado local desta tela morre com ela.
      if (erro.codigo === "horario_ocupado") {
        router.push(
          caminhoDoPasso(slug, "data", {
            servicoIds,
            data,
            remarcar,
            aviso: "horario_ocupado",
          })
        );
        return;
      }

      setAviso(
        erro.mensagem || "Não foi possível confirmar. Tente de novo em instantes."
      );
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    return (
      <main className={estilos.pagina}>
        <h1>Agendamento confirmado</h1>
        <div className={estilos.linha}>
          <span>Quando</span>
          <b>
            {criado.horaInicio} · {formatarDataLonga(criado.data)}
          </b>
        </div>
        <Botao variante="contorno" onClick={() => router.push(`/${slug}`)}>
          Voltar ao início
        </Botao>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Confirmar</h1>

      <div className={estilos.linha}>
        <span>Serviços</span>
        <b>{escolhidos.map((s) => s.nome).join(", ")}</b>
      </div>
      <div className={estilos.linha}>
        <span>Quando</span>
        <b>
          <span>{hora}</span> · <span>{formatarDataLonga(data)}</span>
        </b>
      </div>
      <div className={estilos.linha}>
        <span>Total</span>
        <b>{formatarPreco((totalEmCentavos / 100).toFixed(2))}</b>
      </div>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {faltamDados ? null : (
        <Botao carregando={enviando} onClick={confirmar}>
          Confirmar agendamento
        </Botao>
      )}
    </main>
  );
}
