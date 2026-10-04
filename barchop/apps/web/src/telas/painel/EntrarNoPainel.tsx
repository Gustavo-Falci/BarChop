"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoBarbeiro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../sessao/armazenamento";
import estilos from "./EntrarNoPainel.module.css";
import { RecuperarSenhaDoPainel } from "./RecuperarSenhaDoPainel";

// Os mesmos limites dos schemas da API. Cortar na digitação evita o 400
// que voltaria sem dizer qual campo passou do tamanho.
const EMAIL_MAX = 160;
const SENHA_MAX = 200;

// Só o login. O cadastro do dono era um modo desta tela e virou a dele,
// /painel/cadastro (Onda 1, F1): quem chega pra entrar não precisa ler
// o que a barbearia ganha, e quem chega pra criar precisa.
export function EntrarNoPainel() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [recuperando, setRecuperando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
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
    setErroEmail(undefined);
    setErroSenha(undefined);

    // O pattern da API exige algo antes e depois do "@"; barrar o vazio
    // aqui é o que mantém a mensagem em português e no campo certo.
    if (!email.trim()) {
      setErroEmail("Informe seu e-mail");
      return;
    }

    // Sem mínimo de tamanho: o login aceita qualquer senha já cadastrada
    // e exigir 8 recusaria quem cadastrou antes desse mínimo existir.
    if (!senha) {
      setErroSenha("Informe sua senha");
      return;
    }

    setEnviando(true);

    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = await api.barbeiro.login({ email, senha });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      // `credenciais_invalidas` é o código das DUAS rotas de login desde
      // que o do cliente foi alinhado. Esta tela já ramificou só em
      // `nao_autenticado`, que é o código de token, e por isso senha
      // errada caía no aviso genérico "não foi possível continuar
      // agora" — o teste não pegava porque o dublê lançava o código do
      // cliente. Ao escrever teste de erro, confira o código no router
      // da API, não no falso.ts.
      if (erro.codigo === "credenciais_invalidas") {
        setAviso("E-mail ou senha incorretos.");
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

  if (recuperando) {
    return (
      <RecuperarSenhaDoPainel
        emailInicial={email}
        aoVoltar={() => setRecuperando(false)}
      />
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Entrar no painel</h1>

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
        {/* `autoComplete="username"` e não "email": é o token que faz o
            gerenciador de senhas emparelhar este campo com o de senha
            abaixo. Com "email" ele trata o campo como contato solto e
            não oferece a credencial salva. */}
        <Campo
          rotulo="E-mail"
          type="email"
          name="email"
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
        <Campo
          rotulo="Senha"
          type="password"
          name="senha"
          autoComplete="current-password"
          maxLength={SENHA_MAX}
          valor={senha}
          onChange={(proximo) => {
            setSenha(proximo);
            setErroSenha(undefined);
          }}
          erro={erroSenha}
        />

        {/* `type="button"`: dentro do <form>, sem type, ele enviaria o
            login. */}
        <p className={estilos.troca}>
          <button
            type="button"
            className={estilos.link}
            onClick={() => setRecuperando(true)}
          >
            Esqueci a senha
          </button>
          {" · "}
          {/* <Link> e não <button>: este sim navega, pra outra tela.
              É a porta de quem recebeu o convite sem link — a API só
              põe o link no e-mail quando tem URL_DO_PAINEL. */}
          <Link href="/painel/convite" className={estilos.link}>
            Recebi um convite
          </Link>
        </p>

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
        </div>

        {/* Frase com link, abaixo da ação principal: não é uma segunda
            forma de enviar o formulário, é a porta pra outra tela. */}
        <p className={estilos.troca}>
          Ainda não tem uma barbearia aqui?{" "}
          <Link href="/painel/cadastro" className={estilos.link}>
            Criar barbearia
          </Link>
        </p>
      </form>
    </main>
  );
}
