"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@gr-barber/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@gr-barber/formato";
import type { SessaoCliente } from "@gr-barber/types";
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
const TELEFONE_MAX = 20;
const SENHA_MAX = 200;

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

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  // Erro de nome é do campo, não da tentativa: sem isso, um nome em
  // branco no primeiro acesso ia até a API, voltava 400 do AJV com a
  // mensagem do schema em inglês, e caía no aviso genérico — no lugar
  // reservado pra "telefone ou senha incorretos".
  const [erroNome, setErroNome] = useState<string | undefined>();
  // Erro de telefone é do campo, não da tentativa: um DDD faltando é
  // problema de digitação, e misturar com o aviso da API faria um
  // telefone incompleto aparecer como se a senha estivesse errada.
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();
  // Mesmo motivo do erro de nome: sem isso, senha em branco ou curta
  // ia até a API e voltava com a mensagem do AJV em inglês — "body/senha
  // must NOT have fewer than 8 characters" — no lugar reservado pra
  // "telefone ou senha incorretos".
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  // Aviso é o que a API respondeu numa tentativa válida — nao_autenticado
  // no login, conflito no primeiro acesso, ou qualquer outra falha.
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  // Quem escolhe entre entrar e primeiro acesso é a pessoa: não existe
  // rota pública que responda se um telefone já tem senha, e perguntar
  // seria a sondagem que o 409 do signup já permite.
  async function submeter(acao: "entrar" | "primeiro-acesso") {
    setAviso(undefined);
    // Limpos antes de qualquer validação rodar, não dentro do próprio
    // `if` que a aprova: um telefone inválido retorna cedo, e limpar
    // erroSenha só no `if` da senha nunca chegava a rodar — um erro de
    // senha de uma tentativa anterior sobrevivia a um telefone que
    // falhou depois.
    setErroTelefone(undefined);
    setErroSenha(undefined);

    // Só o primeiro acesso manda nome — o login nem tem esse campo no
    // schema. Checar sem essa condição quebraria "entrar" pra quem
    // nunca digitou nome nenhum.
    const nomeAparado = nome.trim();
    if (acao === "primeiro-acesso") {
      if (!nomeAparado) {
        setErroNome("Informe seu nome");
        return;
      }
      setErroNome(undefined);
    } else {
      // "Entrar" nem manda esse campo — sem isso, o erro de um
      // primeiro acesso em branco ficava preso na tela embaixo de um
      // campo que esta ação não usa.
      setErroNome(undefined);
    }

    let numero: string;
    try {
      // A mesma função que a API usa pra guardar o telefone. Barrar
      // aqui evita a ida e volta que voltaria 400 sem dizer o que
      // fazer, e mantém o erro no campo certo.
      numero = normalizarTelefoneObrigatorio(telefone);
    } catch (causa) {
      setErroTelefone(
        causa instanceof TelefoneInvalido
          ? "Informe o DDD e o número, como (11) 99999-8888"
          : "Telefone inválido"
      );
      return;
    }

    // A API só exige 8 caracteres no primeiro acesso — o login aceita
    // qualquer senha já cadastrada e reage com nao_autenticado se ela
    // não bater. Em branco é problema nos dois casos.
    if (!senha) {
      setErroSenha("Informe sua senha");
      return;
    }
    if (acao === "primeiro-acesso" && senha.length < 8) {
      setErroSenha("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    setEnviando(true);

    let sessao: SessaoCliente | undefined;
    try {
      sessao =
        acao === "entrar"
          ? await api.publico.loginCliente(slug, { telefone: numero, senha })
          : await api.publico.signupCliente(slug, {
              nome: nomeAparado,
              telefone: numero,
              senha,
            });
    } catch (causa) {
      const erro = causa as ErroDaApi;

      // Um código só: as duas rotas de login respondem
      // `credenciais_invalidas`. O `nao_autenticado` que esta tela
      // também aceitava era o desvio desta rota, já corrigido — e ele
      // continua existindo na API, mas significando outra coisa (token
      // ausente ou expirado), que num login sem token não acontece.
      if (erro.codigo === "credenciais_invalidas") {
        setAviso("Telefone ou senha incorretos.");
      } else if (erro.codigo === "conflito") {
        setAviso("Esse telefone já tem senha. Use Entrar.");
      } else if (erro.codigo === "tentativas_excedidas") {
        // Dizer que foi o limite, e não "senha incorreta", é o que evita
        // a pessoa certa duvidar de uma senha que estava certa. A
        // mensagem da API já diz quanto esperar.
        setAviso(
          erro.mensagem ||
            "Muitas tentativas. Espere um pouco antes de tentar de novo."
        );
      } else {
        setAviso(erro.mensagem || "Não foi possível continuar agora.");
      }
    }

    setEnviando(false);

    // Fora do try: falha ao guardar o token não é recusa da API, e
    // mostrá-la como tal mandaria a pessoa duvidar da senha que estava
    // certa.
    if (sessao) {
      sessaoDoCliente(slug).gravar(sessao.token);
      router.push(destino);
    }
  }

  return (
    <main className={estilos.pagina}>
      <h1>Minha conta</h1>

      {/* <form> e não um <div> com onClick: sem ele o Enter não envia, e
          o gerenciador de senhas do celular não reconhece o par
          telefone/senha pra preencher nem pra salvar — e este fluxo
          chega por link de WhatsApp, quase sempre no celular. O Enter
          envia "entrar", que é a ação de quem já tem conta; o primeiro
          acesso acontece uma vez só e continua sendo um clique. */}
      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void submeter("entrar");
        }}
      >
        <Campo
          rotulo="Nome (só no primeiro acesso)"
          autoComplete="name"
          maxLength={NOME_MAX}
          valor={nome}
          onChange={(proximo) => {
            setNome(proximo);
            setErroNome(undefined);
          }}
          erro={erroNome}
        />
        {/* `inputMode="tel"` e não `type="tel"`: o teclado do celular
            abre numérico do mesmo jeito, e o campo continua uma string
            comum — que é o que o formatarTelefoneParcial do Campo
            reescreve a cada tecla. Mesmo motivo do CadastroDeCliente. */}
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
        {/* "current-password" e não "new-password" porque o Enter e o
            botão principal são o login; no primeiro acesso o navegador
            ainda oferece salvar a senha que acabou de ser digitada. */}
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

        <div className={estilos.acoes}>
          <Botao type="submit" carregando={enviando}>
            Entrar
          </Botao>
          {/* `type="button"` porque agora ele está DENTRO do form, e um
              <button> sem type é submit — o primeiro acesso viraria
              login, que é justamente o que falha pra quem ainda não tem
              senha. */}
          <Botao
            type="button"
            variante="contorno"
            carregando={enviando}
            onClick={() => submeter("primeiro-acesso")}
          >
            Primeiro acesso
          </Botao>
        </div>
      </form>
    </main>
  );
}
