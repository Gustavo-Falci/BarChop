import { ErroHttp } from "./erro-http";

// Regra de negócio violada — requisição bem formada, mas que o domínio
// recusa. Sempre 422, nunca 400 (que é validação de schema) nem 500
// (que é bug nosso). Estende ErroHttp pra o tratador central ter um
// branch só: quem lança escolhe status e código, o plugin só repassa.
export class ErroDeNegocio extends ErroHttp {
  constructor(mensagem: string, codigo = "regra_de_negocio") {
    super(422, codigo, mensagem);
    this.name = "ErroDeNegocio";
  }
}
