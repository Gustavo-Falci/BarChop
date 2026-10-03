"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoBarbeiro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../sessao/armazenamento";
import estilos from "./EntrarNoPainel.module.css";

// Os mesmos limites do schema de POST /auth/convite/aceitar.
const EMAIL_MAX = 160;
const SENHA_MIN = 8;
const SENHA_MAX = 200;

// O membro convidado define a primeira senha e entra. Fora do grupo
// (guardado), como o /painel/entrar: quem chega aqui ainda não tem
// sessão. O e-mail vem no link do convite (?email=), quando a API tem
// URL_DO_PAINEL; sem ele, a pessoa digita.
export function AceitarConvite() {
  const router = useRouter();
  const api = useApiDoPainel();
  const query = useSearchParams();

  const [email, setEmail] = useState(() => query.get("email") ?? "");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function aceitar() {
    setAviso(undefined);

    const novos: Record<string, string | undefined> = {};
    if (!email.trim()) novos.email = "Informe o e-mail que recebeu o convite";
    if (!/^\d{6}$/.test(codigo)) novos.codigo = "O código tem 6 dígitos";
    if (senha.length < SENHA_MIN) {
      novos.senha = `A senha deve ter pelo menos ${SENHA_MIN} caracteres`;
    }
    setErro(novos);
    if (Object.values(novos).some(Boolean)) return;

    setEnviando(true);
    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = await api.barbeiro.aceitarConvite({ email: email.trim(), codigo, senha });
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (falha.codigo === "codigo_invalido") {
        // No campo do código: é ali que a pessoa vai conferir. A API não
        // diz qual dos casos foi (código errado, vencido, já usado) — a
        // saída é a mesma pra todos.
        setErro({
          codigo: "Código inválido ou vencido. Confira o e-mail ou peça ao dono para reenviar o convite.",
        });
      } else {
        // `tentativas_excedidas` já vem com "tente de novo em N".
        setAviso(falha.mensagem || "Não foi possível aceitar o convite agora.");
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
      <h1>Aceitar convite</h1>
      <p>
        Use o código que chegou no seu e-mail e crie a senha que você vai
        usar pra entrar no painel.
      </p>

      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void aceitar();
        }}
      >
        <Campo
          rotulo="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          maxLength={EMAIL_MAX}
          valor={email}
          onChange={(proximo) => {
            setEmail(proximo);
            setErro((anterior) => ({ ...anterior, email: undefined }));
          }}
          erro={erro.email}
        />
        {/* `one-time-code` faz o celular sugerir o código recebido. */}
        <Campo
          rotulo="Código do convite"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          valor={codigo}
          onChange={(proximo) => {
            setCodigo(proximo.replace(/\D/g, ""));
            setErro((anterior) => ({ ...anterior, codigo: undefined }));
          }}
          erro={erro.codigo}
        />
        <Campo
          rotulo="Senha"
          type="password"
          name="senha"
          autoComplete="new-password"
          maxLength={SENHA_MAX}
          valor={senha}
          onChange={(proximo) => {
            setSenha(proximo);
            setErro((anterior) => ({ ...anterior, senha: undefined }));
          }}
          erro={erro.senha}
        />

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            Entrar no painel
          </Botao>
        </div>

        <p className={estilos.troca}>
          Já tem senha? <Link href="/painel/entrar" className={estilos.link}>Entrar</Link>
        </p>
      </form>
    </main>
  );
}
