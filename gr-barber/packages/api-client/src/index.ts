import { criarApiBarbeiro } from "./barbeiro";
import { criarApiCliente } from "./cliente";
import { criarApiPublica } from "./publico";
import { criarRequisicao, type OpcoesDoClient } from "./requisicao";

export { ErroDaApi } from "./erro";
export { CODIGO_DO_CLIENTE_FALSO, criarApiClientFalso } from "./falso";
export type { EstadoFalso } from "./falso";
export { criarRequisicao } from "./requisicao";
export type {
  OpcoesDaChamada,
  OpcoesDoClient,
  Requisicao,
} from "./requisicao";
export type {
  ClienteComHistorico,
  CredenciaisDoBarbeiro,
  EdicaoDaBarbearia,
  EdicaoDoAgendamento,
  EdicaoDoCliente,
  EdicaoDoPerfil,
  EdicaoDoServico,
  NovaBarbearia,
  NovoCliente,
  NovoServico,
} from "./barbeiro";
export type {
  EdicaoDoMeuCadastro,
  FiltroDoHistorico,
  Remarcacao,
} from "./cliente";
export type {
  CredenciaisDoCliente,
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
  };
}

export type ApiClient = ReturnType<typeof criarApiClient>;
