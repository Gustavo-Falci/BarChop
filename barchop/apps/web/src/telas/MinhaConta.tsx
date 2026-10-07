"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Cartao } from "../componentes/Cartao";
import { Chip } from "../componentes/Chip";
import { caminhoDoPasso } from "../fluxo/passos";
import { formatarDataLonga } from "../formato/datas";
import { prazoAcabou } from "../formato/prazos";
import { rotuloDoStatus } from "../formato/status";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./MinhaConta.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";
import { AvisoDoPrazo } from "./AvisoDoPrazo";

// `agora` é prop com padrão, como na EscolhaDaData: os prazos dependem
// do relógio, e o teste fixa o instante sem fake timers.
export function MinhaConta({ agora = new Date() }: { agora?: Date } = {}) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const noHost = useNoHost();
  const api = useApi();

  const temSessao = Boolean(sessaoDoCliente(slug).ler());
  const { dados, carregando, erro, recarregar } = useRequisicao(
    async () => (temSessao ? api.cliente.meusAgendamentos() : []),
    [slug, temSessao]
  );
  // Os prazos e o contato da barbearia (painel v2, 3g). Sem eles (ainda
  // carregando ou falhou), valem os padrões: os botões ficam, e a API
  // recusa o que estiver fora do prazo com a mensagem dela.
  const perfil = useRequisicao(() => api.publico.perfilDaBarbearia(slug), [slug]);
  // `agendamento_passado` é exatamente o erro que quem foi travado pelo
  // C1 vai encontrar: sem captura, a rejeição ficava sem tratamento e o
  // botão simplesmente não fazia nada.
  const [avisoDoCancelamento, setAvisoDoCancelamento] = useState<
    string | undefined
  >();

  async function cancelar(id: string) {
    setAvisoDoCancelamento(undefined);
    try {
      await api.cliente.cancelar(id);
      recarregar();
    } catch (causa) {
      const erroDaApi = causa as ErroDaApi;
      setAvisoDoCancelamento(
        erroDaApi.mensagem || "Não foi possível cancelar agora."
      );
    }
  }

  // Sem token, ou com token que a API recusou: o gancho da fundação já
  // limpou o armazenamento, e aqui só falta tirar a pessoa da tela.
  useEffect(() => {
    if (!temSessao || erro?.codigo === "nao_autenticado") {
      router.replace(noHost(`/${slug}/entrar`));
    }
  }, [temSessao, erro, router, slug, noHost]);

  if (!temSessao) return null;

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // Uma falha que não seja 401 não pode virar lista vazia: um
  // histórico vazio de verdade e uma requisição quebrada teriam a
  // mesma tela, e uma das duas é mentira. O caso de 401 fica de fora
  // porque a pessoa já está a caminho da tela de entrar, pelo efeito
  // acima.
  if (erro && erro.codigo !== "nao_autenticado") {
    return (
      <main className={estilos.pagina}>
        <h1>Meus agendamentos</h1>
        <Aviso>Não foi possível carregar seus agendamentos agora.</Aviso>
      </main>
    );
  }

  if (erro?.codigo === "nao_autenticado") return null;

  return (
    <main className={estilos.pagina}>
      <h1>Meus agendamentos</h1>

      {avisoDoCancelamento ? <Aviso>{avisoDoCancelamento}</Aviso> : null}

      {(dados ?? []).map((agendamento) => (
        <Cartao key={agendamento.id}>
          <div className={estilos.item}>
            <div className={estilos.linha}>
              <span>{formatarDataLonga(agendamento.data)}</span>
              <span>{agendamento.horaInicio}</span>
              <Chip tom={agendamento.status === "cancelado" ? "neutro" : "acento"}>
                {rotuloDoStatus(agendamento.status)}
              </Chip>
            </div>

            {agendamento.status === "pendente" ||
            agendamento.status === "confirmado" ? (
              <AcoesDoAgendamento
                podeCancelar={
                  !prazoAcabou(perfil.dados?.prazoCancelarHoras ?? 0, agendamento.data, agendamento.horaInicio, agora)
                }
                podeRemarcar={
                  !prazoAcabou(perfil.dados?.prazoRemarcarHoras ?? 0, agendamento.data, agendamento.horaInicio, agora)
                }
                whatsapp={perfil.dados?.whatsapp ?? null}
                telefone={perfil.dados?.telefone ?? null}
                aoCancelar={() => cancelar(agendamento.id)}
                aoRemarcar={() =>
                  router.push(
                    noHost(caminhoDoPasso(slug, "data", {
                      // Os mesmos serviços do agendamento: remarcar
                      // troca quando, não o quê.
                      servicoIds: agendamento.servicos.map((s) => s.servicoId),
                      remarcar: agendamento.id,
                      // A API remarca com o mesmo profissional; o dia
                      // tem que mostrar a agenda dele, não a de outro.
                      profissional: agendamento.barbeiro.id,
                    }))
                  )
                }
              />
            ) : null}
          </div>
        </Cartao>
      ))}
    </main>
  );
}

// Cancelar e remarcar de um agendamento ativo. Passado o prazo de um
// deles, o botão some e entra o aviso com o contato da casa; passados os
// dois, só o aviso.
function AcoesDoAgendamento({
  podeCancelar,
  podeRemarcar,
  whatsapp,
  telefone,
  aoCancelar,
  aoRemarcar,
}: {
  podeCancelar: boolean;
  podeRemarcar: boolean;
  whatsapp: string | null;
  telefone: string | null;
  aoCancelar: () => void;
  aoRemarcar: () => void;
}) {
  const acaoVencida =
    !podeCancelar && !podeRemarcar ? "alterar" : !podeCancelar ? "cancelar" : !podeRemarcar ? "remarcar" : null;
  return (
    <>
      {podeCancelar || podeRemarcar ? (
        <div className={estilos.acoes}>
          {podeCancelar ? (
            <Botao variante="contorno" onClick={aoCancelar}>
              Cancelar
            </Botao>
          ) : null}
          {podeRemarcar ? (
            <Botao variante="fantasma" onClick={aoRemarcar}>
              Remarcar
            </Botao>
          ) : null}
        </div>
      ) : null}
      {acaoVencida ? <AvisoDoPrazo acao={acaoVencida} whatsapp={whatsapp} telefone={telefone} /> : null}
    </>
  );
}
