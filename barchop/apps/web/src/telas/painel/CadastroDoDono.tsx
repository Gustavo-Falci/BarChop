"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { PADRAO_SLUG, slugReservado, sugerirSlug } from "@barchop/formato";
import type { SessaoBarbeiro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../sessao/armazenamento";
import { enderecoDaBarbearia } from "../../tenant/endereco";
import estilos from "./CadastroDoDono.module.css";

// O mesmo pattern e a mesma lista de reservados que a API usa (vêm do
// @barchop/formato). Barrar aqui mantém o erro no campo, em vez de
// voltar 400 do AJV em inglês ou 422 genérico.
const FORMATO_DO_SLUG = new RegExp(PADRAO_SLUG);

// Os mesmos limites dos schemas da API.
const NOME_MAX = 120;
const SLUG_MAX = 80;
const EMAIL_MAX = 160;
const SENHA_MAX = 200;
const SENHA_MIN = 8;

// O que a barbearia ganha, dito em frase de dono, não em nome de
// funcionalidade. É o lado esquerdo da tela (screens.md, Onda 1).
const GANHOS = [
  "Link próprio pros clientes marcarem sozinhos, a qualquer hora",
  "Lembrete por e-mail, com confirmar ou cancelar num toque",
  "A agenda de cada profissional da equipe, num lugar só",
];

// O cadastro do dono (Onda 1, F1). Era o modo "criar" do /painel/entrar;
// virou tela própria porque quem chega pra criar uma conta precisa saber
// o que vai ganhar, e quem chega pra entrar não precisa ler isso.
export function CadastroDoDono() {
  const router = useRouter();
  const api = useApiDoPainel();

  const [nomeDaBarbearia, setNomeDaBarbearia] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto o dono não mexe no link, ele acompanha o nome. Depois que
  // mexe, o nome não sobrescreve mais o que ele escolheu — e apagar o
  // campo inteiro devolve a sugestão.
  const [slugEditado, setSlugEditado] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroSlug, setErroSlug] = useState<string | undefined>();
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  function mudarNomeDaBarbearia(proximo: string) {
    setNomeDaBarbearia(proximo);
    if (!slugEditado) {
      setSlug(sugerirSlug(proximo));
      setErroSlug(undefined);
    }
  }

  async function submeter() {
    setAviso(undefined);
    setErroSlug(undefined);
    setErroEmail(undefined);
    setErroSenha(undefined);

    if (!FORMATO_DO_SLUG.test(slug)) {
      setErroSlug("Use letras minúsculas, números e hífen, de 3 a 80 caracteres");
      return;
    }
    if (slugReservado(slug)) {
      setErroSlug("Esse link é reservado pelo BarChop. Escolha outro");
      return;
    }
    if (!email.trim()) {
      setErroEmail("Informe seu e-mail");
      return;
    }
    if (senha.length < SENHA_MIN) {
      setErroSenha("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    setEnviando(true);
    let sessao: SessaoBarbeiro | undefined;
    try {
      sessao = await api.barbeiro.signup({
        barbearia: { nome: nomeDaBarbearia.trim(), slug },
        barbeiro: { nome: nome.trim(), email, senha },
      });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "conflito") {
        // Sem dizer qual dos dois: a sondagem que o 409 já permite é
        // dívida conhecida, e não vale ampliá-la na tela.
        setAviso("Esse e-mail ou esse endereço já está em uso.");
      } else if (erro.codigo === "tentativas_excedidas") {
        setAviso(erro.mensagem || "Muitas tentativas. Espere um pouco antes de tentar de novo.");
      } else {
        setAviso(erro.mensagem || "Não foi possível criar a barbearia agora.");
      }
    }
    setEnviando(false);

    // Fora do try: falha ao guardar não é recusa da API.
    if (sessao) {
      sessaoDoBarbeiro.gravar(sessao.token);
      sessaoDaBarbearia.gravar(sessao.barbearia.slug);
      router.push("/painel");
    }
  }

  return (
    <main className={estilos.pagina}>
      <section className={estilos.promessa}>
        <p className={estilos.marca}>BarChop</p>
        <h1 className={estilos.titulo}>Crie sua barbearia</h1>
        <p className={estilos.subtitulo}>
          Em dois minutos ela está no ar. Depois, o painel mostra os próximos passos.
        </p>
        <ul className={estilos.ganhos}>
          {GANHOS.map((ganho) => (
            <li key={ganho}>{ganho}</li>
          ))}
        </ul>
        <MiniPainel />
      </section>

      <section className={estilos.cadastro} aria-label="Seus dados">
        {/* <form> pelo Enter e pelo gerenciador de senhas; `noValidate`
            pras mensagens desta tela, e não a bolha do navegador. */}
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void submeter();
          }}
        >
          <Campo
            rotulo="Nome da barbearia"
            name="nomeDaBarbearia"
            autoComplete="organization"
            maxLength={NOME_MAX}
            // A tela existe pra uma coisa só: quem chegou já quer digitar.
            autoFocus
            valor={nomeDaBarbearia}
            onChange={mudarNomeDaBarbearia}
          />
          {/* A prévia no `apoio`: pertence ao campo e o leitor de tela a
              anuncia junto do rótulo. É este endereço que vai no WhatsApp. */}
          <Campo
            rotulo="Endereço do link"
            apoio={`O link dos seus clientes: ${enderecoDaBarbearia(slug || "sua-barbearia", process.env.NEXT_PUBLIC_URL_DO_SITE)}`}
            name="slug"
            autoComplete="off"
            maxLength={SLUG_MAX}
            valor={slug}
            onChange={(proximo) => {
              setSlug(proximo);
              setSlugEditado(proximo !== "");
              setErroSlug(undefined);
            }}
            erro={erroSlug}
          />
          <Campo
            rotulo="Seu nome"
            name="nome"
            autoComplete="name"
            maxLength={NOME_MAX}
            valor={nome}
            onChange={setNome}
          />
          {/* "username" e "new-password": o par que faz o gerenciador de
              senhas oferecer uma senha forte e salvar a conta nova. */}
          <Campo
            rotulo="E-mail"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            maxLength={EMAIL_MAX}
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
            autoComplete="new-password"
            apoio="Mínimo de 8 caracteres"
            maxLength={SENHA_MAX}
            valor={senha}
            onChange={(proximo) => {
              setSenha(proximo);
              setErroSenha(undefined);
            }}
            erro={erroSenha}
          />

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Criar e entrar
          </Botao>
        </form>

        <p className={estilos.troca}>
          Já tem conta?{" "}
          <Link href="/painel/entrar" className={estilos.link}>
            Entrar
          </Link>
        </p>
      </section>
    </main>
  );
}

// Um pedaço do painel que a barbearia vai ter: o dia com os clientes e
// o selo de quem confirmou. Ilustração — o leitor de tela pula, porque
// os ganhos acima já dizem o mesmo em texto.
function MiniPainel() {
  const linhas = [
    { hora: "09:00", cliente: "João", servico: "Corte", confirmou: true },
    { hora: "10:30", cliente: "Pedro", servico: "Barba", confirmou: true },
    { hora: "11:15", cliente: "Lucas", servico: "Corte e barba", confirmou: false },
  ];
  return (
    <div className={estilos.mini} aria-hidden="true">
      <p className={estilos.miniTitulo}>Hoje</p>
      <ul className={estilos.miniLista}>
        {linhas.map((linha) => (
          <li key={linha.hora} className={estilos.miniLinha}>
            <span className={estilos.miniHora}>{linha.hora}</span>
            <span>
              {linha.cliente} · {linha.servico}
            </span>
            {linha.confirmou ? <span className={estilos.selo}>✓ confirmou</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
