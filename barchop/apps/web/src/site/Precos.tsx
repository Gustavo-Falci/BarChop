import { DIAS_DE_TESTE, formatarReais, limiteDeProfissionais, precosDoCiclo } from "@barchop/formato";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./PaginaDePreco.module.css";
import { TabelaDePrecos } from "./TabelaDePrecos";
import { Revelar } from "./Revelar";

// /precos (Onda 2, PR 6 da cobrança): a tabela dos planos e as regras
// da cobrança, as mesmas que a Stripe e a API aplicam — teste sem
// cartão, assinatura no fim do teste, troca de plano proporcional,
// cancelamento sem multa e o Grátis sem apagar nada.

const COMO_FUNCIONA = [
  `Toda barbearia começa com ${DIAS_DE_TESTE} dias de tudo liberado, sem cartão.`,
  "Depois do teste, escolha um plano pago ou fique no Grátis. Se não escolher, a barbearia vai para o Grátis e nada é apagado.",
  "Assinou durante o teste? A 1ª cobrança é só quando ele acaba.",
  "O pagamento é no cartão de crédito, pela Stripe. O BarChop não vê nem guarda os dados do cartão.",
  "O plano se renova sozinho, todo mês ou todo ano. No anual você paga 10 meses e leva 12.",
  "Subiu de plano no meio do período: paga na hora só a diferença pelos dias que faltam. Desceu: a mudança vale no fim do período já pago.",
  "Cancele quando quiser, sem multa. O plano vale até o fim do período pago; depois, a barbearia volta para o Grátis.",
  "Se a cobrança falhar, a Stripe tenta de novo nos dias seguintes, e tudo continua funcionando enquanto isso.",
];

const LIMITE_DO_ESSENCIAL = limiteDeProfissionais("essencial");

const PERGUNTAS = [
  {
    pergunta: "Preciso de cartão para testar?",
    resposta: `Não. Os ${DIAS_DE_TESTE} dias de teste são sem cartão. Você só informa o cartão se escolher um plano pago.`,
  },
  {
    pergunta: "Quem conta como profissional?",
    resposta:
      "Quem atende: o dono e os profissionais da equipe. A recepção não conta e não paga. Quem você desativa deixa de contar.",
  },
  {
    pergunta: "Quanto fica com mais profissionais?",
    resposta: `O preço do plano já inclui 1 profissional. Cada um a mais soma ${formatarReais(
      precosDoCiclo("essencial", "mensal").extra
    )} por mês no Essencial e ${formatarReais(precosDoCiclo("completo", "mensal").extra)} no Completo.`,
  },
  {
    pergunta: `E se a equipe passar de ${LIMITE_DO_ESSENCIAL} profissionais?`,
    resposta: `O Essencial vai até ${LIMITE_DO_ESSENCIAL}. Para incluir mais gente, o painel pede para subir para o Completo, que não tem limite.`,
  },
  {
    pergunta: "Posso trocar de plano depois?",
    resposta:
      "Pode, quando quiser, em Faturas, no painel. Subindo, você paga só a diferença dos dias que faltam; descendo, a mudança vale no fim do período já pago.",
  },
  {
    pergunta: "Aceita Pix ou boleto?",
    resposta: "Por enquanto, só cartão de crédito. Pix e boleto chegam em breve.",
  },
];

export function Precos() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.topo} aria-labelledby="titulo-precos">
        <h1 id="titulo-precos" className={estilos.titulo}>
          Preços
        </h1>
        <p className={estilos.apoio}>
          Comece com {DIAS_DE_TESTE} dias de tudo liberado, sem cartão. Depois, escolha o plano do tamanho da
          sua equipe ou fique no Grátis.
        </p>
      </section>

      <TabelaDePrecos />

      <div className={estilos.ladoALado}>
        <Revelar como="section" aria-labelledby="como-funciona" className={estilos.secao}>
          <h2 id="como-funciona" className={estilos.tituloDaSecao}>
            Como a cobrança funciona
          </h2>
          <ul className={estilos.regras}>
            {COMO_FUNCIONA.map((regra) => (
              <li key={regra}>{regra}</li>
            ))}
          </ul>
        </Revelar>

        <Revelar como="section" aria-labelledby="perguntas" className={estilos.secao}>
          <h2 id="perguntas" className={estilos.tituloDaSecao}>
            Perguntas frequentes
          </h2>
          <div className={estilos.perguntas}>
            {PERGUNTAS.map((item) => (
              <details key={item.pergunta} className={estilos.pergunta}>
                <summary>{item.pergunta}</summary>
                <p>{item.resposta}</p>
              </details>
            ))}
          </div>
        </Revelar>
      </div>

      <Revelar como="section" aria-labelledby="comecar" className={estilos.final}>
        <h2 id="comecar" className={estilos.tituloDaSecao}>
          Teste {DIAS_DE_TESTE} dias com tudo liberado.
        </h2>
        <LinkDeAcao href="/painel/cadastro" grande>
          Criar minha barbearia grátis
        </LinkDeAcao>
      </Revelar>
    </main>
  );
}
