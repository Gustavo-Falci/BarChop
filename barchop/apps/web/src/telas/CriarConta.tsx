"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { SessaoCliente } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { MarcaDeConfirmado } from "../componentes/MarcaDeConfirmado";
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
import { lerCadastroDoAgendamento, limparHorarioConfirmado } from "../fluxo/horarioConfirmado";
import { formatarDataComSemana } from "../formato/datas";
import { IconeSeta } from "../painel/icones";
import { sessaoDoCliente } from "../sessao/armazenamento";
import { linkDoWhatsApp } from "./AvisoDoPrazo";
import estilos from "./Entrar.module.css";

// Criar conta (06/11), separado de "recuperar senha": antes os dois eram
// a mesma tela, escondida atrás do "Receber um código no e-mail", e
// ninguém achava onde criar a conta.
//
// Etapas: os dados (nome, telefone, e-mail) → o código que chegou no
// e-mail e a senha → pronta (a conta, com os horários que a API juntou)
// ou histórico (o telefone tem cadastro que a API não junta sozinha:
// quem junta é a barbearia).
//
// Vindo do "Criar conta" da tela de sucesso, o formulário chega
// preenchido com o que a pessoa digitou ao agendar, e o token daquele
// agendamento vai junto pra API juntar o cadastro que nasceu nele.
type Etapa = "dados" | "codigo" | "pronta" | "historico";

// O que foi pedido na etapa dos dados, já conferido: é o que vai pra API
// na etapa do código, mesmo que a pessoa volte e mexa nos campos.
interface Pedido {
  nome: string;
  telefone: string;
  email: string;
}

export function CriarConta({
  slug,
  destino,
  aoEntrar,
}: {
  slug: string;
  // Pra onde o "Ver meus horários" leva: o mesmo destino do Entrar.
  destino: string;
  aoEntrar: () => void;
}) {
  const api = useApi();
  const [doAgendamento] = useState(() => lerCadastroDoAgendamento(slug));

  const [etapa, setEtapa] = useState<Etapa>("dados");
  const [nome, setNome] = useState(doAgendamento?.nome ?? "");
  const [telefone, setTelefone] = useState(doAgendamento?.telefone ?? "");
  const [email, setEmail] = useState(doAgendamento?.email ?? "");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");

  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  function limparErros() {
    setAviso(undefined);
    setErroNome(undefined);
    setErroTelefone(undefined);
    setErroEmail(undefined);
    setErroCodigo(undefined);
    setErroSenha(undefined);
  }

  async function mandarCodigo() {
    limparErros();
    const nomeAparado = nome.trim();
    const numero = conferirTelefone(telefone);
    const endereco = conferirEmail(email);
    if (nomeAparado.length < 2) setErroNome("Informe seu nome");
    if (numero.erro) setErroTelefone(numero.erro);
    if (endereco.erro) setErroEmail(endereco.erro);
    if (nomeAparado.length < 2 || !numero.valor || !endereco.valor) return;

    setEnviando(true);
    try {
      await api.publico.pedirCodigoDoCliente(slug, { email: endereco.valor });
      setPedido({ nome: nomeAparado, telefone: numero.valor, email: endereco.valor });
      setCodigo("");
      setEtapa("codigo");
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

  async function reenviar() {
    if (!pedido) return;
    limparErros();
    try {
      await api.publico.pedirCodigoDoCliente(slug, { email: pedido.email });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      setAviso(
        erro.codigo === "tentativas_excedidas"
          ? mensagemDoLimite(erro)
          : erro.mensagem || "Não foi possível mandar o código agora."
      );
    }
  }

  async function criar() {
    if (!pedido) return;
    limparErros();
    const codigoLimpo = codigo.replace(/\D/g, "");
    let invalido = false;
    if (codigoLimpo.length !== 6) {
      setErroCodigo("O código tem 6 dígitos");
      invalido = true;
    }
    if (senha.length < SENHA_MIN) {
      setErroSenha(`A senha deve ter pelo menos ${SENHA_MIN} caracteres`);
      invalido = true;
    }
    if (invalido) return;

    setEnviando(true);
    let sessao: SessaoCliente | undefined;
    try {
      sessao = await api.publico.definirSenhaDoCliente(slug, {
        email: pedido.email,
        telefone: pedido.telefone,
        nome: pedido.nome,
        codigo: codigoLimpo,
        senha,
        // Só se o telefone ainda é o do agendamento: com outro número, o
        // token não prova nada, e a API o ignoraria de qualquer jeito.
        ...(doAgendamento?.tokenDaConta && mesmoTelefone(doAgendamento.telefone, pedido.telefone)
          ? { tokenDaConta: doAgendamento.tokenDaConta }
          : {}),
      });
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "codigo_invalido") {
        setErroCodigo("Código inválido ou vencido. Confira ou peça outro.");
      } else if (erro.codigo === "telefone_ja_cadastrado") {
        setEtapa("historico");
      } else if (erro.codigo === "tentativas_excedidas") {
        setAviso(mensagemDoLimite(erro));
      } else {
        setAviso(erro.mensagem || "Não foi possível criar a conta agora.");
      }
    }
    setEnviando(false);
    if (sessao) {
      sessaoDoCliente(slug).gravar(sessao.token);
      // Com a conta, o cartão do link na tela de sucesso perdeu a razão
      // de existir: o horário está na Minha conta.
      limparHorarioConfirmado();
      setEtapa("pronta");
    }
  }

  if (etapa === "pronta") {
    return <ContaPronta destino={destino} />;
  }

  if (etapa === "historico" && pedido) {
    return (
      <TelefoneComHistorico
        slug={slug}
        pedido={pedido}
        aoTrocarTelefone={() => {
          limparErros();
          setEtapa("dados");
        }}
      />
    );
  }

  if (etapa === "codigo" && pedido) {
    return (
      <main className={estilos.pagina}>
        <button
          type="button"
          className={estilos.voltar}
          onClick={() => {
            limparErros();
            setEtapa("dados");
          }}
        >
          <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
          Corrigir os dados
        </button>

        <div className={estilos.cabecalho}>
          <h1>Confirme seu e-mail</h1>
          <p className={estilos.apoio}>
            Enviamos um código pra <b>{pedido.email}</b>. Ele vale 10 minutos.
          </p>
        </div>

        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
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
            rotulo="Crie uma senha"
            type="password"
            autoComplete="new-password"
            maxLength={SENHA_MAX}
            apoio={`Pelo menos ${SENHA_MIN} caracteres.`}
            valor={senha}
            onChange={(proximo) => {
              setSenha(proximo);
              setErroSenha(undefined);
            }}
            erro={erroSenha}
          />

          {aviso ? <Aviso>{aviso}</Aviso> : null}

          <Botao type="submit" carregando={enviando}>
            Criar conta
          </Botao>
        </form>

        <div className={estilos.outroCaminho}>
          <p className={estilos.pergunta}>Não chegou? Olhe o spam.</p>
          <button type="button" className={estilos.link} onClick={() => void reenviar()}>
            Mandar outro código
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <button type="button" className={estilos.voltar} onClick={aoEntrar}>
        <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
        Já tenho conta
      </button>

      <div className={estilos.cabecalho}>
        <h1>Criar conta</h1>
        <p className={estilos.apoio}>
          Com a conta você vê, remarca e cancela seus horários sem precisar guardar link.
        </p>
      </div>

      {doAgendamento ? (
        <Aviso tom="sucesso">
          Trouxemos o que você digitou no agendamento. O horário de{" "}
          {formatarDataComSemana(doAgendamento.agendamento.data)}, às{" "}
          {doAgendamento.agendamento.horaInicio}, entra na conta.
        </Aviso>
      ) : null}

      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void mandarCodigo();
        }}
      >
        <Campo
          rotulo="Nome"
          autoComplete="name"
          maxLength={NOME_MAX}
          valor={nome}
          onChange={(proximo) => {
            setNome(proximo);
            setErroNome(undefined);
          }}
          erro={erroNome}
        />
        {/* `inputMode="tel"` e não `type="tel"`: o teclado abre numérico
            do mesmo jeito, e o Campo reescreve a máscara a cada tecla. */}
        <Campo
          rotulo="Telefone"
          formato="telefone"
          inputMode="tel"
          autoComplete="tel"
          maxLength={TELEFONE_MAX}
          apoio="O mesmo que você usa pra agendar: é por ele que a barbearia te reconhece."
          valor={telefone}
          onChange={(proximo) => {
            setTelefone(proximo);
            setErroTelefone(undefined);
          }}
          erro={erroTelefone}
        />
        <Campo
          rotulo="E-mail"
          inputMode="email"
          autoComplete="email"
          maxLength={EMAIL_MAX}
          apoio="Mandamos um código pra confirmar que é seu."
          valor={email}
          onChange={(proximo) => {
            setEmail(proximo);
            setErroEmail(undefined);
          }}
          erro={erroEmail}
        />

        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <Botao type="submit" carregando={enviando}>
          Mandar o código
        </Botao>
      </form>
    </main>
  );
}

function mesmoTelefone(a: string, b: string): boolean {
  return a.replace(/\D/g, "") === b.replace(/\D/g, "");
}

const MARCADO = new Set(["pendente", "confirmado"]);

// A conta pronta, com os horários que a API juntou a ela. Sem nenhum
// (telefone novo, cadastro sem horário marcado), carregando ou com a
// lista falhando, só a confirmação: a sessão já está gravada, e o botão
// leva pra Minha conta, que mostra o erro se houver.
function ContaPronta({ destino }: { destino: string }) {
  const api = useApi();
  const { dados } = useRequisicao(() => api.cliente.meusAgendamentos(), []);
  const marcados = (dados ?? [])
    .filter((a) => MARCADO.has(a.status))
    .sort((a, b) => `${a.data} ${a.horaInicio}`.localeCompare(`${b.data} ${b.horaInicio}`));

  return (
    <main className={estilos.pagina}>
      <div className={estilos.pronta}>
        <MarcaDeConfirmado />
        <div className={estilos.cabecalho}>
          <h1>Conta criada</h1>
          <p className={estilos.apoio}>
            {marcados.length > 0
              ? "Os horários que você marcou com este telefone já estão nela."
              : "Sua conta está pronta."}
          </p>
        </div>
      </div>

      {marcados.length > 0 ? (
        <ul className={estilos.horarios}>
          {marcados.map((agendamento) => (
            <li key={agendamento.id}>
              <span className={estilos.quando}>
                {agendamento.horaInicio} · {formatarDataComSemana(agendamento.data)}
              </span>
              <span className={estilos.oQue}>
                {agendamento.servicos.map((s) => s.nome).join(", ")} · com{" "}
                {agendamento.barbeiro.nome}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <BotaoLink href={destino}>Ver meus horários</BotaoLink>
    </main>
  );
}

// O telefone tem cadastro que a API não junta sozinha (do balcão, com
// horário marcado sem este e-mail, ou com plano). Quem junta é a
// barbearia, incluindo o e-mail no cadastro; depois, criar a conta com o
// mesmo e-mail acha o cadastro por ele.
function TelefoneComHistorico({
  slug,
  pedido,
  aoTrocarTelefone,
}: {
  slug: string;
  pedido: Pedido;
  aoTrocarTelefone: () => void;
}) {
  const api = useApi();
  const perfil = useRequisicao(() => api.publico.perfilDaBarbearia(slug), [slug]);
  const nomeDaBarbearia = perfil.dados?.nome ?? "A barbearia";
  const whatsapp = perfil.dados?.whatsapp ?? null;
  const telefoneDaCasa = perfil.dados?.telefone ?? null;
  const texto =
    `Oi! Quero criar minha conta no site. Podem incluir o e-mail ${pedido.email} ` +
    `no meu cadastro, do telefone ${pedido.telefone}?`;

  return (
    <main className={estilos.pagina}>
      <div className={estilos.cabecalho}>
        <h1>Esse telefone já tem histórico aqui</h1>
        <p className={estilos.apoio}>
          {nomeDaBarbearia} já atende o <b className={estilos.semQuebra}>{pedido.telefone}</b>. Pra proteger esse histórico, quem
          junta ele à sua conta é a barbearia.
        </p>
      </div>

      <ol className={estilos.passos}>
        <li>
          <span>
            <b>Peça pra barbearia</b> incluir o seu e-mail no cadastro.
            {whatsapp ? " A mensagem já vai pronta." : null}
          </span>
        </li>
        <li>
          <span>
            <b>Depois, volte aqui</b> e crie a conta com o mesmo e-mail. Tudo o que você já fez na
            barbearia aparece nela.
          </span>
        </li>
      </ol>

      <div className={estilos.acoes}>
        {whatsapp ? (
          <BotaoLink href={`${linkDoWhatsApp(whatsapp)}?text=${encodeURIComponent(texto)}`} externo>
            Pedir pelo WhatsApp
          </BotaoLink>
        ) : telefoneDaCasa ? (
          <BotaoLink href={`tel:${telefoneDaCasa.replace(/\D/g, "")}`}>
            Ligar pra barbearia
          </BotaoLink>
        ) : null}
        <Botao variante="fantasma" onClick={aoTrocarTelefone}>
          Usar outro telefone
        </Botao>
      </div>

      <p className={estilos.semConta}>Seus horários continuam marcados. Pra agendar não precisa de conta.</p>
    </main>
  );
}
