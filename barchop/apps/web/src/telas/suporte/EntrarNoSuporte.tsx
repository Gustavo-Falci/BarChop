"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoSuporte } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoSuporte } from "../../suporte/ProvedorDoSuporte";
import { sessaoDoSuporte } from "../../sessao/armazenamento";
// O mesmo molde do login do painel: uma coluna estreita, centrada.
import estilos from "../painel/EntrarNoPainel.module.css";

// Os mesmos limites do schema de POST /suporte/login.
const EMAIL_MAX = 160;
const SENHA_MAX = 200;

// O login do suporte da plataforma (Onda 1, F4d). Sem "esqueci a senha"
// nem cadastro: a conta nasce só pelo comando `criar-suporte` da API, e
// trocar a senha também é coisa de quem opera o servidor.
export function EntrarNoSuporte() {
  const router = useRouter();
  const api = useApiDoSuporte();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function submeter() {
    setAviso(undefined);
    setErroEmail(undefined);
    setErroSenha(undefined);

    if (!email.trim()) {
      setErroEmail("Informe seu e-mail");
      return;
    }
    if (!senha) {
      setErroSenha("Informe sua senha");
      return;
    }

    setEnviando(true);
    let sessao: SessaoSuporte | undefined;
    try {
      sessao = await api.login(email, senha);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "credenciais_invalidas") {
        setAviso("E-mail ou senha incorretos.");
      } else {
        // `tentativas_excedidas` inclusive: a mensagem da API já diz
        // quanto esperar.
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    }
    setEnviando(false);

    if (sessao) {
      sessaoDoSuporte.gravar(sessao.token);
      router.push("/painel/suporte");
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>Suporte do BarChop</h1>

      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void submeter();
        }}
      >
        <Campo
          rotulo="E-mail"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="username"
          maxLength={EMAIL_MAX}
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

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
        </div>
      </form>
    </main>
  );
}
