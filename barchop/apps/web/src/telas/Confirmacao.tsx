"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoSerializado } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { formatarPreco } from "../componentes/ItemDeServico";
import { caminhoDoLogin, caminhoDoPasso } from "../fluxo/passos";
import {
  gravarDadosDoCliente,
  lerDadosDoCliente,
  limparDadosDoCliente,
  type DadosDoCliente,
} from "../fluxo/dadosDoCliente";
import { gerarIcs } from "../fluxo/ics";
import { useContaDoCliente, validarDados } from "../fluxo/identificacao";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import {
  ehPassado,
  formatarDataComSemana,
  formatarDataLonga,
  horaJaPassou,
} from "../formato/datas";
import estilos from "./Confirmacao.module.css";

// O último passo, e também onde a pessoa diz quem é. Eram duas telas —
// "Quem é você?" com dois botões, depois o resumo — e a pergunta
// custava um toque só pra escolher o caminho. Aqui a identificação fica
// no mesmo lugar do botão que a usa, e continua vindo DEPOIS do
// horário: pedir dados antes de a pessoa ver se há horário bom é o que
// faz desistir.
//
// Três estados de identidade, os mesmos de antes:
// - logada: cartão com nome e telefone, sem formulário;
// - sem conta: formulário, com "Já tem conta? Entrar" ao lado;
// - sessão que a API recusa: formulário, nunca o cartão pela metade.
// No remarcar não há nenhum dos três: o cliente vem do token.
//
// `agora` fica opcional e sem valor padrão fixado aqui, ao contrário
// das outras telas do fluxo: o padrão precisa nascer dentro de
// `confirmar`, no instante do clique, não no instante do render. Esta
// é a tela em que a pessoa pode ficar parada minutos com a página
// aberta antes de decidir — um padrão resolvido no render ficaria
// congelado desde a montagem e não pegaria esse intervalo.
export function Confirmacao({ agora }: { agora?: Date } = {}) {
  const { slug, servicoIds, data, hora, remarcar, pronto } = usePassoDoFluxo(
    "confirmar",
    agora ?? new Date()
  );
  const router = useRouter();
  const api = useApi();
  const { conta, esquecer } = useContaDoCliente(slug);

  const [criado, setCriado] = useState<AgendamentoSerializado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  // O rascunho do sessionStorage preenche o formulário: sobrevive a
  // recarregar a página e a uma confirmação que falhou.
  const [nome, setNome] = useState(() => lerDadosDoCliente()?.nome ?? "");
  const [telefone, setTelefone] = useState(
    () => lerDadosDoCliente()?.telefone ?? ""
  );
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();

  const { dados: servicos, carregando, erro } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );
  // Do perfil saem o barbeiroId do envio e o endereço da tela de
  // sucesso. Falhar aqui não bloqueia nada: o envio busca de novo, e o
  // sucesso só deixa de mostrar o endereço.
  const perfil = useRequisicao(() => api.publico.perfilDaBarbearia(slug), [slug]);

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

  // Quem vai ser atendido, ou `null` se o formulário não passou (os
  // erros já ficam nos campos). Logada, é o cadastro — o telefone de lá
  // já vem no formato que a API guarda.
  function identificar(): DadosDoCliente | null {
    if (conta) return { nome: conta.nome, telefone: conta.telefone };

    const validacao = validarDados(nome, telefone);
    setErroNome(validacao.ok ? undefined : validacao.erros.nome);
    setErroTelefone(validacao.ok ? undefined : validacao.erros.telefone);
    if (!validacao.ok) return null;

    // Guardado antes de enviar: se a API falhar, o que foi digitado
    // continua aí na próxima tentativa, mesmo recarregando a página.
    gravarDadosDoCliente(validacao.dados);
    return validacao.dados;
  }

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    // Enter repetido ou toque duplo: o `disabled` do botão não segura o
    // Enter, que dispara o submit do form direto.
    if (enviando || (!remarcar && conta === null)) return;

    const cliente = remarcar ? null : identificar();
    if (!remarcar && !cliente) return;

    // Recalculado aqui, e não lido do `agora` capturado no render: a
    // pessoa pode ter chegado nesta tela minutos atrás e só decidido
    // confirmar agora — sem isso, um horário que passou enquanto a
    // tela ficava aberta viraria um agendamento inalterável.
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
      const agendamento = cliente
        ? await api.publico.agendar(slug, {
            barbeiroId: (perfil.dados ?? (await api.publico.perfilDaBarbearia(slug)))
              .barbeiros[0].id,
            servicoIds,
            data: diaConfirmado,
            horaInicio: horaConfirmada,
            cliente,
          })
        : await api.cliente.remarcar(remarcar as string, {
            data: diaConfirmado,
            horaInicio: horaConfirmada,
            servicoIds,
          });

      // Só no caminho de criação: quem remarca pode ter um rascunho de
      // OUTRO agendamento em andamento, e apagar aqui destruiria nome e
      // telefone de algo que essa confirmação não tem nada a ver.
      if (!remarcar) limparDadosDoCliente();
      setCriado(agendamento);
    } catch (causa) {
      const erro = causa as ErroDaApi;

      // O único erro que uma tela correta ainda encontra: a corrida que
      // a trava do banco pega depois de a disponibilidade ter dito que
      // cabia. Reenviar daria o mesmo 409 — o certo é ver a lista nova.
      // O aviso vai na URL, não em `setAviso`: a outra tela monta do
      // zero, e o estado local desta morre com ela.
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
    const nomes = escolhidos.map((s) => s.nome).join(", ");
    const endereco = perfil.dados?.endereco ?? null;

    function adicionarAAgenda(agendamento: AgendamentoSerializado) {
      const ics = gerarIcs({
        uid: agendamento.id,
        titulo: [nomes, perfil.dados?.nome].filter(Boolean).join(" · "),
        data: agendamento.data,
        horaInicio: agendamento.horaInicio,
        horaFim: agendamento.horaFim,
        local: endereco,
      });
      // Arquivo baixado, e não link pra um serviço de calendário: o
      // .ics abre no calendário que a pessoa já usa, seja qual for.
      const url = URL.createObjectURL(
        new Blob([ics], { type: "text/calendar;charset=utf-8" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "agendamento.ics";
      link.click();
      // Com folga: revogar logo depois do click cancela o download em
      // navegador que ainda não começou a ler o arquivo.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }

    // Tudo o que a pessoa precisa pra aparecer na hora certa, no lugar
    // certo. Antes era só "Quando": quem voltava pra esta tela depois
    // (print, aba esquecida) não sabia o que tinha marcado nem pra onde
    // ir.
    return (
      <main className={estilos.pagina}>
        <h1>Agendamento confirmado</h1>
        <div className={estilos.linha}>
          <span>Quando</span>
          <b>
            {criado.horaInicio} · {formatarDataComSemana(criado.data)}
          </b>
        </div>
        <div className={estilos.linha}>
          <span>Serviços</span>
          <b>{nomes}</b>
        </div>
        <div className={estilos.linha}>
          <span>Total</span>
          <b>{formatarPreco((totalEmCentavos / 100).toFixed(2))}</b>
        </div>
        {endereco ? (
          <div className={estilos.linha}>
            <span>Onde</span>
            <b>{endereco}</b>
          </div>
        ) : null}

        <Botao onClick={() => adicionarAAgenda(criado)}>Adicionar à agenda</Botao>

        {/* Só pra quem tem conta: sem ela, "meus agendamentos" abriria
            uma tela de login no lugar da lista. Quem remarcou está
            logado por definição. */}
        {conta || remarcar ? (
          <Link className={estilos.linkDeTexto} href={`/${slug}/minha-conta`}>
            Ver meus agendamentos
          </Link>
        ) : null}

        <Botao variante="contorno" onClick={() => router.push(`/${slug}`)}>
          Voltar ao início
        </Botao>
      </main>
    );
  }

  return (
    <main className={`${estilos.pagina} ${estilos.duasColunas}`}>
      <h1 className={estilos.titulo}>Confirmar</h1>

      {/* O que vai ser agendado. No desktop é a coluna da esquerda, ao
          lado de quem vai ser atendido; no celular vem em cima. */}
      <div className={estilos.resumo}>
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
      </div>

      {/* <form> de verdade: o Enter do teclado do celular confirma, o
          que nenhuma tela do fluxo fazia. `noValidate` porque quem
          valida é o validarDados, com as mensagens deste produto. */}
      <form className={estilos.formulario} onSubmit={confirmar} noValidate>
        {remarcar ? null : conta === null ? (
          // Enquanto a conta não foi apurada, nada de identidade: o
          // formulário apareceria por um instante e seria trocado pelo
          // cartão de quem já estava logada.
          <p className={estilos.apurando}>Carregando…</p>
        ) : conta ? (
          <section className={estilos.identidade} aria-label="Quem vai ser atendido">
            <p className={estilos.identidadeNome}>{conta.nome}</p>
            <p className={estilos.identidadeTelefone}>{conta.telefone}</p>
            {/* Sai da conta SEM navegar: a URL carrega os serviços, o
                dia e a hora, e trocar de rota custaria refazer o fluxo.
                Num celular emprestado é o que impede de marcar pra dona
                do aparelho. */}
            <p className={estilos.troca}>
              Não é você?{" "}
              <button
                type="button"
                className={estilos.link}
                onClick={() => {
                  esquecer();
                  setNome("");
                  setTelefone("");
                }}
              >
                Agendar para outra pessoa
              </button>
            </p>
          </section>
        ) : (
          <>
            <Campo
              rotulo="Nome"
              valor={nome}
              // Mensagem que sobrevive à correção faz o formulário
              // parecer travado: some assim que a pessoa volta a digitar.
              onChange={(proximo) => {
                setNome(proximo);
                setErroNome(undefined);
              }}
              erro={erroNome}
            />
            <Campo
              rotulo="Telefone (WhatsApp)"
              formato="telefone"
              valor={telefone}
              onChange={(proximo) => {
                setTelefone(proximo);
                setErroTelefone(undefined);
              }}
              erro={erroTelefone}
            />
          </>
        )}

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <Botao
          type="submit"
          carregando={enviando}
          disabled={!remarcar && conta === null}
        >
          Confirmar agendamento
        </Botao>

        {/* Link e não um botão do mesmo peso: agendar sem conta é o
            caminho principal, e entrar é pra quem já sabe que tem uma.
            O caminho de volta viaja como NOME de passo — ver
            caminhoDoLogin. */}
        {!remarcar && conta === false ? (
          <p className={estilos.troca}>
            Já tem conta?{" "}
            <button
              type="button"
              className={estilos.link}
              onClick={() =>
                router.push(
                  caminhoDoLogin(slug, "confirmar", {
                    servicoIds,
                    data,
                    hora,
                    remarcar,
                  })
                )
              }
            >
              Entrar
            </button>
          </p>
        ) : null}
      </form>
    </main>
  );
}
