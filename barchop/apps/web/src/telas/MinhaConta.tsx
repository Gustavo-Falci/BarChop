"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoSerializado } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Chip } from "../componentes/Chip";
import { caminhoDoPasso } from "../fluxo/passos";
import { formatarDataComSemana, formatarDataLonga } from "../formato/datas";
import { prazoAcabou } from "../formato/prazos";
import { TOM_DO_STATUS, rotuloDoStatus } from "../formato/status";
import { IconeSeta } from "../painel/icones";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./MinhaConta.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";
import { AvisoDoPrazo } from "./AvisoDoPrazo";
import { MinhasAssinaturas } from "./MinhasAssinaturas";
import { Carregando } from "../componentes/Carregando";

// O que ainda vai acontecer, pelo status e não pelo relógio do aparelho:
// quem está com o relógio errado (C1) continua vendo o Cancelar, e a API
// recusa o que já passou com a mensagem dela.
const MARCADO = new Set(["pendente", "confirmado"]);

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "Corte e Barba com Rafael".
function oQueEComQuem(agendamento: AgendamentoSerializado): string {
  const nomes = agendamento.servicos.map((s) => s.nome);
  const servicos = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
  return `${servicos} com ${agendamento.barbeiro.nome}`;
}

const quando = (a: AgendamentoSerializado) => `${a.data} ${a.horaInicio}`;

// `agora` é prop com padrão, como na EscolhaDaData: os prazos dependem
// do relógio, e o teste fixa o instante sem fake timers.
//
// A direção A do redesenho (canvas "Minha conta — redesenho", 26/10): os
// horários marcados em destaque, o resto num histórico sem caixas, e o
// plano ao lado (embaixo dos marcados, no celular).
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

  const cabeca = (
    <div className={estilos.cabeca}>
      <div className={estilos.titulo}>
        <Link href={noHost(`/${slug}`)} className={estilos.voltar}>
          <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
          Voltar pra barbearia
        </Link>
        <h1>Minha conta</h1>
        <p className={estilos.apoio}>
          {perfil.dados ? `Seus horários e seu plano na ${perfil.dados.nome}.` : "Seus horários e seu plano."}
        </p>
      </div>
      <BotaoLink href={noHost(caminhoDoPasso(slug, "servicos", { servicoIds: [] }))}>Agendar horário</BotaoLink>
    </div>
  );

  if (carregando) return <main className={estilos.pagina}><Carregando /></main>;

  // Uma falha que não seja 401 não pode virar lista vazia: um
  // histórico vazio de verdade e uma requisição quebrada teriam a
  // mesma tela, e uma das duas é mentira. O caso de 401 fica de fora
  // porque a pessoa já está a caminho da tela de entrar, pelo efeito
  // acima.
  if (erro && erro.codigo !== "nao_autenticado") {
    return (
      <main className={estilos.pagina}>
        {cabeca}
        <Aviso>Não foi possível carregar seus agendamentos agora.</Aviso>
      </main>
    );
  }

  if (erro?.codigo === "nao_autenticado") return null;

  const todos = dados ?? [];
  const marcados = todos.filter((a) => MARCADO.has(a.status)).sort((a, b) => quando(a).localeCompare(quando(b)));
  const historico = todos.filter((a) => !MARCADO.has(a.status)).sort((a, b) => quando(b).localeCompare(quando(a)));

  return (
    <main className={estilos.pagina}>
      {cabeca}

      <div className={estilos.corpo}>
        <section className={estilos.marcados} aria-labelledby="horarios-marcados">
          <h2 id="horarios-marcados" className={estilos.rotulo}>
            Horários marcados
          </h2>
          {avisoDoCancelamento ? <Aviso>{avisoDoCancelamento}</Aviso> : null}
          {marcados.length === 0 ? <p className={estilos.apoio}>Nenhum horário marcado.</p> : null}
          {marcados.map((agendamento) => (
            <article key={agendamento.id} className={estilos.horario}>
              <div className={estilos.resumo}>
                <span className={estilos.dia}>
                  <span aria-hidden="true" className={estilos.mes}>
                    {MES_CURTO[Number(agendamento.data.slice(5, 7)) - 1]}
                  </span>
                  <span aria-hidden="true" className={estilos.numero}>
                    {Number(agendamento.data.slice(8, 10))}
                  </span>
                  <span aria-hidden="true" className={estilos.semana}>
                    {formatarDataComSemana(agendamento.data).split(",")[0]}
                  </span>
                  <span className={estilos.somenteLeitor}>{formatarDataLonga(agendamento.data)}</span>
                </span>
                <div className={estilos.detalhes}>
                  <div className={estilos.linha}>
                    <span className={estilos.hora}>{agendamento.horaInicio}</span>
                    <Chip tom={TOM_DO_STATUS[agendamento.status] ?? "neutro"} tamanho="pequeno">
                      {rotuloDoStatus(agendamento.status)}
                    </Chip>
                  </div>
                  <span>{oQueEComQuem(agendamento)}</span>
                  <span className={estilos.apoio}>até {agendamento.horaFim}</span>
                </div>
              </div>
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
            </article>
          ))}
        </section>

        {/* O plano: ao lado no desktop, embaixo dos marcados no celular. */}
        <div className={estilos.lado}>
          <MinhasAssinaturas />
        </div>

        {historico.length > 0 ? (
          <section className={estilos.historico} aria-labelledby="historico">
            <h2 id="historico" className={estilos.rotulo}>
              Histórico
            </h2>
            <ul className={estilos.linhas}>
              {historico.map((agendamento) => (
                <li key={agendamento.id} className={estilos.linhaDoHistorico}>
                  <span>{formatarDataLonga(agendamento.data)}</span>
                  <span className={estilos.horaDoHistorico}>{agendamento.horaInicio}</span>
                  <span className={estilos.oQue}>{oQueEComQuem(agendamento)}</span>
                  <Chip tom={TOM_DO_STATUS[agendamento.status] ?? "neutro"} tamanho="pequeno">
                    {rotuloDoStatus(agendamento.status)}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
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
          {podeRemarcar ? (
            <Botao variante="contorno" onClick={aoRemarcar}>
              Remarcar
            </Botao>
          ) : null}
          {podeCancelar ? (
            <Botao variante="fantasma" onClick={aoCancelar}>
              Cancelar
            </Botao>
          ) : null}
        </div>
      ) : null}
      {acaoVencida ? <AvisoDoPrazo acao={acaoVencida} whatsapp={whatsapp} telefone={telefone} /> : null}
    </>
  );
}
