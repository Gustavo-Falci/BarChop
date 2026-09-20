"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@gr-barber/api-client";
import {
  apenasDigitos,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@gr-barber/formato";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import {
  EMAIL_MAX,
  NOME_MAX,
  validarEmailDeCliente,
  validarNomeDeCliente,
  type Validado,
} from "../../formato/cliente";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./CadastroDeCliente.module.css";

export function CadastroDeCliente() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  // O telefone normalizado do 409, guardado à parte do `aviso` porque
  // este caso não termina numa frase: termina num link pro cadastro que
  // já existe. Ver o bloco do conflito no JSX.
  const [telefoneEmConflito, setTelefoneEmConflito] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  const formulario = useRef<HTMLFormElement>(null);
  // Um contador, e não um booleano: o foco precisa ir pro primeiro
  // campo inválido a CADA envio recusado, e um booleano que vira true
  // na primeira vez nunca dispara de novo.
  const [envios, setEnvios] = useState(0);

  // Sem isto, apertar Enter com os três campos errados não mexia o foco:
  // as três mensagens apareciam numa parte da tela que quem usa teclado
  // não está olhando, e o leitor de tela não anunciava nenhuma delas —
  // `aria-describedby` só é lido quando o campo recebe foco.
  //
  // Lê o DOM em vez de guardar refs dos três campos porque a ordem que
  // importa é a visual, e `querySelector` devolve exatamente o primeiro
  // na ordem do documento. O efeito roda depois do commit, então os
  // `aria-invalid` já estão pintados.
  useEffect(() => {
    if (!envios) return;
    formulario.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [envios]);

  // Uma resposta do servidor fala do que foi enviado. Assim que a pessoa
  // mexe em qualquer campo, o que está na tela não é mais o que gerou
  // aquela resposta — e um aviso de telefone repetido pendurado sobre um
  // telefone já trocado manda procurar um cadastro que não existe.
  function limparRespostaDoServidor() {
    setAviso(undefined);
    setTelefoneEmConflito(undefined);
  }

  // A mesma função que a API usa pra guardar. Barrar aqui evita a ida e
  // volta que voltaria 400 do pattern sem dizer o que fazer.
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

  // Validar ao sair do campo, e não só no envio: quem digita o telefone
  // e segue em frente descobre o problema ali, não três campos depois.
  //
  // O campo vazio é poupado de propósito — passar pelo formulário com
  // Tab acusaria "escreva o nome" antes de a pessoa ter tido chance de
  // escrever qualquer coisa. Vazio é assunto do envio.
  function aoSair(
    valor: string,
    validar: (v: string) => Validado<unknown>
  ): string | undefined {
    if (!valor.trim()) return undefined;
    const resultado = validar(valor);
    return "erro" in resultado ? resultado.erro : undefined;
  }

  async function cadastrar() {
    limparRespostaDoServidor();

    // Os três campos são validados SEMPRE, e não até o primeiro que
    // falha: parar no primeiro faz o formulário revelar um erro por
    // tentativa, e quem digitou o nome em branco e o e-mail torto
    // descobre o segundo só depois de consertar o primeiro. Mesma
    // decisão de CadastroDeServico.
    const comNome = validarNomeDeCliente(nome);
    const comNumero = validarTelefone(telefone);
    const comEmail = validarEmailDeCliente(email);

    setErroNome("erro" in comNome ? comNome.erro : undefined);
    setErroTelefone("erro" in comNumero ? comNumero.erro : undefined);
    setErroEmail("erro" in comEmail ? comEmail.erro : undefined);

    if ("erro" in comNome || "erro" in comNumero || "erro" in comEmail) {
      // Depois dos setErro, pra que o efeito ache os `aria-invalid`
      // deste envio, e não os do anterior.
      setEnvios((n) => n + 1);
      return;
    }

    setSalvando(true);
    try {
      const criado = await api.barbeiro.criarCliente({
        nome: comNome.valor,
        telefone: comNumero.valor,
        email: comEmail.valor,
      });
      // `?novo=1` faz o detalhe confirmar o cadastro. Sem isso, navegar
      // pra lá é a única prova de que salvou — e quem chega no detalhe
      // não distingue "acabei de criar" de "abri um cadastro antigo".
      //
      // Sem `setSalvando(false)` depois: `router.push` só agenda a
      // navegação, e reabrir o botão aqui deixa um segundo clique sair
      // enquanto a rota ainda troca. O 409 do telefone salvaria a
      // situação por acidente — não é o que deve segurar isso.
      router.push(`/painel/clientes/${criado.id}?novo=1`);
      return;
    } catch (causa) {
      const erro = causa as ErroDaApi;
      // Telefone repetido é o caso comum, não o raro: o cadastro pode
      // ter nascido do upsert do agendamento público.
      if (erro.codigo === "conflito") setTelefoneEmConflito(comNumero.valor);
      else setAviso(erro.mensagem || "Não foi possível cadastrar agora.");
    }
    setSalvando(false);
  }

  return (
    <div className={estilos.pagina}>
      {/* Sem `acao`: o Cancelar saiu do cabeçalho e foi pro rodapé do
          formulário, ao lado do Cadastrar. Aquele canto é onde Clientes
          e Serviços põem o "+ Novo" — a ação PRINCIPAL da tela —, e
          usar a mesma posição pra desistir dava sentidos opostos ao
          mesmo lugar. No celular era pior: o cabeçalho empilha e o
          Cancelar virava o primeiro controle abaixo do título, acima de
          todos os campos. */}
      <CabecalhoDaPagina titulo="Novo cliente" />

      {/* <form> e não um <div> com onClick no botão: sem ele o Enter não
          envia, e este é um formulário de três campos que o barbeiro
          repete o dia inteiro. O `noValidate` desliga a validação do
          navegador — com `type="email"` ela barraria o envio antes do
          nosso handler e mostraria a bolha dela, na língua dela, em vez
          das mensagens que esta tela escolheu. */}
      <form
        ref={formulario}
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void cadastrar();
        }}
      >
        <Campo
          rotulo="Nome"
          placeholder="Nome e sobrenome"
          autoComplete="name"
          maxLength={NOME_MAX}
          // O foco começa aqui porque a tela existe pra uma coisa só:
          // quem chegou pelo "+ Novo cliente" já quer digitar.
          autoFocus
          valor={nome}
          onChange={(proximo) => {
            setNome(proximo);
            setErroNome(undefined);
            limparRespostaDoServidor();
          }}
          onBlur={() => setErroNome(aoSair(nome, validarNomeDeCliente))}
          erro={erroNome}
        />
        {/* `inputMode="tel"` e não `type="tel"`: o teclado do celular
            abre numérico do mesmo jeito, e o campo continua uma string
            comum — que é o que o formatarTelefoneParcial do Campo
            reescreve a cada tecla.

            A regra de formato vai no `apoio`, que fica, e não só no
            placeholder, que some na primeira tecla — bem quando a
            pessoa quer conferir o que digitou contra o exemplo. */}
        <Campo
          rotulo="Telefone"
          apoio="Com DDD, do jeito que for — a gente formata."
          formato="telefone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-8888"
          valor={telefone}
          onChange={(proximo) => {
            setTelefone(proximo);
            setErroTelefone(undefined);
            limparRespostaDoServidor();
          }}
          onBlur={() => setErroTelefone(aoSair(telefone, validarTelefone))}
          erro={erroTelefone}
        />
        <Campo
          rotulo="E-mail (opcional)"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="ana@exemplo.com"
          maxLength={EMAIL_MAX}
          valor={email}
          onChange={(proximo) => {
            setEmail(proximo);
            setErroEmail(undefined);
            limparRespostaDoServidor();
          }}
          onBlur={() => setErroEmail(aoSair(email, validarEmailDeCliente))}
          erro={erroEmail}
        />

        {/* O 409 é o único erro desta tela que tem conserto de um
            clique: o cadastro procurado existe, só não é este. O link
            leva à lista já filtrada pelo número — `?busca=` é o filtro
            que ListaDeClientes lê da URL — e vai em dígitos porque é
            assim que a busca compara (a API tira a pontuação dos dois
            lados antes de casar). */}
        {telefoneEmConflito ? (
          <Aviso>
            Esse telefone já tem cadastro.{" "}
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

        {/* As duas saídas do formulário juntas, e o Cancelar depois: no
            desktop elas ficavam a uns 400px uma da outra, com a de
            desistir por cima. `type="button"` no Cancelar porque agora
            ele está DENTRO do form, e um <button> sem type é submit —
            cancelar cadastraria o cliente. */}
        <div className={estilos.acoes}>
          <Botao type="submit" carregando={salvando}>
            Cadastrar
          </Botao>
          <Botao
            type="button"
            variante="contorno"
            onClick={() => router.push("/painel/clientes")}
          >
            Cancelar
          </Botao>
        </div>
      </form>
    </div>
  );
}
