import type { FastifyError } from "fastify";
import { Prisma } from "@gr-barber/database";
import { ErroHttp } from "../lib/erro-http";
import type { App } from "../tipos";

// Erro sub-500 que chega sem código nosso: em vez de rotular tudo como
// `requisicao_invalida`, cada status ganha o código que descreve o que
// houve. Status fora desta tabela cai no padrão — é sempre alguma forma
// de "a requisição está errada".
const CODIGO_POR_STATUS: Record<number, string> = {
  400: "requisicao_invalida",
  403: "acesso_negado",
  404: "nao_encontrado",
  409: "conflito",
  413: "requisicao_invalida",
  415: "requisicao_invalida",
  422: "regra_de_negocio",
  // Os limites de lib/limites.ts já lançam ErroHttp, que sai pelo
  // branch de cima com este mesmo código. A entrada aqui é a rede: um
  // 429 que venha de outro lugar viraria `requisicao_invalida`, e as
  // telas ramificariam errado num erro que pede espera, não correção.
  429: "tentativas_excedidas",
};

// Um lugar só traduzindo erro de domínio e de banco pra HTTP. Sem isso,
// cada rota repetiria try/catch e o formato da resposta divergiria.
export function registrarTratamentoDeErros(app: App): void {
  app.setErrorHandler<FastifyError>((erro, request, reply) => {
    // ErroDeNegocio (422) também cai aqui: ele estende ErroHttp.
    if (erro instanceof ErroHttp) {
      return reply
        .code(erro.status)
        .send({ erro: erro.codigo, mensagem: erro.message });
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: findUniqueOrThrow/findFirstOrThrow/update não achou o
      // registro. Nas rotas protegidas o `where` sempre carrega o
      // barbeariaId do token, então "não achou" inclui "é de outra
      // barbearia" — e a resposta é a mesma, de propósito.
      if (erro.code === "P2025") {
        return reply.code(404).send({ erro: "nao_encontrado" });
      }
      // P2002: violação de unique (slug, email, telefone do cliente).
      if (erro.code === "P2002") {
        return reply.code(409).send({ erro: "conflito" });
      }
      // P2023: valor inconsistente pra coluna — na prática, um id que
      // não é UUID. Erro de quem chamou, não bug nosso: 400. A mensagem
      // crua traz nome de coluna e SQL, então não é repassada.
      if (erro.code === "P2023") {
        return reply.code(400).send({ erro: "requisicao_invalida" });
      }
    }

    // A EXCLUDE USING gist `sem_conflito_horario` é a única garantia real
    // contra dois clientes confirmando o mesmo horário ao mesmo tempo — a
    // validação por calcularHorariosDisponiveis, que roda antes, tem uma
    // janela entre a leitura e a escrita.
    //
    // O Prisma 5.22 não tipa esse erro: ele chega como
    // PrismaClientUnknownRequestError com `code` e `meta` undefined, e o
    // SQLSTATE existe só dentro da mensagem (medido em 2026-09-02, ver o
    // plano da fase 4). Daí a checagem por substring.
    //
    // Os dois pedaços, e não só um: o `23P01` porque é o código do
    // Postgres e não é traduzido — a prosa da mensagem vem no idioma do
    // servidor —, e o nome da constraint porque uma EXCLUDE constraint
    // futura traria o mesmo código e viraria "horário ocupado" por
    // engano.
    if (
      erro instanceof Prisma.PrismaClientUnknownRequestError &&
      erro.message.includes("23P01") &&
      erro.message.includes("sem_conflito_horario")
    ) {
      // Mensagem nossa, nunca a do Postgres: a crua carrega o caminho do
      // arquivo que fez a query e os valores da chave em conflito, que
      // incluem a data e a hora do agendamento de outra pessoa.
      return reply.code(409).send({
        erro: "horario_ocupado",
        mensagem: "esse horário já está ocupado",
      });
    }

    // Validação de schema do Fastify e erros de JWT já vêm com
    // statusCode — é isso que os branches abaixo consultam.
    const status = erro.statusCode ?? 500;

    // O @fastify/jwt lança com códigos próprios (FST_JWT_NO_AUTHORIZATION_IN_HEADER,
    // FST_JWT_AUTHORIZATION_TOKEN_INVALID e outros). Repassar esses nomes
    // crus colocaria o nome interno de um plugin dentro do contrato da
    // API — e as 23 telas passariam a ramificar em cima dele. Pra quem
    // consome, toda falha de token é a mesma coisa, inclusive as duas
    // que o plugin classifica como 400 (cabeçalho Authorization
    // malformado, cookie ilegível): quem manda um cabeçalho torto não
    // está autenticado.
    if (status === 401 || erro.code?.startsWith("FST_JWT")) {
      return reply.code(401).send({ erro: "nao_autenticado" });
    }

    if (status < 500) {
      // O `erro` é sempre nosso: repassar o `erro.code` colocaria o
      // FST_ERR_VALIDATION do Fastify no contrato, o mesmo vazamento já
      // fechado logo acima pros FST_JWT_*. A `mensagem` do AJV continua
      // saindo porque diz ao cliente qual campo está errado — é o código
      // que precisa ser estável e livre de nome de framework.
      const codigo = CODIGO_POR_STATUS[status] ?? "requisicao_invalida";
      return reply.code(status).send({ erro: codigo, mensagem: erro.message });
    }

    // Qualquer outra coisa é bug nosso: registra inteiro no log e
    // devolve genérico, pra não vazar detalhe interno.
    request.log.error(erro);
    return reply.code(500).send({ erro: "erro_interno" });
  });
}
