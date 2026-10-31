"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { CampoDeBusca } from "../../componentes/CampoDeBusca";
import estilos from "./CentralDeAjuda.module.css";

// A resposta em pedaços: texto solto e links pra tela onde a coisa se
// faz. Em pedaços, e não JSX, pra busca ler o mesmo texto que aparece.
type Trecho = string | { href: string; rotulo: string };

interface Pergunta {
  pergunta: string;
  resposta: Trecho[];
}

// Agrupadas pelo assunto, na ordem do dia a dia: agenda, página,
// clientes, caixa, planos, equipe e conta. Cada resposta leva pra tela certa.
const TEMAS: { tema: string; perguntas: Pergunta[] }[] = [
  {
    tema: "Agenda",
    perguntas: [
      {
        pergunta: "Como marco um horário pelo painel?",
        resposta: [
          "Na ",
          { href: "/painel/agenda", rotulo: "Agenda" },
          ", clique num horário livre, ou use ",
          { href: "/painel/agendamentos/novo", rotulo: "Novo agendamento" },
          ". Pelo painel você encaixa livre das regras do link, desde que dentro do horário de funcionamento.",
        ],
      },
      {
        pergunta: "Como bloqueio um horário ou tiro folga?",
        resposta: [
          "Em ",
          { href: "/painel/bloqueios", rotulo: "Folgas" },
          ", escolha o profissional, o dia inteiro ou só algumas horas, e o motivo. Na agenda, o botão Bloquear faz o mesmo sem sair da tela.",
        ],
      },
      {
        pergunta: "Por que um horário não aparece livre pro cliente?",
        resposta: [
          "Confira os ",
          { href: "/painel/configuracoes/horarios", rotulo: "Horários" },
          " de funcionamento, as folgas e bloqueios do profissional e as ",
          { href: "/painel/configuracoes/regras-de-agendamento", rotulo: "Regras de agendamento" },
          ": antecedência mínima, até quando a agenda abre e se o serviço precisa caber antes de fechar.",
        ],
      },
    ],
  },
  {
    tema: "Sua página",
    perguntas: [
      {
        pergunta: "Como compartilho meu link com os clientes?",
        resposta: [
          "No ",
          { href: "/painel", rotulo: "Hoje" },
          ", o cartão do link tem Compartilhar: copie o link, mande pelo WhatsApp ou baixe o QR code pra imprimir.",
        ],
      },
      {
        pergunta: "Como mudo o visual da minha página?",
        resposta: [
          "Em ",
          { href: "/painel/configuracoes/aparencia", rotulo: "Aparência" },
          ", escolha tema, cores, fontes e o jeito de mostrar os serviços. Você mexe num rascunho, vê a prévia e só publica quando gostar.",
        ],
      },
      {
        pergunta: "Posso trocar o endereço da minha página?",
        resposta: [
          "O link é único. O dono pede a troca em ",
          { href: "/painel/configuracoes/dados-do-negocio", rotulo: "Dados do negócio" },
          ", e o suporte do BarChop analisa o pedido.",
        ],
      },
    ],
  },
  {
    tema: "Clientes",
    perguntas: [
      {
        pergunta: "Como o cliente recebe o lembrete do horário?",
        resposta: [
          "Por e-mail, antes do horário, com um link pra confirmar a presença ou cancelar. Ligue, desligue e escolha quando o lembrete sai em ",
          { href: "/painel/configuracoes/notificacoes", rotulo: "Notificações" },
          ".",
        ],
      },
      {
        pergunta: "O cliente pode remarcar ou cancelar sozinho?",
        resposta: [
          "Pode, pela área do cliente na sua página, até o prazo que você define em ",
          { href: "/painel/configuracoes/regras-de-agendamento", rotulo: "Regras de agendamento" },
          ".",
        ],
      },
    ],
  },
  {
    tema: "Caixa",
    perguntas: [
      {
        pergunta: "Como registro o pagamento de um atendimento?",
        resposta: [
          "No atendimento, em Concluir e registrar pagamento: o valor já vem com a soma dos serviços; escolha a forma e quem recebeu. O resumo mostra na hora como o dinheiro se divide. Tudo aparece no ",
          { href: "/painel/caixa", rotulo: "Caixa" },
          " do dia.",
        ],
      },
      {
        pergunta: "Como fecho o caixa do dia?",
        resposta: [
          "No ",
          { href: "/painel/caixa", rotulo: "Caixa" },
          ", o dono confere o acerto (quem repassa quanto a quem) e as pendências e clica em Fechar o dia. Fechado, os pagamentos daquele dia só mudam se o dono reabrir.",
        ],
      },
      {
        pergunta: "Como o dinheiro do caixa se divide entre a equipe?",
        resposta: [
          "Em ",
          { href: "/painel/configuracoes/divisao", rotulo: "Divisão do dinheiro" },
          ", o dono define a parte da casa de cada um e quanto vai pro profissional de quem o cliente é quando outro atende. A gorjeta é sempre de quem atendeu.",
        ],
      },
    ],
  },
  {
    tema: "Planos de assinatura",
    perguntas: [
      {
        pergunta: "Como crio um plano de assinatura?",
        resposta: [
          "Em ",
          { href: "/painel/planos", rotulo: "Planos" },
          ", no Novo plano: o preço por ciclo, os dias grátis e os serviços incluídos, com quantas vezes cada um vale no ciclo. O plano da casa vale com qualquer profissional e paga a quem atende o valor fixo por atendimento; o plano de um profissional vale só com quem vende. No plano Completo.",
        ],
      },
      {
        pergunta: "Como o cliente assina pela minha página?",
        resposta: [
          "O dono liga Mostrar os planos na página, em ",
          { href: "/painel/planos", rotulo: "Planos" },
          ". Pra vender online, quem vende conecta a conta do Asaas, da Stripe ou da InfinitePay em ",
          { href: "/painel/configuracoes/pagamentos-online", rotulo: "Pagamentos online" },
          ": o cliente entra, assina e paga na fatura do provedor (no Asaas, Pix, cartão ou boleto; na Stripe, cartão; na InfinitePay, Pix ou cartão, num link a cada mensalidade). Sem a conta conectada, a página oferece só o balcão.",
        ],
      },
      {
        pergunta: "Como conecto a minha conta do Asaas, da Stripe ou da InfinitePay?",
        resposta: [
          "Em ",
          { href: "/painel/configuracoes/pagamentos-online", rotulo: "Pagamentos online" },
          ", escolha o Asaas, a Stripe ou a InfinitePay e cole a chave (no Asaas, a chave de API; na Stripe, uma chave restrita, com as permissões que a tela lista; na InfinitePay, a chave e a InfiniteTag, com o checkout integrado ligado na conta). A mensalidade cai direto na conta de quem vende, e o BarChop não cobra taxa. Na Stripe e na InfinitePay, quem assina não precisa dar o CPF. A InfinitePay não renova sozinha: o BarChop manda ao cliente um link a cada mensalidade, e você pode mandar o mesmo link pelo WhatsApp, no cliente. O dono conecta a conta da casa; cada profissional que vende, a sua. Com assinatura online viva, a conta só desconecta depois de cancelar as assinaturas.",
        ],
      },
      {
        pergunta: "Como cadastro um assinante que paga no balcão?",
        resposta: [
          "Em ",
          { href: "/painel/clientes", rotulo: "Clientes" },
          ", abra o cliente e use Assinar plano. A cada ciclo, marque Recebi com a forma de pagamento: a mensalidade entra no Caixa do dia. Ciclo vencido sem Recebi deixa a assinatura em atraso.",
        ],
      },
      {
        pergunta: "Como registro um atendimento pelo plano?",
        resposta: [
          "Em Concluir e registrar pagamento, escolha o plano em Usar o plano: os serviços incluídos saem do valor e o uso do ciclo é contado. O que passa do plano é cobrado à parte. Tudo aparece no ",
          { href: "/painel/caixa", rotulo: "Caixa" },
          " do dia.",
        ],
      },
      {
        pergunta: "Quem da equipe pode vender planos?",
        resposta: [
          "O dono vende sempre. Um profissional vende quando o dono liga Pode vender planos no cadastro da pessoa, em ",
          { href: "/painel/equipe", rotulo: "Equipe" },
          ". A casa fica com a parte da casa daquele profissional sobre cada mensalidade.",
        ],
      },
    ],
  },
  {
    tema: "Equipe e conta",
    perguntas: [
      {
        pergunta: "Como coloco alguém da equipe no painel?",
        resposta: [
          "O dono convida em ",
          { href: "/painel/equipe", rotulo: "Equipe" },
          ": a pessoa recebe um e-mail pra criar a senha. O papel decide o que ela vê — dono, recepção ou profissional.",
        ],
      },
      {
        pergunta: "Como troco meu nome ou telefone?",
        resposta: [
          "Em ",
          { href: "/painel/configuracoes/perfil", rotulo: "Minha conta" },
          ". Cada pessoa da equipe tem a sua.",
        ],
      },
      {
        pergunta: "Como deixo o painel no modo escuro?",
        resposta: [
          "No botão … do canto de cima, em Aparência: Claro, Escuro ou Sistema, que acompanha o seu aparelho.",
        ],
      },
    ],
  },
];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function textoDe({ pergunta, resposta }: Pergunta): string {
  return semAcento(
    [pergunta, ...resposta.map((trecho) => (typeof trecho === "string" ? trecho : trecho.rotulo))].join(" ")
  );
}

export function CentralDeAjuda() {
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca.trim());
  const temas = TEMAS.map(({ tema, perguntas }) => ({
    tema,
    perguntas: termo ? perguntas.filter((p) => textoDe(p).includes(termo)) : perguntas,
  })).filter(({ perguntas }) => perguntas.length > 0);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo="Central de ajuda" apoio="Respostas rápidas pro dia a dia no BarChop." />

      <div className={estilos.busca}>
        <CampoDeBusca
          rotulo="Buscar na ajuda"
          valor={busca}
          onChange={setBusca}
          exemplo="Ex.: folga, lembrete, link"
        />
      </div>

      {temas.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma pergunta com “{busca.trim()}”. Tente outra palavra.</p>
      ) : (
        <div className={estilos.temas}>
          {temas.map(({ tema, perguntas }) => (
            <section key={tema} className={estilos.tema} aria-labelledby={`tema-${tema}`}>
              <h2 id={`tema-${tema}`} className={estilos.nomeDoTema}>
                {tema}
              </h2>
              {perguntas.map(({ pergunta, resposta }) => (
                <details key={pergunta} className={estilos.pergunta}>
                  <summary className={estilos.resumo}>{pergunta}</summary>
                  <p className={estilos.resposta}>
                    {resposta.map((trecho, indice) =>
                      typeof trecho === "string" ? (
                        <Fragment key={indice}>{trecho}</Fragment>
                      ) : (
                        <Link key={indice} href={trecho.href}>
                          {trecho.rotulo}
                        </Link>
                      )
                    )}
                  </p>
                </details>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
