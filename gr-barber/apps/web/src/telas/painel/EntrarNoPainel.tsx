"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@gr-barber/api-client";
import type { SessaoBarbeiro } from "@gr-barber/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../sessao/armazenamento";
import estilos from "./EntrarNoPainel.module.css";

// O mesmo do pattern de apps/api/src/routers/auth.ts:23. Barrar aqui
// mantém o erro no campo, em vez de voltar 400 do AJV em inglês.
const PADRAO_SLUG = /^[a-z0-9-]{3,80}$/;

// Os mesmos limites dos schemas da API. Cortar na digitação evita o 400
// que voltaria sem dizer qual campo passou do tamanho.
const NOME_MAX = 120;
const SLUG_MAX = 80;
const EMAIL_MAX = 160;
const SENHA_MAX = 200;

export function EntrarNoPainel() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [criando, setCriando] = useState(false);
  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroSlug, setErroSlug] = useState<string | undefined>();
  // Erros de e-mail e senha são do campo, não da tentativa. Com o Enter
  // enviando o formulário, envio com campo vazio ficou mais fácil de
  // acontecer — e sem estes dois ele ia até a API e voltava 400 do AJV
  // em inglês, no lugar reservado pra "e-mail ou senha incorretos". É o
  // mesmo conserto que a tela do cliente (telas/Entrar.tsx) já tem.
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function submeter() {
    setAviso(undefined);
    setErroSlug(undefined);
    setErroEmail(undefined);
    setErroSenha(undefined);

    if (criando && !PADRAO_SLUG.test(slug)) {
      setErroSlug("Use letras minúsculas, números e hífen, de 3 a 80 caracteres");
      return;
    }

    // O pattern da API exige algo antes e depois do "@"; barrar o vazio
    // aqui é o que mantém a mensagem em português e no campo certo.
    if (!email.trim()) {
      setErroEmail("Informe seu e-mail");
      return;
    }

    if (!senha) {
      setErroSenha("Informe sua senha");
      return;
    }

    // Só na criação: o login aceita qualquer senha já cadastrada e
    // responde nao_autenticado se ela não bater. Exigir 8 no login
    // recusaria na tela quem cadastrou antes desse mínimo existir.
    if (criando && senha.length < 8) {
      setErroSenha("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    setEnviando(true);

    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = criando
        ? await api.barbeiro.signup({
            barbearia: { nome: nomeDaBarbearia.trim(), slug },
            barbeiro: { nome: nome.trim(), email, senha },
          })
        : await api.barbeiro.login({ email, senha });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      // Os dois códigos, e não só um: `POST /auth/login` responde
      // `credenciais_invalidas` (ver apps/api/src/routers/auth.ts e o
      // README da API), enquanto o login do cliente responde
      // `nao_autenticado`. Esta tela só chama o primeiro — e antes
      // ramificava só no segundo, então senha errada caía no aviso
      // genérico "não foi possível continuar agora". O teste não pegava
      // porque o dublê lançava o código do cliente.
      if (
        erro.codigo === "credenciais_invalidas" ||
        erro.codigo === "nao_autenticado"
      ) {
        setAviso("E-mail ou senha incorretos.");
      } else if (erro.codigo === "conflito") {
        // Sem dizer qual dos dois: a sondagem que o 409 já permite é
        // dívida conhecida, e não vale ampliá-la na tela.
        setAviso("Esse e-mail ou esse endereço já está em uso.");
      } else if (erro.codigo === "tentativas_excedidas") {
        // Dizer que foi o limite, e não "senha incorreta", é o que evita
        // a pessoa certa trocar uma senha que estava certa. A mensagem
        // da API já diz quanto esperar.
        setAviso(
          erro.mensagem ||
            "Muitas tentativas. Espere um pouco antes de tentar de novo."
        );
      } else {
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    }

    setEnviando(false);

    // Fora do try: falha ao guardar não é recusa da API, e mostrá-la
    // como tal mandaria a pessoa duvidar da senha que estava certa.
    if (sessao) {
      sessaoDoBarbeiro.gravar(sessao.token);
      sessaoDaBarbearia.gravar(sessao.barbearia.slug);
      router.push("/painel");
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>{criando ? "Criar barbearia" : "Entrar no painel"}</h1>

      {/* <form> e não um <div> com onClick no botão: sem ele o Enter não
          envia — num formulário de dois campos, é como quase todo mundo
          entra — e o gerenciador de senhas não reconhece o par
          usuário/senha, então não preenche nem oferece salvar. O
          `noValidate` desliga a validação do navegador: com
          `type="email"` ela barraria o envio antes do nosso handler e
          mostraria a bolha dela, na língua dela, em vez das mensagens
          que esta tela escolheu. */}
      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void submeter();
        }}
      >
        {criando ? (
          <>
            <Campo
              rotulo="Nome da barbearia"
              autoComplete="organization"
              maxLength={NOME_MAX}
              valor={nomeDaBarbearia}
              onChange={setNomeDaBarbearia}
            />
            {/* `autoComplete="off"`: o slug não é dado que o navegador
                guarde, e oferecer o histórico de outro campo aqui só
                atrapalharia. */}
            <Campo
              rotulo="Endereço do link"
              autoComplete="off"
              maxLength={SLUG_MAX}
              valor={slug}
              onChange={(proximo) => {
                setSlug(proximo);
                setErroSlug(undefined);
              }}
              erro={erroSlug}
            />
            {/* É este endereço que vai no WhatsApp; mostrar o resultado
                evita descobrir depois que ficou errado. */}
            <p className={estilos.previa}>O link dos seus clientes: /{slug || "sua-barbearia"}</p>
            <Campo
              rotulo="Seu nome"
              autoComplete="name"
              maxLength={NOME_MAX}
              valor={nome}
              onChange={setNome}
            />
          </>
        ) : null}

        {/* `autoComplete="username"` e não "email": é o token que faz o
            gerenciador de senhas emparelhar este campo com o de senha
            abaixo. Com "email" ele trata o campo como contato solto e
            não oferece a credencial salva. */}
        <Campo
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="username"
          maxLength={EMAIL_MAX}
          // A tela existe pra uma coisa só: quem chegou aqui já quer
          // digitar.
          autoFocus
          valor={email}
          onChange={(proximo) => {
            setEmail(proximo);
            setErroEmail(undefined);
          }}
          erro={erroEmail}
        />
        {/* O token muda com o modo: "new-password" faz o navegador
            oferecer uma senha forte e salvar a nova, "current-password"
            faz ele preencher a que já está guardada. Um valor fixo
            erraria metade das vezes. */}
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete={criando ? "new-password" : "current-password"}
          maxLength={SENHA_MAX}
          valor={senha}
          onChange={(proximo) => {
            setSenha(proximo);
            setErroSenha(undefined);
          }}
          erro={erroSenha}
        />

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            {criando ? "Criar e entrar" : "Entrar"}
          </Botao>
          {/* `type="button"` porque agora ele está DENTRO do form, e um
              <button> sem type é submit — trocar de modo enviaria o
              formulário. */}
          <Botao
            type="button"
            variante="contorno"
            onClick={() => {
              setCriando((atual) => !atual);
              setAviso(undefined);
              setErroSlug(undefined);
              setErroEmail(undefined);
              setErroSenha(undefined);
            }}
          >
            {criando ? "Já tenho conta" : "Criar barbearia"}
          </Botao>
        </div>
      </form>
    </main>
  );
}
