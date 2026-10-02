// Erro sem semântica de HTTP. O `ErroDeNegocio` da API estende
// `ErroHttp` e carrega status 422 — importar aquilo aqui traria o
// contrato HTTP inteiro pra dentro das telas. Quem traduz um no outro
// é o adaptador em apps/api/src/lib/telefone.ts.
export class TelefoneInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "TelefoneInvalido";
  }
}
