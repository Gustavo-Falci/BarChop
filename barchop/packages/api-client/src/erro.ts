// O corpo de erro da API é sempre { erro, mensagem? } — garantido pelo
// tratador central em apps/api/src/plugins/erros.ts. As telas ramificam
// no `codigo`, nunca no status solto: 409 pode ser telefone repetido
// (`conflito`) ou horário tomado (`horario_ocupado`), e a reação certa
// é diferente.
export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly mensagem: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem || codigo);
    this.name = "ErroDaApi";
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}
