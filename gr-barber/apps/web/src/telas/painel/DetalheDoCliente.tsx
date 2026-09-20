"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@gr-barber/api-client";
import Link from "next/link";
import {
  apenasDigitos,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@gr-barber/formato";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Tabela } from "../../componentes/Tabela";
import { useRequisicao } from "../../api/useRequisicao";
import {
  EMAIL_MAX,
  NOME_MAX,
  validarEmailDeCliente,
  validarNomeDeCliente,
} from "../../formato/cliente";
import { formatarDataLonga } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoCliente.module.css";

export function DetalheDoCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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

  return (
    <div className={estilos.pagina}>
      <h1>{cliente.dados.nome}</h1>

      {recemCadastrado ? (
        <Aviso tom="sucesso">
          Cliente cadastrado. Confira os dados abaixo se precisar corrigir.
        </Aviso>
      ) : null}

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

      <Botao carregando={salvando} onClick={salvar}>
        Salvar
      </Botao>

      <h2>Histórico</h2>
      <Tabela
        cabecalho={["Data", "Horário", "Serviços", "Status"]}
        vazio="Esse cliente ainda não tem agendamento."
        aoAbrir={(agendamentoId) => router.push(`/painel/agendamentos/${agendamentoId}`)}
        linhas={cliente.dados.agendamentos.map((agendamento) => ({
          id: agendamento.id,
          celulas: [
            formatarDataLonga(agendamento.data),
            agendamento.horaInicio,
            agendamento.servicos.map((s) => s.nome).join(" + "),
            rotuloDoStatus(agendamento.status),
          ],
        }))}
      />
    </div>
  );
}
