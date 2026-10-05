import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./Home.module.css";

// A home do SaaS (marco 1s). O texto só promete o que o produto já faz:
// lembrete por e-mail (o WhatsApp oficial espera a Meta, ADR-0009),
// nenhum preço em reais (planos chegam com a cobrança, Onda 2) e
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
    texto: "Capa, fotos, serviços com preço, equipe e os próximos horários livres, no seu endereço.",
  },
  {
    titulo: "Lembrete por e-mail",
    texto: "Confirmar ou cancelar com um toque. Você escolhe a antecedência: 2, 12 ou 24 horas.",
  },
  {
    titulo: "Equipe com papéis",
    texto: "Dono, profissional e recepção: cada um vê e mexe só no que é seu.",
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
    resposta: "Nada durante o lançamento. Os planos pagos vêm depois, e quem já usa fica sabendo antes de qualquer cobrança.",
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

export function Home() {
  return (
    <main className={estilos.home}>
      <section className={estilos.topo}>
        <div className={estilos.promessa}>
          <p className={estilos.chapeu}>Agenda online para barbearias</p>
          <h1 className={estilos.titulo}>Sua barbearia agenda sozinha.</h1>
          <p className={estilos.apoio}>
            O cliente marca pelo link da sua barbearia, escolhe o profissional e
            recebe lembrete. Você para de responder “tem horário?” no WhatsApp e
            perde menos horário pra falta.
          </p>
          <div className={estilos.acoes}>
            <LinkDeAcao href="/painel/cadastro" grande>
              Criar minha barbearia grátis
            </LinkDeAcao>
            <p className={estilos.nota}>Grátis durante o lançamento. Sem cartão.</p>
          </div>
        </div>
        <AgendaDeExemplo />
      </section>

      <section aria-labelledby="dor" className={estilos.secao}>
        <h2 id="dor" className={estilos.tituloDaSecao}>Soa familiar?</h2>
        <ul className={estilos.dores}>
          {DORES.map((dor) => (
            <li key={dor}>{dor}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="como-funciona" className={estilos.secao}>
        <h2 id="como-funciona" className={estilos.tituloDaSecao}>Como funciona</h2>
        <ol className={estilos.passos}>
          {PASSOS.map((passo) => (
            <li key={passo.titulo} className={estilos.passo}>
              <h3 className={estilos.tituloDoItem}>{passo.titulo}</h3>
              <p>{passo.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="recursos" className={estilos.secao}>
        <h2 id="recursos" className={estilos.tituloDaSecao}>O que vem junto</h2>
        <ul className={estilos.recursos}>
          {RECURSOS.map((recurso) => (
            <li key={recurso.titulo} className={estilos.recurso}>
              <h3 className={estilos.tituloDoItem}>{recurso.titulo}</h3>
              <p>{recurso.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="preco" className={`${estilos.secao} ${estilos.preco}`}>
        <h2 id="preco" className={estilos.tituloDaSecao}>Preço</h2>
        <p className={estilos.valor}>Grátis durante o lançamento</p>
        <p>
          Todas as funções liberadas, sem cartão de crédito. Quando os planos
          pagos chegarem, você fica sabendo antes e decide se continua.
        </p>
      </section>

      <section aria-labelledby="perguntas" className={estilos.secao}>
        <h2 id="perguntas" className={estilos.tituloDaSecao}>Perguntas frequentes</h2>
        <div className={estilos.perguntas}>
          {PERGUNTAS.map((item) => (
            <details key={item.pergunta} className={estilos.pergunta}>
              <summary>{item.pergunta}</summary>
              <p>{item.resposta}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="comecar" className={estilos.final}>
        <h2 id="comecar" className={estilos.tituloDaSecao}>
          Comece hoje, sem falar com ninguém.
        </h2>
        <LinkDeAcao href="/painel/cadastro" grande>
          Criar minha barbearia grátis
        </LinkDeAcao>
      </section>
    </main>
  );
}

// Ilustração do painel do dia, só visual: os nomes são inventados e o
// leitor de tela pula o bloco inteiro.
function AgendaDeExemplo() {
  const horarios = [
    { hora: "09:00", cliente: "Rafael", servico: "Corte", profissional: "Gui" },
    { hora: "09:40", cliente: "Bruno", servico: "Barba", profissional: "Léo" },
    { hora: "10:20", cliente: "Caio", servico: "Corte e barba", profissional: "Gui" },
  ];
  return (
    <div className={estilos.exemplo} aria-hidden="true">
      <p className={estilos.exemploTitulo}>Hoje</p>
      <ul className={estilos.exemploLista}>
        {horarios.map((h) => (
          <li key={h.hora} className={estilos.exemploItem}>
            <span className={estilos.exemploHora}>{h.hora}</span>
            <span>
              <strong>{h.cliente}</strong> · {h.servico}
            </span>
            <span className={estilos.exemploProfissional}>{h.profissional}</span>
          </li>
        ))}
      </ul>
      <p className={estilos.exemploSelo}>Confirmado pelo cliente</p>
    </div>
  );
}
