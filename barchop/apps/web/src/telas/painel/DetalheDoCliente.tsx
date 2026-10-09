"use client";

import { useId, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoSerializado } from "@barchop/types";
import Link from "next/link";
import {
  apenasDigitos,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@barchop/formato";
import { Aviso } from "../../componentes/Aviso";
import { Botao, BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import {
  EMAIL_MAX,
  NOME_MAX,
  validarEmailDeCliente,
  validarNomeDeCliente,
} from "../../formato/cliente";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { IconeSeta } from "../../painel/icones";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { linkDoZap } from "../../painel/whatsapp";
import estilos from "./DetalheDoCliente.module.css";

// Quem não vai (cancelado, não compareceu) não conta como "próximo" nem
// como "último" no resumo — continua na lista, com o status.
const NAO_ACONTECE = new Set(["cancelado", "no_show"]);

// "2 agendamentos · próximo em 15 de setembro · último em 30 de agosto":
// o que o dono quer saber antes de chamar ou marcar alguém.
function resumoDoHistorico(agendamentos: AgendamentoSerializado[], hoje: string): string {
  if (agendamentos.length === 0) return "Ainda sem agendamento";
  const partes = [
    `${agendamentos.length} ${agendamentos.length === 1 ? "agendamento" : "agendamentos"}`,
  ];
  const valem = agendamentos.filter((a) => !NAO_ACONTECE.has(a.status));
  // A API manda do mais novo pro mais velho.
  const proximo = valem.filter((a) => a.data >= hoje).at(-1);
  const ultimo = valem.find((a) => a.data < hoje);
  if (proximo) partes.push(`próximo em ${formatarDataLonga(proximo.data)}`);
  if (ultimo) partes.push(`último em ${formatarDataLonga(ultimo.data)}`);
  return partes.join(" · ");
}

const TOM_DO_STATUS: Record<string, "ok" | "atencao" | "neutro" | "erro"> = {
  confirmado: "ok",
  pendente: "atencao",
  concluido: "neutro",
  cancelado: "erro",
  no_show: "erro",
};

// Soma em centavos: somar os preços como número passaria por float.
function totalDe(agendamento: AgendamentoSerializado): string {
  const centavos = agendamento.servicos.reduce(
    (soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100),
    0
  );
  return formatarPreco((centavos / 100).toFixed(2));
}

// Um grupo do histórico ("Próximos", "Anteriores"): título pequeno e as
// linhas, sem caixa em volta. Cada linha é um link pro agendamento.
function GrupoDoHistorico({
  titulo,
  agendamentos,
}: {
  titulo: string;
  agendamentos: AgendamentoSerializado[];
}) {
  const id = useId();
  if (agendamentos.length === 0) return null;
  return (
    <section className={estilos.grupo} aria-labelledby={id}>
      <h2 id={id} className={estilos.rotuloDoGrupo}>
        {titulo}
      </h2>
      <ul className={estilos.linhas}>
        {agendamentos.map((agendamento) => (
          <li key={agendamento.id}>
            <Link
              className={`${estilos.linha} ${NAO_ACONTECE.has(agendamento.status) ? estilos.naoAconteceu : ""}`}
              href={`/painel/agendamentos/${agendamento.id}`}
            >
              <span className={estilos.quando}>
                <strong>{formatarDataLonga(agendamento.data)}</strong>
                <span className={estilos.secundario}>{agendamento.horaInicio}</span>
              </span>
              <span className={estilos.oque}>
                {agendamento.servicos.map((s) => s.nome).join(" + ")}
                {agendamento.barbeiro?.nome ? (
                  <span className={estilos.secundario}> com {agendamento.barbeiro.nome}</span>
                ) : null}
              </span>
              <span className={estilos.valor}>{totalDe(agendamento)}</span>
              <span className={estilos.status}>
                <Chip tom={TOM_DO_STATUS[agendamento.status] ?? "neutro"} tamanho="pequeno">
                  {rotuloDoStatus(agendamento.status)}
                </Chip>
              </span>
              <IconeSeta className={estilos.seta} width={18} height={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// `agora` por parâmetro, como na ListaDeClientes: o corte entre próximos
// e anteriores é "hoje", e o teste fixa o dia.
export function DetalheDoCliente({ agora }: { agora?: Date } = {}) {
  const { id } = useParams<{ id: string }>();
  const api = useApiDoPainel();

  // Quem chega aqui vindo do "Cadastrar" precisa ouvir que deu certo:
  // navegar pra outra tela é feedback implícito, e o nome no título não
  // distingue "acabei de criar" de "abri um cadastro antigo". Quem
  // escreve o `?novo=1` é o CadastroDeCliente, no router.push.
  const recemCadastrado = useSearchParams().get("novo") === "1";

  // A mesma chamada traz o cadastro e o histórico: ClienteComHistorico.
  const cliente = useRequisicao(() => api.barbeiro.cliente(id), [id]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  // Mesmo mecanismo do CadastroDeCliente: o 409 termina num link pro
  // cadastro que já existe, não numa frase mandando procurar.
  const [telefoneEmConflito, setTelefoneEmConflito] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização, e não num `useEffect`: um
  // efeito só roda depois do commit, e entre o commit e o efeito o
  // formulário já teria aparecido com os campos vazios — digitar nessa
  // janela corre contra o preenchimento e perde o que a pessoa
  // escreveu. Mesmo mecanismo do fix em ConfiguracoesDaBarbearia
  // (181514d): a trava `!cliente.dados` mais abaixo olha se os dados
  // chegaram, não se o estado local já foi sincronizado com eles — por
  // isso não fecha essa janela sozinha. Sincronizar aqui evita o commit
  // intermediário: o React descarta essa renderização e refaz com o
  // valor certo antes de pintar qualquer coisa. O `!==` contra o
  // rastreador é o que impede o loop, e também é o que faz
  // `cliente.recarregar()` (depois de salvar) sincronizar de novo — a
  // resposta fresca do GET não é `===` à anterior.
  const [clienteSincronizado, setClienteSincronizado] = useState<typeof cliente.dados>(null);
  if (cliente.dados && cliente.dados !== clienteSincronizado) {
    setClienteSincronizado(cliente.dados);
    setNome(cliente.dados.nome);
    setTelefone(cliente.dados.telefone);
    setEmail(cliente.dados.email ?? "");
  }

  if (cliente.erro) {
    return (
      <Aviso>
        {cliente.erro.codigo === "nao_encontrado"
          ? "Cliente não encontrado."
          : cliente.erro.mensagem}
      </Aviso>
    );
  }
  if (!cliente.dados) return <p>Carregando…</p>;

  function validarTelefone(digitado: string) {
    try {
      return { valor: normalizarTelefoneObrigatorio(digitado) };
    } catch (causa) {
      return {
        erro:
          causa instanceof TelefoneInvalido
            ? "Informe o DDD e o número, como (11) 99999-8888"
            : "Telefone inválido",
      };
    }
  }

  async function salvar() {
    setAviso(undefined);
    setTelefoneEmConflito(undefined);

    // Os três campos, e não só o telefone: `PATCH /clientes/:id` tem o
    // mesmo `minLength: 2` no nome e o mesmo PADRAO_EMAIL do POST
    // (corpoPatchCliente, em apps/api/src/routers/clientes.ts). Apagar o
    // nome aqui e salvar voltava 400 com uma frase de ajv. Quem edita um
    // cliente não deve receber pior do que quem cria um do zero — que é
    // o mesmo princípio que já valia pra mensagem do 409.
    const comNome = validarNomeDeCliente(nome);
    const comNumero = validarTelefone(telefone);
    const comEmail = validarEmailDeCliente(email);

    setErroNome("erro" in comNome ? comNome.erro : undefined);
    setErroTelefone("erro" in comNumero ? comNumero.erro : undefined);
    setErroEmail("erro" in comEmail ? comEmail.erro : undefined);

    if ("erro" in comNome || "erro" in comNumero || "erro" in comEmail) {
      return;
    }

    setSalvando(true);
    try {
      await api.barbeiro.atualizarCliente(id, {
        nome: comNome.valor,
        telefone: comNumero.valor,
        email: comEmail.valor,
      });
      cliente.recarregar();
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "conflito") setTelefoneEmConflito(comNumero.valor);
      else setAviso(erro.mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  const dados = cliente.dados;
  const mudou =
    nome !== dados.nome || telefone !== dados.telefone || email !== (dados.email ?? "");

  function descartar() {
    setNome(dados.nome);
    setTelefone(dados.telefone);
    setEmail(dados.email ?? "");
    setErroNome(undefined);
    setErroTelefone(undefined);
    setErroEmail(undefined);
    setTelefoneEmConflito(undefined);
    setAviso(undefined);
  }

  const hoje = hojeIso(agora);
  // A API manda do mais novo pro mais velho; os próximos leem melhor do
  // mais perto pro mais longe.
  const proximos = dados.agendamentos.filter((a) => a.data >= hoje).reverse();
  const anteriores = dados.agendamentos.filter((a) => a.data < hoje);

  return (
    <div className={estilos.pagina}>
      {/* As duas coisas que se faz com um cliente — chamar e marcar — no
          topo, e o resumo do histórico como linha de apoio. */}
      <CabecalhoDaPagina
        voltar={{ href: "/painel/clientes", rotulo: "Clientes" }}
        titulo={dados.nome}
        apoio={resumoDoHistorico(dados.agendamentos, hoje)}
        acao={
          <div className={estilos.acoesDoTopo}>
            <BotaoLink href={linkDoZap(dados.telefone)} variante="contorno" externo>
              WhatsApp
            </BotaoLink>
            <BotaoLink href={`/painel/agendamentos/novo?cliente=${dados.id}`}>Agendar</BotaoLink>
          </div>
        }
      />

      {recemCadastrado ? (
        <Aviso tom="sucesso">
          Cliente cadastrado. Confira os dados abaixo se precisar corrigir.
        </Aviso>
      ) : null}

      {/* Sem as caixas "Dados" e "Histórico" (pedido do dono): o
          histórico, que é o que se olha, à esquerda e largo; os dados à
          direita, editáveis ali mesmo. No celular, um embaixo do outro. */}
      <div className={estilos.corpo}>
        <div className={estilos.historico}>
          {dados.agendamentos.length === 0 ? (
            <p className={estilos.vazio}>
              Esse cliente ainda não tem agendamento. Use o Agendar lá em cima pra marcar o
              primeiro.
            </p>
          ) : (
            <>
              <GrupoDoHistorico titulo="Próximos" agendamentos={proximos} />
              <GrupoDoHistorico titulo="Anteriores" agendamentos={anteriores} />
            </>
          )}
        </div>

        <section className={estilos.dados} aria-labelledby="dados-do-cliente">
          <h2 id="dados-do-cliente" className={estilos.rotuloDoGrupo}>
            Dados
          </h2>
          <Campo
            rotulo="Nome"
            maxLength={NOME_MAX}
            valor={nome}
            onChange={(proximo) => {
              setNome(proximo);
              setErroNome(undefined);
            }}
            erro={erroNome}
          />
          <Campo
            rotulo="Telefone"
            apoio="Com DDD, do jeito que for — a gente formata."
            formato="telefone"
            inputMode="tel"
            valor={telefone}
            onChange={(proximo) => {
              setTelefone(proximo);
              setErroTelefone(undefined);
              setTelefoneEmConflito(undefined);
            }}
            erro={erroTelefone}
          />
          <Campo
            rotulo="E-mail (opcional)"
            type="email"
            inputMode="email"
            maxLength={EMAIL_MAX}
            valor={email}
            onChange={(proximo) => {
              setEmail(proximo);
              setErroEmail(undefined);
            }}
            erro={erroEmail}
          />

          {telefoneEmConflito ? (
            <Aviso>
              Esse telefone já é de outro cliente.{" "}
              <Link
                href={`/painel/clientes?busca=${encodeURIComponent(
                  apenasDigitos(telefoneEmConflito)
                )}`}
              >
                Abrir o cadastro existente
              </Link>
            </Aviso>
          ) : null}

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          {/* Mesmo jeito das observações no detalhe do agendamento: os
              botões só aparecem quando há o que salvar — um Salvar sempre
              aceso não diz se algo mudou. */}
          {mudou ? (
            <div className={estilos.botoesDosDados}>
              <Botao variante="fantasma" onClick={descartar} disabled={salvando}>
                Descartar
              </Botao>
              <Botao carregando={salvando} onClick={salvar}>
                Salvar
              </Botao>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
