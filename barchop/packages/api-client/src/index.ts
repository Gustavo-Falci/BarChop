import { criarApiBarbeiro } from "./barbeiro";
import { criarApiCliente } from "./cliente";
import { criarApiPublica } from "./publico";
import { criarRequisicao, type OpcoesDoClient } from "./requisicao";
import { criarApiSuporte } from "./suporte";

export { ErroDaApi } from "./erro";
export {
  CODIGO_DO_BARBEIRO_FALSO,
  CODIGO_DO_CADASTRO_FALSO,
  CODIGO_DO_CLIENTE_FALSO,
  CODIGO_DO_CONVITE_FALSO,
  criarApiClientFalso,
  EMAIL_DO_SUPORTE_FALSO,
  SENHA_DO_SUPORTE_FALSA,
} from "./falso";
export type { EstadoFalso, SementeFalsa } from "./falso";
export { criarRequisicao } from "./requisicao";
export type {
  OpcoesDaChamada,
  OpcoesDoClient,
  Requisicao,
} from "./requisicao";
export type {
  AceiteDoConvite,
  ClienteComHistorico,
  EdicaoDoMembro,
  NovoBloqueio,
  NovoMembro,
  CredenciaisDoBarbeiro,
  EdicaoDaBarbearia,
  EdicaoDoAgendamento,
  EdicaoDoCliente,
  EdicaoDoPerfil,
  EdicaoDoServico,
  NovaBarbearia,
  NovoCliente,
  NovoServico,
  RedefinicaoDeSenha,
} from "./barbeiro";
export type {
  EdicaoDoMeuCadastro,
  FiltroDoHistorico,
  Remarcacao,
} from "./cliente";
export type {
  CredenciaisDoCliente,
  DestinoDoCodigo,
  FiltroDoDia,
  FiltroDoMes,
  DefinicaoDeSenhaDoCliente,
} from "./publico";

export function criarApiClient(opcoes: OpcoesDoClient) {
  const requisicao = criarRequisicao(opcoes);

  return {
    publico: criarApiPublica(requisicao),
    barbeiro: criarApiBarbeiro(requisicao),
    cliente: criarApiCliente(requisicao),
    suporte: criarApiSuporte(requisicao),
  };
}

export type ApiClient = ReturnType<typeof criarApiClient>;
