"use client";

import { useState } from "react";
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

// Os mesmos limites dos schemas de /auth/codigo e /auth/senha.
const EMAIL_MAX = 160;
const SENHA_MAX = 200;

interface Props {
  // O e-mail que a pessoa já tinha digitado no login: quem esqueceu a
  // senha costuma descobrir isso depois de errar uma vez.
  emailInicial: string;
  aoVoltar: () => void;
}

// Esqueci a senha do barbeiro: e-mail → código → nova senha. Dois
// passos na mesma tela, como o primeiro acesso do cliente
// (telas/Entrar.tsx), e mesma regra: a API responde igual tendo ou não
// conta, então a tela também — "se esse e-mail tiver conta".
export function RecuperarSenhaDoPainel({ emailInicial, aoVoltar }: Props) {
  const router = useRouter();
  const api = useApiDoPainel();

  const [email, setEmail] = useState(emailInicial);
  // Preenchido depois do envio: é o que separa o passo 1 do passo 2.
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  function avisoDoErro(erro: ErroDaApi, padrao: string) {
    // `tentativas_excedidas` já vem com "tente de novo em N" da API.
    setAviso(erro.mensagem || padrao);
  }

  async function enviarCodigo() {
    setAviso(undefined);
    setErroEmail(undefined);

    if (!email.trim()) {
      setErroEmail("Informe seu e-mail");
      return;
    }

    setEnviando(true);
    try {
      await api.barbeiro.pedirCodigo(email.trim());
      setEnviadoPara(email.trim());
    } catch (causa) {
      avisoDoErro(causa as ErroDaApi, "Não foi possível mandar o código agora.");
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    setAviso(undefined);
    setErroCodigo(undefined);
    setErroSenha(undefined);

    if (!/^\d{6}$/.test(codigo)) {
      setErroCodigo("O código tem 6 dígitos");
      return;
    }
    if (senha.length < 8) {
      setErroSenha("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    setEnviando(true);
    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = await api.barbeiro.redefinirSenha({
        email: enviadoPara ?? email.trim(),
        codigo,
        senha,
      });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "codigo_invalido") {
        // No campo do código: é ali que a pessoa vai conferir.
        setErroCodigo("Código inválido ou vencido. Confira ou peça outro.");
      } else {
        avisoDoErro(erro, "Não foi possível trocar a senha agora.");
      }
    }
    setEnviando(false);

    if (sessao) {
      sessaoDoBarbeiro.gravar(sessao.token);
      sessaoDaBarbearia.gravar(sessao.barbearia.slug);
      router.push("/painel");
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>Redefinir a senha</h1>

      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void (enviadoPara ? salvar() : enviarCodigo());
        }}
      >
        {enviadoPara ? (
          <>
            <p>
              Se <b>{enviadoPara}</b> tiver conta no BarChop, mandamos um
              código pra lá. Ele vale 10 minutos.
            </p>
            {/* `one-time-code` faz o celular sugerir o código recebido. */}
            <Campo
              rotulo="Código"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              valor={codigo}
              onChange={(proximo) => {
                setCodigo(proximo.replace(/\D/g, ""));
                setErroCodigo(undefined);
              }}
              erro={erroCodigo}
            />
            <Campo
              rotulo="Nova senha"
              type="password"
              name="senha"
              autoComplete="new-password"
              maxLength={SENHA_MAX}
              valor={senha}
              onChange={(proximo) => {
                setSenha(proximo);
                setErroSenha(undefined);
              }}
              erro={erroSenha}
            />
          </>
        ) : (
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
        )}

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            {enviadoPara ? "Salvar e entrar" : "Enviar código"}
          </Botao>
        </div>

        <p className={estilos.troca}>
          {enviadoPara ? (
            <>
              Não chegou?{" "}
              <button
                type="button"
                className={estilos.link}
                onClick={() => void enviarCodigo()}
              >
                Reenviar código
              </button>
              {" · "}
            </>
          ) : null}
          <button type="button" className={estilos.link} onClick={aoVoltar}>
            Voltar pra entrar
          </button>
        </p>
      </form>
    </main>
  );
}
