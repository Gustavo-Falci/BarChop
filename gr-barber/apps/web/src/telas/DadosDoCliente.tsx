"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { caminhoDoLogin, caminhoDoPasso } from "../fluxo/passos";
import { gravarDadosDoCliente, lerDadosDoCliente } from "../fluxo/dadosDoCliente";
import { useContaDoCliente, validarDados } from "../fluxo/identificacao";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import estilos from "./DadosDoCliente.module.css";

// `agora` é prop com padrão, mesma forma das outras telas do fluxo
// (EscolhaDaData): é o que permite ao teste desta
// tela fixar "hoje" sem depender do relógio real da máquina.
export function DadosDoCliente({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, data, hora, remarcar, pronto } = usePassoDoFluxo(
    "dados",
    agora
  );
  const router = useRouter();
  const { conta, esquecer } = useContaDoCliente(slug);
  // Só vale quando não há conta: é a escolha entre os dois caminhos.
  // Começa falso porque a pergunta vem antes do formulário.
  const [semConta, setSemConta] = useState(false);

  const guardados = lerDadosDoCliente();
  const [nome, setNome] = useState(guardados?.nome ?? "");
  const [telefone, setTelefone] = useState(guardados?.telefone ?? "");
  // Um erro por campo, não um só: a mensagem precisa apontar o campo
  // que está errado, senão nome vazio mostra a instrução de DDD do
  // telefone, que está correto.
  const [erroNome, setErroNome] = useState<string | undefined>();
  const [erroTelefone, setErroTelefone] = useState<string | undefined>();

  if (!pronto) return null;
  if (conta === null) return <main className={estilos.pagina}>Carregando…</main>;

  function seguirPara(dados: { nome: string; telefone: string }) {
    gravarDadosDoCliente(dados);
    router.push(
      caminhoDoPasso(slug, "confirmar", { servicoIds, data, hora, remarcar })
    );
  }

  function continuar() {
    const validacao = validarDados(nome, telefone);
    if (!validacao.ok) {
      setErroNome(validacao.erros.nome);
      setErroTelefone(validacao.erros.telefone);
      return;
    }
    setErroNome(undefined);
    setErroTelefone(undefined);
    seguirPara(validacao.dados);
  }

  // Está logada: o nome e o telefone vêm do cadastro, e a tela só
  // confirma quem vai ser atendido. Sem isto, agendar logado era
  // indistinguível de agendar sem conta — os campos vinham preenchidos
  // em silêncio, e num celular emprestado isso marca pra outra pessoa.
  if (conta !== false) {
    const identificado = { nome: conta.nome, telefone: conta.telefone };

    return (
      <main className={estilos.pagina}>
        <h1>Confirme quem vai ser atendido</h1>

        <div className={estilos.identidade}>
          <p className={estilos.identidadeNome}>{conta.nome}</p>
          <p className={estilos.identidadeTelefone}>{conta.telefone}</p>
        </div>

        <Botao onClick={() => seguirPara(identificado)}>Continuar</Botao>

        {/* Sai da conta e volta pra bifurcação SEM navegar: a URL
            carrega os serviços, a data e a hora já escolhidos, e
            empurrar outra rota custaria refazer o fluxo. */}
        <p className={estilos.troca}>
          Não é você?{" "}
          <button
            type="button"
            className={estilos.link}
            onClick={() => {
              esquecer();
              setNome("");
              setTelefone("");
            }}
          >
            Agendar para outra pessoa
          </button>
        </p>
      </main>
    );
  }

  // Sem conta e ainda sem ter escolhido o caminho: a pergunta.
  if (!semConta) {
    return (
      <main className={estilos.pagina}>
        <h1>Quem é você?</h1>
        <p className={estilos.explicacao}>
          Dá pra agendar sem criar conta. Se você já tem uma aqui, entrar traz
          seus dados e deixa o agendamento junto do seu histórico.
        </p>

        <div className={estilos.acoes}>
          <Botao onClick={() => setSemConta(true)}>Continuar sem conta</Botao>
          <Botao
            variante="contorno"
            onClick={() =>
              router.push(
                caminhoDoLogin(slug, "dados", { servicoIds, data, hora, remarcar })
              )
            }
          >
            Já tenho conta
          </Botao>
        </div>
      </main>
    );
  }

  return (
    <main className={estilos.pagina}>
      <h1>Seus dados</h1>
      <Campo
        rotulo="Nome"
        valor={nome}
        // Mensagem que sobrevive à correção faz o formulário parecer
        // travado: limpar no próprio onChange já tira o erro assim que
        // a pessoa volta a digitar, antes mesmo do próximo Continuar.
        onChange={(proximo) => {
          setNome(proximo);
          setErroNome(undefined);
        }}
        erro={erroNome}
      />
      <Campo
        rotulo="Telefone (WhatsApp)"
        formato="telefone"
        valor={telefone}
        onChange={(proximo) => {
          setTelefone(proximo);
          setErroTelefone(undefined);
        }}
        erro={erroTelefone}
      />
      <Botao onClick={continuar}>Continuar</Botao>

      <p className={estilos.troca}>
        <button
          type="button"
          className={estilos.link}
          onClick={() => setSemConta(false)}
        >
          Voltar
        </button>
      </p>
    </main>
  );
}
