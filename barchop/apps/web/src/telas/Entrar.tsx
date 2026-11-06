"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoCliente } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import {
  conferirEmail,
  conferirTelefone,
  EMAIL_MAX,
  mensagemDoLimite,
  NOME_MAX,
  SENHA_MAX,
  SENHA_MIN,
  TELEFONE_MAX,
} from "../fluxo/contaDoCliente";
import { caminhoDoPasso, lerEscolhas, passoDoVoltar } from "../fluxo/passos";
import { caminhoDosPlanos, planoDaQuery, queryDaVolta, voltaDoPagamento } from "../fluxo/planos";
import { IconeSeta } from "../painel/icones";
import { sessaoDoCliente } from "../sessao/armazenamento";
import { CriarConta } from "./CriarConta";
import estilos from "./Entrar.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";

// "entrar" é o login. "recuperar" é o esqueci a senha: provar o e-mail
// com o código que chega nele, e definir a senha. "criar" é a conta nova
// (CriarConta.tsx, 06/11). Recuperar e criar usam a mesma rota da API —
// quem escolhe é a pessoa, e não existe rota que responda se um e-mail
// já tem senha, nem deve existir. Separados na tela porque, juntos atrás
// de "Receber um código no e-mail", ninguém achava onde criar a conta.
//
// E-mail, e não telefone, desde o piloto da Onda 1: sem a verificação
// da Meta não há WhatsApp, e o código só tem por onde chegar no e-mail.
// O telefone segue no cadastro (é por ele que a barbearia reconhece o
// cliente) e é pedido junto da senha nova.
type Modo = "entrar" | "recuperar" | "criar";

export function Entrar() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const noHost = useNoHost();
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
  //
  // `voltar=planos` é quem tocou em "Assinar" nos planos sem estar
  // logado: volta pro plano escolhido, que o cliente assina com mais um
  // toque (assinar nunca acontece sozinho).
  //
  // Quem voltou da InfinitePay sem a sessão (o link do e-mail aberto em
  // outro navegador) entra e cai na Minha conta com o pagamento a
  // conferir (PR 7b do plano pagamentos-online-infinitepay).
  const voltar = passoDoVoltar(query.get("voltar"));
  const escolhas = lerEscolhas(query);
  const volta = voltaDoPagamento(query);
  const destino = voltar
    ? noHost(caminhoDoPasso(slug, voltar, escolhas))
    : query.get("voltar") === "planos"
      ? noHost(caminhoDosPlanos(slug, planoDaQuery(query.get("plano"))))
      : volta
        ? noHost(`/${slug}/minha-conta?${queryDaVolta(volta)}`)
        : noHost(`/${slug}/minha-conta`);

  // `?criar=1` é o "Criar conta" da tela de sucesso do agendamento.
  const [modo, setModo] = useState<Modo>(() => (query.get("criar") ? "criar" : "entrar"));
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
    const conferido = conferirEmail(email);
    if (conferido.erro) setErroEmail(conferido.erro);
    return conferido.valor ?? null;
  }

  function telefoneValido(): string | null {
    const conferido = conferirTelefone(telefone);
    if (conferido.erro) setErroTelefone(conferido.erro);
    return conferido.valor ?? null;
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

  // "Pra agendar não precisa de conta" (onda B): quem chegou aqui achando
  // que precisava entrar pra marcar fica sabendo que não. Vindo de um
  // passo do agendamento, o link volta pra ele com tudo o que já foi
  // escolhido; mandar pro passo 1 jogaria isso fora. No remarcar não
  // aparece: remarcar é do cliente que tem conta, e a frase seria falsa.
  const semConta = escolhas.remarcar ? null : (
    <p className={estilos.semConta}>
      Pra agendar não precisa de conta:{" "}
      {voltar ? (
        <Link href={destino}>voltar ao agendamento</Link>
      ) : (
        <Link href={noHost(caminhoDoPasso(slug, "servicos", { servicoIds: [] }))}>
          escolha um horário
        </Link>
      )}
      .
    </p>
  );

  if (modo === "entrar") {
    return (
      <main className={estilos.pagina}>
        {/* Sem o nome da barbearia no apoio (a prancha tinha): a barra
            logo acima já diz de quem é a página, e o nome aqui custaria
            mais uma busca do perfil só pra repetir. */}
        <div className={estilos.cabecalho}>
          <h1>Entrar</h1>
          <p className={estilos.apoio}>Pra ver, remarcar e cancelar seus horários.</p>
        </div>

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
          {/* Colado no campo da senha: é dela que a pessoa esqueceu. */}
          <button type="button" className={estilos.esqueci} onClick={() => trocarModo("recuperar")}>
            Esqueci minha senha
          </button>

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
        </form>

        {/* Criar conta à vista (06/11), separado do login por uma linha e
            em contorno: o Entrar continua sendo o botão cheio da tela. */}
        <div className={estilos.outroCaminho}>
          <p className={estilos.primeiraVez}>Primeira vez aqui?</p>
          <p className={estilos.pergunta}>
            Crie sua conta com o telefone que você usa pra agendar. Os horários que já marcou com
            ele vêm junto.
          </p>
          <Botao variante="contorno" onClick={() => trocarModo("criar")}>
            Criar conta
          </Botao>
        </div>

        {semConta}
      </main>
    );
  }

  if (modo === "criar") {
    return <CriarConta slug={slug} destino={destino} aoEntrar={() => trocarModo("entrar")} />;
  }

  return (
    <main className={estilos.pagina}>
      {/* No topo, como o voltar dos passos do agendamento: é o caminho
          de volta, e não mais uma ação da tela. */}
      <button type="button" className={estilos.voltar} onClick={() => trocarModo("entrar")}>
        <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
        Entrar com senha
      </button>

      <div className={estilos.cabecalho}>
        <h1>Recuperar senha</h1>
        <p className={estilos.apoio}>
          {enviadoPara === null ? (
            "Vamos mandar um código pro seu e-mail. Com ele você cria uma senha nova."
          ) : (
            <>
              Enviamos um código pra <b>{enviadoPara}</b>. Ele vale 10 minutos.
            </>
          )}
        </p>
      </div>

      {enviadoPara === null ? (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void pedirCodigo();
          }}
        >
          {campoEmail}

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Mandar o código
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

      <p className={estilos.semConta}>
        Ainda não tem conta?{" "}
        <button type="button" className={estilos.linkNoTexto} onClick={() => trocarModo("criar")}>
          Criar conta
        </button>
      </p>
    </main>
  );
}
