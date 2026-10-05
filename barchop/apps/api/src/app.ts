import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import { armazenamentoPadrao, type Armazenamento } from "./lib/armazenamento";
import { confiancaNoProxy, origemPermitida, origensPermitidas, proxiesConfiaveis } from "./lib/borda";
import { canalDoAmbiente, type CanalDeMensagem } from "./lib/canal";
import { filaPadrao, type Fila } from "./lib/fila";
import { limitesDaEquipe, limitesDeAuth, limitesPublicos } from "./lib/limites";
import { registrarTratamentoDeErros } from "./plugins/erros";
import { autenticar, autenticarCliente, autenticarSuporte, registrarAuth } from "./plugins/auth";
import { registrarRotasAuth } from "./routers/auth";
import { registrarRotasAuthCliente } from "./routers/auth-cliente";
import {
  registrarRotasAgendamentos,
  registrarRotasAgendamentosPublicas,
} from "./routers/agendamentos";
import { registrarRotasClientes } from "./routers/clientes";
import { registrarRotasClientesMe } from "./routers/clientes-me";
import { registrarRotasDisponibilidade } from "./routers/disponibilidade";
import { registrarRotasBloqueios } from "./routers/bloqueios";
import { registrarRotasOnboarding } from "./routers/onboarding";
import { registrarRotasSolicitacaoDeLink } from "./routers/solicitacao-de-link";
import { registrarRotasLoginDoSuporte, registrarRotasSuporte } from "./routers/suporte";
import { registrarRotasEquipe } from "./routers/equipe";
import {
  registrarRotasBarbeariasProtegidas,
  registrarRotasBarbeariasPublicas,
} from "./routers/barbearias";
import { registrarRotasHorarios } from "./routers/horarios";
import { registrarRotaDeArquivos, registrarRotasImagens } from "./routers/imagens";
import { ocultarTokenDoLembrete, registrarRotasLembretes } from "./routers/lembretes";
import { registrarRotasMe } from "./routers/me";
import {
  registrarRotasServicos,
  registrarRotasServicosPublicas,
} from "./routers/servicos";
import type { App } from "./tipos";

declare module "fastify" {
  interface FastifyInstance {
    // Por onde saem os códigos de verificação. Na instância, e não
    // importado direto pelas rotas, pra cada app (e cada teste) ter o
    // seu — os testes leem o código no canal de memória.
    canal: CanalDeMensagem;
    // Onde se agenda o trabalho que roda depois (o lembrete). Na
    // instância pelo mesmo motivo do canal: cada teste com a sua, de
    // memória, e o pg-boss só no processo de verdade.
    fila: Fila;
    // Onde ficam capa e fotos (bloco E2). Na instância pelo mesmo motivo:
    // cada teste com a sua pasta temporária.
    armazenamento: Armazenamento;
  }
}

// Monta a instância sem escutar em porta nenhuma. É o que permite os
// testes usarem app.inject(). Quem abre a porta é o server.ts.
export function buildApp(
  opts: {
    logger?: boolean;
    canal?: CanalDeMensagem;
    fila?: Fila;
    armazenamento?: Armazenamento;
    // A borda (proxy de confiança e CORS) lê daqui; o padrão é o
    // process.env. Existe pra o teste montar a API "atrás do Caddy" sem
    // mexer no ambiente do processo.
    ambiente?: Record<string, string | undefined>;
  } = {}
): App {
  const ambiente = opts.ambiente ?? process.env;
  // Lidas antes do Fastify: valor torto, ou ausente em produção, lança
  // aqui e a API não sobe (lib/borda.ts).
  const origens = origensPermitidas(ambiente);
  const app = Fastify({
    // Só com o Caddy na frente (G1): ver lib/borda.ts.
    trustProxy: confiancaNoProxy(proxiesConfiaveis(ambiente)),
    // O serializer padrão da requisição, com a URL passando pelo
    // ocultarTokenDoLembrete: o token no caminho é um link de cancelar
    // que funciona, e não pode ficar legível no log.
    logger: opts.logger
      ? {
          serializers: {
            req: (req) => ({
              method: req.method,
              url: ocultarTokenDoLembrete(req.url),
              host: req.host,
              remoteAddress: req.ip,
              remotePort: req.socket?.remotePort,
            }),
          },
        }
      : false,
    // O AJV do Fastify vem com `removeAdditional: true`: campo fora do
    // schema é apagado do corpo em silêncio, e a rota responde 200 como
    // se estivesse tudo certo. Com `additionalProperties: false` nos
    // corpos, queremos o contrário — 400 dizendo qual campo sobra. É o
    // que separa "mandei `telephone` em vez de `telefone`" de "salvou
    // sem esse campo e não me avisou", e o que faz um `barbeariaId`
    // no corpo de rota protegida ser recusado em vez de ignorado.
    ajv: { customOptions: { removeAdditional: false } },
    // O padrão do Fastify é 100 caracteres por parâmetro de rota, e o
    // token do link do lembrete (um JWT) passa de 200: sem isto, 414.
    maxParamLength: 512,
  }).withTypeProvider<JsonSchemaToTsProvider>();

  // Qualquer origem só fora de produção e sem ORIGENS_PERMITIDAS (dev
  // local). Com a lista, origem de fora fica sem o cabeçalho e o
  // navegador barra a resposta. O app mobile não manda Origin, então
  // não precisa estar nela.
  app.register(cors, {
    origin: (origem, responder) => responder(null, !!origem && origemPermitida(origens, origem)),
  });

  registrarTratamentoDeErros(app);

  // Rota não encontrada não passa pelo setErrorHandler no Fastify: sem
  // isto a API responderia com duas formas de erro incompatíveis, a
  // nossa e a do framework ({ message, error, statusCode }).
  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({ erro: "nao_encontrado" })
  );

  registrarAuth(app);

  // Escolhido ao montar, não na primeira mensagem: em produção sem
  // provedor real o canalDoAmbiente lança, e é aqui que a API tem que
  // se recusar a subir.
  app.decorate("canal", opts.canal ?? canalDoAmbiente(app.log));

  // Sem fila passada, só nos testes: o filaPadrao recusa subir fora deles.
  app.decorate("fila", opts.fila ?? filaPadrao());

  // Fora dos testes, recusa o disco local em produção (armazenamento.ts).
  app.decorate("armazenamento", opts.armazenamento ?? armazenamentoPadrao());

  // Escopo só pras quatro rotas que recebem senha — as duas de login e
  // as duas de signup. Existe por causa do `await`: os contadores são
  // construídos com `escopo.rateLimit(...)`, que só passa a existir
  // depois do plugin carregar, e `register` é diferido pelo avvio.
  // Registrar na raiz e chamar `limitesDeAuth` na linha seguinte pegaria
  // `rateLimit` undefined — e esse silêncio seria pior que um erro,
  // porque as rotas subiriam sem limite nenhum e nada apontaria pra
  // isso. `global: false` porque os limites são explícitos, rota a rota:
  // um teto global valeria também pra agenda, que o barbeiro recarrega o
  // dia inteiro.
  app.register(async (comLimite: App) => {
    await comLimite.register(rateLimit, { global: false });
    const limites = limitesDeAuth(comLimite);
    registrarRotasAuth(comLimite, limites);
    registrarRotasAuthCliente(comLimite, limites);
    registrarRotasLoginDoSuporte(comLimite, limites);
  });

  registrarRotasBarbeariasPublicas(app);
  registrarRotasServicosPublicas(app);
  // As abertas que mandam e-mail ou custam caro (G2), num escopo com o
  // plugin de limite pelo mesmo motivo do de auth: o `await`.
  app.register(async (abertas: App) => {
    await abertas.register(rateLimit, { global: false });
    const limites = limitesPublicos(abertas);
    registrarRotasAgendamentosPublicas(abertas, limites);
    registrarRotasDisponibilidade(abertas, limites);
  });
  // Sem login: quem autoriza é o token do link do e-mail de lembrete.
  registrarRotasLembretes(app);
  // As imagens servidas pela própria API, só no armazenamento local.
  registrarRotaDeArquivos(app);

  // Escopo dos protegidos: o hook vale pra tudo que for registrado aqui
  // dentro. Pendurar onRequest rota a rota dependeria de ninguém
  // esquecer, e quem esquecesse publicaria a rota em silêncio.
  app.register(async (protegidas: App) => {
    protegidas.addHook("onRequest", autenticar);
    // O convite da equipe manda e-mail pra qualquer endereço (G2).
    await protegidas.register(rateLimit, { global: false });
    const limitesDeEquipe = limitesDaEquipe(protegidas);
    registrarRotasMe(protegidas);
    registrarRotasBarbeariasProtegidas(protegidas);
    registrarRotasHorarios(protegidas);
    registrarRotasServicos(protegidas);
    registrarRotasClientes(protegidas);
    registrarRotasAgendamentos(protegidas);
    registrarRotasEquipe(protegidas, limitesDeEquipe);
    registrarRotasBloqueios(protegidas);
    registrarRotasOnboarding(protegidas);
    registrarRotasSolicitacaoDeLink(protegidas);

    // Upload de imagem num escopo filho: o @fastify/multipart vale só
    // aqui, e o `autenticar` do escopo de cima já rodou antes de qualquer
    // byte do corpo ser lido.
    protegidas.register(async (comArquivos: App) => {
      await comArquivos.register(multipart);
      registrarRotasImagens(comArquivos);
    });
  });

  // Escopo do cliente, irmão do de cima e pelo mesmo motivo: o hook vale
  // pra tudo que for registrado aqui dentro. São identidades diferentes,
  // então são escopos diferentes — o hook de um recusa o token do outro.
  app.register(async (doCliente: App) => {
    doCliente.addHook("onRequest", autenticarCliente);
    registrarRotasClientesMe(doCliente);
  });

  // Escopo do suporte da plataforma (bloco F4), irmão dos dois de cima:
  // o hook aceita só `tipo: "suporte"`, e os outros dois recusam o token
  // dele — o do painel principalmente, porque o suporte não tem
  // barbeariaId e lá ele viraria "todas as barbearias".
  app.register(async (doSuporte: App) => {
    doSuporte.addHook("onRequest", autenticarSuporte);
    registrarRotasSuporte(doSuporte);
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
