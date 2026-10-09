export { TelefoneInvalido } from "./erros";
export {
  apenasDigitos,
  formatarTelefoneParcial,
  normalizarTelefone,
  normalizarTelefoneObrigatorio,
} from "./telefone";
export { normalizarEmail } from "./email";
export { AREAS_DE_CONFIGURACAO, areasTocadas, juntarAreas, type AreaDeConfiguracao } from "./areas";
export { PADRAO_SLUG, slugReservado, sugerirSlug } from "./slug";
export {
  CATEGORIAS_DE_SERVICO,
  COMODIDADES,
  FORMAS_DE_PAGAMENTO,
  FORMATOS_DA_LOGO,
  PADRAO_INSTAGRAM,
  type CategoriaDeServico,
  type Comodidade,
  type FormaDePagamento,
  type FormatoDaLogo,
} from "./pagina";
export {
  ANTECEDENCIAS_MINUTOS,
  INTERVALOS_MINUTOS,
  JANELAS_DIAS,
  PRAZOS_HORAS,
  REGRAS_PADRAO,
  minutosAte,
  prazoDoClientePassou,
  regraQueRecusa,
  type Agora,
  type RecusaDeRegra,
  type RegrasDeAgendamento,
} from "./regras";
