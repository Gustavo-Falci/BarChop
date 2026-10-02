// Lê os claims de um JWT sem verificar a assinatura. Quem usa isto quer
// inspecionar o conteúdo do token, não validá-lo — a validação é o que a
// própria rota faz, e tem testes só dela.
export function decodificarPayload(token: string): Record<string, unknown> {
  const conteudo = token.split(".")[1];
  return JSON.parse(Buffer.from(conteudo, "base64url").toString());
}
