import type { LightMyRequestResponse } from "fastify";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { normalizarTelefoneObrigatorio } from "../../src/lib/telefone";
import type { App } from "../../src/tipos";

export interface ClienteDeTeste {
  token: string;
  clienteId: string;
}

// O último código que o app mandou pra esse telefone. Nos testes o
// canal é o de memória (canalDoAmbiente com NODE_ENV=test), e é ali que
// o código "chega".
export function ultimoCodigo(app: App, telefone: string): string {
  const para = normalizarTelefoneObrigatorio(telefone);
  const canal = app.canal as CanalDeMemoria;
  const mensagem = [...canal.enviadas].reverse().find((m) => m.para === para);
  const codigo = mensagem?.texto.match(/\b\d{6}\b/)?.[0];
  if (!codigo) throw new Error(`nenhum código foi enviado pra ${para}`);
  return codigo;
}

// O caminho inteiro de quem prova o telefone e define a senha: pede o
// código, lê no canal e confirma. Devolve a resposta da confirmação
// pra quem quiser olhar status e corpo.
export async function definirSenhaComCodigo(
  app: App,
  slug: string,
  entrada: { telefone: string; senha: string; nome?: string }
): Promise<LightMyRequestResponse> {
  const pedido = await app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/codigo`,
    payload: { telefone: entrada.telefone },
  });
  if (pedido.statusCode !== 202) {
    throw new Error(`pedido de código falhou: ${pedido.statusCode} ${pedido.body}`);
  }

  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/senha`,
    payload: {
      telefone: entrada.telefone,
      codigo: ultimoCodigo(app, entrada.telefone),
      senha: entrada.senha,
      nome: entrada.nome ?? "João da Silva",
    },
  });
}

// Cria uma conta de cliente na barbearia do slug e devolve o token
// pronto. O telefone entra por parâmetro porque vários testes precisam
// de dois clientes na mesma barbearia — o segundo existe pra provar que
// o agendamento de um não é alcançável pelo outro.
export async function criarClienteComToken(
  app: App,
  slug: string,
  telefone = "11999998888"
): Promise<ClienteDeTeste> {
  const resposta = await definirSenhaComCodigo(app, slug, {
    telefone,
    senha: "senha-forte-123",
  });

  // 201 quando cria o cadastro, 200 quando ele já existia (o upsert do
  // agendamento público cria cadastro sem senha). Sem esta guarda, uma
  // falha apareceria como "token undefined" lá adiante, num 401 confuso
  // a três arquivos de distância.
  if (resposta.statusCode !== 201 && resposta.statusCode !== 200) {
    throw new Error(
      `definir senha falhou no helper: ${resposta.statusCode} ${resposta.body}`
    );
  }

  const corpo = resposta.json();
  return { token: corpo.token, clienteId: corpo.cliente.id };
}
