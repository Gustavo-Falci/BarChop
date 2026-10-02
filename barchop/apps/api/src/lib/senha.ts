import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt do node:crypto, sem dependência externa e sem node-gyp. O
// formato guardado carrega o salt junto, então trocar de parâmetro no
// futuro é possível sem invalidar as senhas já cadastradas: basta
// olhar o prefixo antes de conferir.
const scryptAsync = promisify(scrypt) as (
  senha: string,
  salt: Buffer,
  tamanho: number
) => Promise<Buffer>;

const TAMANHO_SALT = 16;
const TAMANHO_HASH = 64;

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await scryptAsync(senha, salt, TAMANHO_HASH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(
  senha: string,
  guardado: string
): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  const salt = Buffer.from(partes[1], "base64");
  const esperado = Buffer.from(partes[2], "base64");

  // timingSafeEqual estoura se os tamanhos diferem — conferir antes.
  if (esperado.length !== TAMANHO_HASH) return false;

  const calculado = await scryptAsync(senha, salt, TAMANHO_HASH);
  return timingSafeEqual(calculado, esperado);
}

// Hash de uma senha aleatória, no mesmo formato e tamanho de um real.
// Serve só pra dar a um login sem conta o mesmo custo de derivação do
// login com conta — ver o comentário na rota que usa isto. Tem que ser
// bem formado: um valor malformado sairia pelo atalho do conferirSenha
// sem derivar nada, que é justamente o vazamento que ele existe pra
// fechar.
//
// Calculado sob demanda e guardado como a Promise, não o valor: assim,
// chamadas concorrentes que chegam antes da primeira resolução recebem
// a mesma promise em vez de cada uma disparar seu próprio scrypt — o
// `??=` some antes de qualquer `await`, então a checagem e a gravação
// são atômicas. Guardar o valor já resolvido (com `await` dentro do
// `??=`) deixaria uma janela no cold start em que pedidos concorrentes
// se veem com o cache ainda vazio e recalculam o hash cada um, e um
// deles pagaria dois scrypts (este mais o conferirSenha) contra o um
// do caminho de senha certa — o mesmo vazamento de tempo que a função
// existe pra fechar, só que restrito a essa janela.
//
// No topo do módulo exigiria await de nível superior, que o bundle CJS
// do tsup não tem.
let hashDescartavel: Promise<string> | null = null;

export function obterHashDescartavel(): Promise<string> {
  hashDescartavel ??= gerarHashSenha(randomUUID());
  return hashDescartavel;
}
