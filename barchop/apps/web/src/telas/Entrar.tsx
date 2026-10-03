"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import {
  normalizarEmail,
  normalizarTelefoneObrigatorio,
  TelefoneInvalido,
} from "@barchop/formato";
import type { SessaoCliente } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { caminhoDoPasso, lerEscolhas, passoDoVoltar } from "../fluxo/passos";
import { sessaoDoCliente } from "../sessao/armazenamento";
import estilos from "./Entrar.module.css";

// Os mesmos limites dos schemas de apps/api/src/routers/auth-cliente.ts.
// Cortar na digitação evita o 400 que voltaria sem dizer qual campo
// passou do tamanho.
const NOME_MAX = 120;
const EMAIL_MAX = 160;
const TELEFONE_MAX = 20;
const SENHA_MAX = 200;
const SENHA_MIN = 8;
// O mesmo PADRAO_EMAIL da API (apps/api/src/lib/padroes.ts).
const PARECE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// "entrar" é o login. "codigo" é primeiro acesso E esqueci a senha, que
// pro cliente são a mesma coisa: provar o e-mail com o código que chega
// nele, e definir a senha. Quem escolhe é a pessoa — não existe rota
// que responda se um e-mail já tem senha, e não deve existir.
//
// E-mail, e não telefone, desde o piloto da Onda 1: sem a verificação
// da Meta não há WhatsApp, e o código só tem por onde chegar no e-mail.
// O telefone segue no cadastro (é por ele que a barbearia reconhece o
// cliente) e é pedido junto da senha nova.
type Modo = "entrar" | "codigo";

function mensagemDoLimite(erro: ErroDaApi): string {
  // Dizer que foi o limite, e não "senha incorreta", é o que evita a
  // pessoa certa duvidar de uma senha que estava certa. A mensagem da
  // API já diz quanto esperar.
  return erro.mensagem || "Muitas tentativas. Espere um pouco antes de tentar de novo.";
}

export function Entrar() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const query = useSearchParams();
  const api = useApi();

  // Pra onde ir depois de entrar. Quem chega pelo "Já tem conta?" da
  // confirmação do agendamento tem que voltar exatamente pra lá, com os serviços,
  // a data e a hora que já escolheu — senão entrar custa refazer o
  // fluxo, e ninguém faz isso.
  //
  // O `voltar` é o NOME de um passo, não uma URL: o caminho é
  // reconstruído aqui pelo `caminhoDoPasso`, a partir do slug da rota.
  // Um valor que não seja passo conhecido cai no destino padrão — ver
  // o comentário do `caminhoDoLogin` em fluxo/passos.ts.
  const voltar = passoDoVoltar(query.get("voltar"));
  const destino = voltar
    ? caminhoDoPasso(slug, voltar, lerEscolhas(query))
    : `/${slug}/minha-conta`;

  const [modo, setModo] = useState<Modo>("entrar");
  // O e-mail sobrevive à troca de modo: quem errou a senha e foi pro
  // "esqueceu a senha?" não precisa digitá-lo de novo.
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  // O e-mail que recebeu o código, já normalizado. Enquanto é nulo, o
  // modo "codigo" está na primeira etapa (pedir); depois, na segunda
  // (confirmar). É também pra onde o "Reenviar" manda.
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [novaSenha, setNovaSenha] = useState("");

  // Erro de campo é do campo, não da tentativa: um e-mail sem arroba é
  // problema de digitação, e misturar com o aviso da API faria ele
  // aparecer como se a senha estivesse errada.
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroNovaSenha, setErroNovaSenha] = useState<string | undefined>();
  // Aviso é o que a API respondeu numa tentativa válida.
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  function limparErros() {
    setAviso(undefined);
    setErroEmail(undefined);
    setErroTelefone(undefined);
    setErroSenha(undefined);
    setErroCodigo(undefined);
    setErroNome(undefined);
    setErroNovaSenha(undefined);
  }

  function trocarModo(proximo: Modo) {
    limparErros();
    setEnviadoPara(null);
    setCodigo("");
    setModo(proximo);
  }

  // A mesma normalização da API: é o e-mail em minúsculas que ela busca
  // e que vira a chave do código. Barrar aqui evita a ida e volta que
  // voltaria 400 sem dizer o que fazer, e mantém o erro no campo certo.
  function emailValido(): string | null {
    const normalizado = normalizarEmail(email);
    if (!normalizado || !PARECE_EMAIL.test(normalizado)) {
      setErroEmail("Informe um e-mail válido, como voce@exemplo.com");
      return null;
    }
    return normalizado;
  }

  // A mesma função que a API usa pra guardar o telefone.
  function telefoneValido(): string | null {
    try {
      return normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return null;
    }
  }

  // Fora do try de quem chama: falha ao guardar o token não é recusa da
  // API, e mostrá-la como tal mandaria a pessoa duvidar da senha.
  function concluir(sessao: SessaoCliente) {
    sessaoDoCliente(slug).gravar(sessao.token);
    router.push(destino);
  }

  async function entrar() {
    limparErros();
    const endereco = emailValido();
    if (!endereco) return;
    if (!senha) {
      setErroSenha("Informe sua senha");
      return;
    }

    setEnviando(true);
    let sessao: SessaoCliente | undefined;
    try {
      sessao = await api.publico.loginCliente(slug, { email: endereco, senha });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "credenciais_invalidas") {
        setAviso("E-mail ou senha incorretos.");
      } else if (erro.codigo === "tentativas_excedidas") {
        setAviso(mensagemDoLimite(erro));
      } else {
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    }
    setEnviando(false);
    if (sessao) concluir(sessao);
  }

  async function pedirCodigo(para?: string) {
    limparErros();
    const endereco = para ?? emailValido();
    if (!endereco) return;

    setEnviando(true);
    try {
      await api.publico.pedirCodigoDoCliente(slug, { email: endereco });
      setEnviadoPara(endereco);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      setAviso(
        erro.codigo === "tentativas_excedidas"
          ? mensagemDoLimite(erro)
          : erro.mensagem || "Não foi possível mandar o código agora."
      );
    }
    setEnviando(false);
  }

  async function definirSenha() {
    if (!enviadoPara) return;
    limparErros();

    // Os mesmos limites do schema da API, conferidos aqui pra o erro
    // cair no campo — e não voltar como 400 com a mensagem do AJV em
    // inglês no lugar do aviso.
    const codigoLimpo = codigo.replace(/\D/g, "");
    const nomeAparado = nome.trim();
    let invalido = false;
    if (codigoLimpo.length !== 6) {
      setErroCodigo("O código tem 6 dígitos");
      invalido = true;
    }
    if (nomeAparado.length < 2) {
      setErroNome("Informe seu nome");
      invalido = true;
    }
    const numero = telefoneValido();
    if (!numero) invalido = true;
    if (novaSenha.length < SENHA_MIN) {
      setErroNovaSenha(`A senha deve ter pelo menos ${SENHA_MIN} caracteres`);
      invalido = true;
    }
    if (invalido || !numero) return;

    setEnviando(true);
    let sessao: SessaoCliente | undefined;
    try {
      sessao = await api.publico.definirSenhaDoCliente(slug, {
        email: enviadoPara,
        telefone: numero,
        codigo: codigoLimpo,
        senha: novaSenha,
        nome: nomeAparado,
      });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "codigo_invalido") {
        // No campo do código: é ali que a pessoa vai conferir, e o
        // "Reenviar" fica logo abaixo.
        setErroCodigo("Código inválido ou vencido. Confira ou peça outro.");
      } else if (erro.codigo === "telefone_ja_cadastrado") {
        // A API não junta o e-mail a um cadastro do balcão: seria tomar
        // a conta de quem a barbearia cadastrou. Quem junta é a barbearia.
        setAviso(
          "Esse telefone já tem cadastro aqui. Peça pra barbearia incluir seu e-mail nele e tente de novo."
        );
      } else if (erro.codigo === "tentativas_excedidas") {
        setAviso(mensagemDoLimite(erro));
      } else {
        setAviso(erro.mensagem || "Não foi possível salvar a senha agora.");
      }
    }
    setEnviando(false);
    if (sessao) concluir(sessao);
  }

  const campoEmail = (
    <Campo
      rotulo="E-mail"
      inputMode="email"
      autoComplete="email"
      maxLength={EMAIL_MAX}
      valor={email}
      onChange={(proximo) => {
        setEmail(proximo);
        setErroEmail(undefined);
      }}
      erro={erroEmail}
    />
  );

  // `inputMode="tel"` e não `type="tel"`: o teclado do celular abre
  // numérico do mesmo jeito, e o campo continua uma string comum — que é
  // o que o formatarTelefoneParcial do Campo reescreve a cada tecla.
  const campoTelefone = (
    <Campo
      rotulo="Telefone"
      formato="telefone"
      inputMode="tel"
      autoComplete="tel"
      maxLength={TELEFONE_MAX}
      valor={telefone}
      onChange={(proximo) => {
        setTelefone(proximo);
        setErroTelefone(undefined);
      }}
      erro={erroTelefone}
    />
  );

  if (modo === "entrar") {
    return (
      <main className={estilos.pagina}>
        <h1>Minha conta</h1>

        {/* <form> e não um <div> com onClick: sem ele o Enter não envia,
            e o gerenciador de senhas do celular não reconhece o par
            e-mail/senha pra preencher nem pra salvar — e este fluxo
            chega por link de WhatsApp, quase sempre no celular. */}
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void entrar();
          }}
        >
          {campoEmail}
          <Campo
            rotulo="Senha"
            type="password"
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

          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
        </form>

        {/* Fora do form e como link de texto: não envia nada, e um
            segundo botão do mesmo peso se leria como outra forma de
            entrar. */}
        <button type="button" className={estilos.link} onClick={() => trocarModo("codigo")}>
          Primeiro acesso ou esqueceu a senha?
        </button>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Criar ou recuperar senha</h1>

      {enviadoPara === null ? (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void pedirCodigo();
          }}
        >
          <p className={estilos.explicacao}>
            Vamos mandar um código pro seu e-mail. Com ele você cria sua
            senha — ou troca, se esqueceu a sua.
          </p>
          {campoEmail}

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Enviar código
          </Botao>
        </form>
      ) : (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void definirSenha();
          }}
        >
          <p className={estilos.explicacao}>
            Enviamos um código pra <b>{enviadoPara}</b>. Ele vale 10 minutos.
          </p>
          {/* `one-time-code` faz o teclado do celular sugerir o código
              que acabou de chegar; `numeric` abre o teclado de números. */}
          <Campo
            rotulo="Código"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            valor={codigo}
            onChange={(proximo) => {
              setCodigo(proximo);
              setErroCodigo(undefined);
            }}
            erro={erroCodigo}
          />
          <Campo
            rotulo="Seu nome"
            autoComplete="name"
            maxLength={NOME_MAX}
            valor={nome}
            onChange={(proximo) => {
              setNome(proximo);
              setErroNome(undefined);
            }}
            apoio="Se você já tem cadastro aqui, mantemos o nome que está nele."
            erro={erroNome}
          />
          {campoTelefone}
          <Campo
            rotulo="Nova senha"
            type="password"
            autoComplete="new-password"
            maxLength={SENHA_MAX}
            valor={novaSenha}
            onChange={(proximo) => {
              setNovaSenha(proximo);
              setErroNovaSenha(undefined);
            }}
            erro={erroNovaSenha}
          />

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Salvar e entrar
          </Botao>
          <button
            type="button"
            className={estilos.link}
            onClick={() => void pedirCodigo(enviadoPara)}
          >
            Reenviar código
          </button>
        </form>
      )}

      <button type="button" className={estilos.link} onClick={() => trocarModo("entrar")}>
        Voltar pra entrar
      </button>
    </main>
  );
}
