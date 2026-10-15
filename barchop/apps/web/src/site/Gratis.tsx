import { DIAS_DE_TESTE, PLANOS, formatarReais } from "@barchop/formato";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./PaginaDePreco.module.css";

// /gratis (Onda 2, PR 6 da cobrança): leva ao cadastro com o Grátis em
// destaque (resposta do dono em 13/10). O cadastro é o mesmo de sempre:
// começa no teste e, sem plano pago, fica no Grátis.

const NO_GRATIS = [
  "Agenda online, com os bloqueios de horário",
  "Link de agendamento da barbearia, para a bio do Instagram",
  "Lembrete por e-mail para o cliente confirmar ou cancelar",
  "Painel do dia e histórico de clientes",
];

export function Gratis() {
  const gratis = PLANOS.gratis;
  return (
    <main className={estilos.pagina}>
      <section className={estilos.topo} aria-labelledby="titulo-gratis">
        <h1 id="titulo-gratis" className={estilos.titulo}>
          Grátis para sempre, com {gratis.limiteDeProfissionais} profissional.
        </h1>
        <p className={estilos.apoio}>
          Para quem trabalha sozinho: o cliente agenda pelo link e recebe lembrete, e você não paga nada.
        </p>
        <div className={estilos.acoes}>
          <LinkDeAcao href="/painel/cadastro" grande>
            Criar minha barbearia grátis
          </LinkDeAcao>
          <LinkDeAcao href="/precos" variante="contorno" grande>
            Ver os planos pagos
          </LinkDeAcao>
        </div>
      </section>

      <div className={estilos.ladoALado}>
        <section aria-labelledby="o-que-vem" className={estilos.destaque}>
          <h2 id="o-que-vem" className={estilos.tituloDaSecao}>
            O que vem no Grátis
          </h2>
          <p className={estilos.preco}>
            <span className={estilos.valor}>{formatarReais(gratis.baseMensalCentavos)}</span>
            <span className={estilos.periodo}>/mês, sem cartão</span>
          </p>
          <ul className={estilos.regras}>
            {NO_GRATIS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="como-comeca" className={estilos.secao}>
          <h2 id="como-comeca" className={estilos.tituloDaSecao}>
            Como começa
          </h2>
          <ol className={estilos.passos}>
            <li>
              Toda barbearia começa com {DIAS_DE_TESTE} dias de tudo liberado: equipe sem limite e todos os
              recursos, sem cartão.
            </li>
            <li>
              No fim do teste, se você não assinar um plano, a barbearia fica no Grátis. Nada é apagado: a agenda,
              os clientes e os horários marcados continuam.
            </li>
            <li>
              A equipe cresceu? Assine o Essencial ou o Completo quando quiser, pelo painel, e todos voltam para o
              link.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
