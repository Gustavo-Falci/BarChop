import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import { canalDoAmbiente, type CanalDeMensagem } from "./lib/canal";
import { filaPadrao, type Fila } from "./lib/fila";
import { limitesDeAuth } from "./lib/limites";
import { registrarTratamentoDeErros } from "./plugins/erros";
import { autenticar, autenticarCliente, registrarAuth } from "./plugins/auth";
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
import { registrarRotasEquipe } from "./routers/equipe";
import {
  registrarRotasBarbeariasProtegidas,
  registrarRotasBarbeariasPublicas,
} from "./routers/barbearias";
import { registrarRotasHorarios } from "./routers/horarios";
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
  }
}

// Monta a instância sem escutar em porta nenhuma. É o que permite os
// testes usarem app.inject(). Quem abre a porta é o server.ts.
export function buildApp(
  opts: { logger?: boolean; canal?: CanalDeMensagem; fila?: Fila } = {}
): App {
  const app = Fastify({
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

  // origin: true por enquanto — trocar por uma lista explícita
  // (domínio do painel web + esquema do app mobile) antes de produção.
  app.register(cors, { origin: true });

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
  });

  registrarRotasBarbeariasPublicas(app);
  registrarRotasServicosPublicas(app);
  registrarRotasAgendamentosPublicas(app);
  registrarRotasDisponibilidade(app);
  // Sem login: quem autoriza é o token do link do e-mail de lembrete.
  registrarRotasLembretes(app);

  // Escopo dos protegidos: o hook vale pra tudo que for registrado aqui
  // dentro. Pendurar onRequest rota a rota dependeria de ninguém
  // esquecer, e quem esquecesse publicaria a rota em silêncio.
  app.register(async (protegidas: App) => {
    protegidas.addHook("onRequest", autenticar);
    registrarRotasMe(protegidas);
    registrarRotasBarbeariasProtegidas(protegidas);
    registrarRotasHorarios(protegidas);
    registrarRotasServicos(protegidas);
    registrarRotasClientes(protegidas);
    registrarRotasAgendamentos(protegidas);
    registrarRotasEquipe(protegidas);
    registrarRotasBloqueios(protegidas);
  });

  // Escopo do cliente, irmão do de cima e pelo mesmo motivo: o hook vale
  // pra tudo que for registrado aqui dentro. São identidades diferentes,
  // então são escopos diferentes — o hook de um recusa o token do outro.
  app.register(async (doCliente: App) => {
    doCliente.addHook("onRequest", autenticarCliente);
    registrarRotasClientesMe(doCliente);
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
