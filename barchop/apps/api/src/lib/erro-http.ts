// Erro que já sabe qual resposta HTTP quer. O tratador central lê
// `status` e `codigo` daqui em vez de deduzir o código a partir do
// status — dedução que dava certo enquanto o único sub-500 nosso era o
// 400 da validação de schema, e passa a errar assim que existe 404 ou
// 409 de domínio.
export class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroHttp";
    this.status = status;
    this.codigo = codigo;
  }
}

// Recurso que não existe — ou que existe, mas é de outra barbearia. Os
// dois casos respondem igual de propósito: um 403 confirmaria que o id
// existe em algum lugar da plataforma.
export function naoEncontrado(mensagem = "recurso não encontrado"): ErroHttp {
  return new ErroHttp(404, "nao_encontrado", mensagem);
}

// Estado do banco impede a escrita: telefone repetido na barbearia,
// slug já usado, horário já ocupado.
export function conflito(mensagem: string): ErroHttp {
  return new ErroHttp(409, "conflito", mensagem);
}
