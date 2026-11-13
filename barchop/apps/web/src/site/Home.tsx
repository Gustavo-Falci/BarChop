import { DIAS_DE_TESTE, formatarReais, precosDoCiclo } from "@barchop/formato";
import Link from "next/link";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./Home.module.css";
import { TabelaDePrecos } from "./TabelaDePrecos";
import { ContaVisita } from "./ContaVisita";
import { clashLeve } from "./fontesDaHome";
import { TituloDaSecao } from "./TituloDaSecao";
import { CabecalhoDaHome } from "./CabecalhoDaHome";
import { ID_DO_TOPO, TopoDaHome } from "./TopoDaHome";

// O cadastro marcado como vindo da home (home nova, marco 1: linha de base
// de visita → cadastro). Só os convites do corpo da home: o cabeçalho e o
// rodapé aparecem em todas as páginas do site.
const CADASTRO_PELA_HOME = "/painel/cadastro?origem=home";

// A home do SaaS (marco 1s; topo novo na home nova, marco 2; seções na
// linguagem do protótipo, marco 4). O texto só promete o que o produto já faz:
// lembrete por e-mail (o WhatsApp oficial espera a Meta, ADR-0009),
// os preços lidos de planos.ts (chegaram com a cobrança, Onda 2) e
// nenhum número de prova antes de o piloto medir alguma coisa.

const DORES = [
  "Cliente pergunta “tem horário?” no WhatsApp, e você responde entre um corte e outro.",
  "A agenda mora num bloco de notas, e dois clientes caem no mesmo horário.",
  "O cliente esquece, não avisa, e a cadeira fica vazia.",
];

const PASSOS = [
  {
    titulo: "Cadastre a barbearia",
    texto: "Horário de funcionamento, serviços e equipe em poucos minutos, pelo celular ou pelo computador.",
  },
  {
    titulo: "Compartilhe o seu link",
    texto: "Sua página fica em suabarbearia.barchop.com.br. Coloque na bio do Instagram e no status.",
  },
  {
    titulo: "O cliente agenda e recebe lembrete",
    texto: "Ele escolhe serviço, profissional e horário. Antes da hora, chega um lembrete por e-mail pra confirmar ou cancelar.",
  },
];

const RECURSOS = [
  {
    titulo: "Agenda por profissional",
    texto: "Dia, semana e mês, com a coluna de cada profissional e os bloqueios de horário.",
  },
  {
    titulo: "Página da barbearia",
    texto: "Capa, serviços com preço, equipe com foto e os próximos horários livres, no seu endereço.",
  },
  {
    titulo: "Lembrete por e-mail",
    texto: "Confirmar ou cancelar com um toque. Você escolhe a antecedência: 2, 12 ou 24 horas.",
  },
  {
    titulo: "Equipe com papéis",
    texto: "O profissional vê a própria agenda, a recepção cuida de todas, e só o dono mexe nas configurações.",
  },
  {
    titulo: "Painel do dia",
    texto: "Quem vem hoje, quanto está previsto e quanto da agenda já está ocupado.",
  },
  {
    titulo: "Histórico de clientes",
    texto: "Dados e agendamentos de cada cliente, com busca.",
  },
];

const PERGUNTAS = [
  {
    pergunta: "Preciso instalar alguma coisa?",
    resposta: "Não. O BarChop funciona no navegador do celular ou do computador.",
  },
  {
    pergunta: "O cliente precisa baixar aplicativo?",
    resposta: "Não. Ele agenda pelo link da barbearia. Pra ver ou cancelar os próprios horários, entra com o e-mail.",
  },
  {
    pergunta: "Quanto custa?",
    resposta: `Tem o Grátis, com 1 profissional, para sempre. Os planos pagos começam em ${formatarReais(
      precosDoCiclo("essencial", "mensal").base
    )} por mês. Toda barbearia começa com ${DIAS_DE_TESTE} dias de tudo liberado, sem cartão.`,
  },
  {
    pergunta: "Trabalho sozinho. Serve pra mim?",
    resposta: "Serve. No começo, marque que trabalha sozinho e pule a parte da equipe.",
  },
  {
    pergunta: "E os dados dos meus clientes?",
    resposta: "São da sua barbearia. O BarChop só os usa pra fazer a agenda e os lembretes funcionarem.",
  },
];

// O número do item em dois dígitos, como no protótipo ("01"). Só
// desenho: a lista ordenada já diz a posição ao leitor de tela.
function numero(i: number) {
  return String(i + 1).padStart(2, "0");
}

// Abaixo do topo, as seções sem caixa (home nova, marco 4): o rótulo
// curto de sempre em cima, que é o nome da seção pro leitor de tela, o
// título leve + forte, e as listas lado a lado com um fio em cima. O
// fecho sai do miolo pra pintar a largura toda no escuro do topo.
export function Home() {
  return (
    <>
      <CabecalhoDaHome topo={ID_DO_TOPO} />
      <main className={clashLeve.variable}>
        <ContaVisita />
        <TopoDaHome />
        <div className={estilos.home}>
          <section id="dores" aria-labelledby="dores-rotulo" className={estilos.secao}>
            <TituloDaSecao id="dores" rotulo="Soa familiar?" leve="Cadeira vazia" forte="é horário perdido." />
            <ol className={estilos.lista}>
              {DORES.map((dor, i) => (
                <li key={dor} className={estilos.item}>
                  <span className={estilos.numero} aria-hidden="true">
                    {numero(i)}
                  </span>
                  <p className={estilos.dor}>{dor}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="como-funciona" aria-labelledby="como-funciona-rotulo" className={estilos.secao}>
            <TituloDaSecao id="como-funciona" rotulo="Como funciona" leve="Três passos" forte="e a agenda anda." />
            <ol className={estilos.lista}>
              {PASSOS.map((passo, i) => (
                <li key={passo.titulo} className={estilos.item}>
                  <span className={estilos.numero} aria-hidden="true">
                    Passo {i + 1}
                  </span>
                  <h3 className={estilos.tituloDoItem}>{passo.titulo}</h3>
                  <p className={estilos.texto}>{passo.texto}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="recursos" aria-labelledby="recursos-rotulo" className={estilos.secao}>
            <TituloDaSecao
              id="recursos"
              rotulo="O que vem junto"
              leve="Do link ao lembrete,"
              forte="tudo num lugar só."
            />
            <ul className={estilos.lista}>
              {RECURSOS.map((recurso) => (
                <li key={recurso.titulo} className={estilos.item}>
                  <h3 className={estilos.tituloDoItem}>{recurso.titulo}</h3>
                  <p className={estilos.texto}>{recurso.texto}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="planos" aria-labelledby="planos-rotulo" className={estilos.secao}>
            <div className={estilos.cabecaDosPlanos}>
              <TituloDaSecao id="planos" rotulo="Planos" leve="Comece grátis," forte="mude quando crescer." />
              <p className={estilos.apoioDosPlanos}>
                Comece com {DIAS_DE_TESTE} dias de tudo liberado. Depois, escolha um
                plano ou fique no Grátis.
              </p>
            </div>
            <TabelaDePrecos cadastro={CADASTRO_PELA_HOME} variante="linhas" />
            <Link href="/precos" className={estilos.detalhes}>
              Ver todos os detalhes dos preços
            </Link>
          </section>

          <section id="perguntas" aria-labelledby="perguntas-rotulo" className={`${estilos.secao} ${estilos.perguntasLado}`}>
            <TituloDaSecao
              id="perguntas"
              rotulo="Perguntas frequentes"
              leve="Antes de começar,"
              forte="o que todo mundo pergunta."
            />
            <div className={estilos.perguntas}>
              {PERGUNTAS.map((item) => (
                <details key={item.pergunta} className={estilos.pergunta}>
                  <summary>{item.pergunta}</summary>
                  <p>{item.resposta}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <section id="comecar" aria-labelledby="comecar-titulo" className={estilos.fecho}>
          <div className={estilos.miolo}>
            <TituloDaSecao id="comecar" leve="Comece hoje," forte="sem falar com ninguém." />
            <div className={estilos.acoes}>
              <LinkDeAcao href={CADASTRO_PELA_HOME} grande className={estilos.ouro}>
                Criar minha barbearia grátis
              </LinkDeAcao>
              <p className={estilos.nota}>{DIAS_DE_TESTE} dias com tudo liberado · sem cartão</p>
            </div>
            <p className={estilos.credito}>
              A cadeira do topo é adaptada do modelo 3D{" "}
              <a href="https://sketchfab.com/3d-models/barber-chair-b608436ca02d40c6a914fca72f7b3619">
                Barber Chair
              </a>
              , de sweedboy69, sob a licença{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
