import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawServerDefault,
} from "fastify";

// O `withTypeProvider` devolve uma instância com um tipo longo demais
// pra repetir em cada arquivo de rota. Esse alias é esse tipo, e é o
// que as funções de registro de rota recebem — sem ele, elas perderiam
// a inferência do corpo a partir do schema JSON.
export type App = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  JsonSchemaToTsProvider
>;
