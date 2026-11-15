import { randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt do node:crypto, sem dependência externa e sem node-gyp.
//
// O formato guardado leva os parâmetros e o salt junto:
//
//   scrypt$n=65536,r=8,p=2$<salt>$<hash>
//
// Cada hash diz como foi feito, então subir o custo não invalida senha
// nenhuma: confere-se com o custo escrito nele, e o login que der certo
// regrava com o custo do momento (`precisaRegravar`). O formato de antes
// de 15/11 — `scrypt$<salt>$<hash>`, sem parâmetros — é o custo padrão
// do Node e continua valendo até a pessoa entrar de novo.

export interface CustoDoScrypt {
  n: number;
  r: number;
  p: number;
}

// O custo padrão do Node, que valia até a auditoria de 15/11 (SEC-015).
const CUSTO_DO_FORMATO_ANTIGO: CustoDoScrypt = { n: 16384, r: 8, p: 1 };

// N=2^16, r=8, p=2: uma das configurações que a OWASP dá como
// equivalentes pro scrypt (Password Storage Cheat Sheet). Entre elas,
// esta: 64 MB por derivação em vez dos 128 MB da de N=2^17, com o mesmo
// custo de CPU — a API roda numa VM pequena, e quatro logins ao mesmo
// tempo não podem pedir meio giga. Fica em uns 200 ms por login, oito
// vezes o de antes: é o que quem rouba o banco paga por tentativa.
export const CUSTO_DE_PRODUCAO: CustoDoScrypt = { n: 65536, r: 8, p: 2 };

// Nos testes, o custo antigo: a suíte cria centenas de contas, e com o
// custo de produção ela levaria minutos a mais sem testar nada de novo.
// O custo de produção tem os testes dele em tests/lib/senha.test.ts.
function custoDoAmbiente(): CustoDoScrypt {
  return process.env.NODE_ENV === "test" ? CUSTO_DO_FORMATO_ANTIGO : CUSTO_DE_PRODUCAO;
}

// Teto do que se aceita ler de um hash guardado. Um valor adulterado no
// banco não pode virar um pedido de gigabytes a cada login.
const MAIOR_N = 1 << 20;
const MAIOR_R = 32;
const MAIOR_P = 16;

const TAMANHO_SALT = 16;
const TAMANHO_HASH = 64;

function derivar(senha: string, salt: Buffer, custo: CustoDoScrypt): Promise<Buffer> {
  const opcoes: ScryptOptions = {
    N: custo.n,
    r: custo.r,
    p: custo.p,
    // O scrypt usa 128 × N × r bytes; o teto padrão do Node (32 MB) não
    // deixa passar de N=2^14. Com folga pro que o `p` soma.
    maxmem: 128 * custo.n * custo.r * 2,
  };
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, salt, TAMANHO_HASH, opcoes, (erro, hash) => (erro ? rejeitar(erro) : resolver(hash)));
  });
}

function escreverCusto({ n, r, p }: CustoDoScrypt): string {
  return `n=${n},r=${r},p=${p}`;
}

// null pra qualquer coisa fora do formato ou do teto: quem chama trata
// como hash que não confere.
function lerCusto(texto: string): CustoDoScrypt | null {
  const achado = /^n=(\d{1,10}),r=(\d{1,3}),p=(\d{1,3})$/.exec(texto);
  if (!achado) return null;
  const [n, r, p] = achado.slice(1).map(Number);
  // N tem que ser potência de 2 maior que 1, que é o que o scrypt aceita.
  const potenciaDeDois = n > 1 && (n & (n - 1)) === 0;
  if (!potenciaDeDois || n > MAIOR_N || r < 1 || r > MAIOR_R || p < 1 || p > MAIOR_P) return null;
  return { n, r, p };
}

interface HashLido {
  custo: CustoDoScrypt;
  salt: Buffer;
  esperado: Buffer;
  // O formato de antes de 15/11, sem os parâmetros no texto.
  antigo: boolean;
}

function lerHash(guardado: string): HashLido | null {
  const partes = guardado.split("$");
  if (partes[0] !== "scrypt") return null;

  const antigo = partes.length === 3;
  if (!antigo && partes.length !== 4) return null;

  const custo = antigo ? CUSTO_DO_FORMATO_ANTIGO : lerCusto(partes[1]);
  if (!custo) return null;

  const salt = Buffer.from(partes[antigo ? 1 : 2], "base64");
  const esperado = Buffer.from(partes[antigo ? 2 : 3], "base64");
  // timingSafeEqual estoura se os tamanhos diferem — conferir antes.
  if (esperado.length !== TAMANHO_HASH) return null;

  return { custo, salt, esperado, antigo };
}

export async function gerarHashSenha(
  senha: string,
  custo: CustoDoScrypt = custoDoAmbiente()
): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await derivar(senha, salt, custo);
  return `scrypt$${escreverCusto(custo)}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(
  senha: string,
  guardado: string
): Promise<boolean> {
  const lido = lerHash(guardado);
  if (!lido) return false;

  const calculado = await derivar(senha, lido.salt, lido.custo);
  return timingSafeEqual(calculado, lido.esperado);
}

// O hash guardado é mais fraco que o custo do momento, ou está no
// formato antigo? As rotas de login perguntam isto depois de a senha
// conferir — é o único instante em que a senha em texto está na mão —
// e regravam. Assim o banco migra sozinho, à medida que as pessoas
// entram, sem ninguém redefinir senha.
export function precisaRegravar(
  guardado: string,
  custo: CustoDoScrypt = custoDoAmbiente()
): boolean {
  const lido = lerHash(guardado);
  if (!lido) return false;
  if (lido.antigo) return true;
  const trabalho = (c: CustoDoScrypt) => c.n * c.r * c.p;
  return trabalho(lido.custo) < trabalho(custo);
}

// Hash de uma senha aleatória, no mesmo formato e tamanho de um real.
// Serve só pra dar a um login sem conta o mesmo custo de derivação do
// login com conta — ver o comentário na rota que usa isto. Tem que ser
// bem formado: um valor malformado sairia pelo atalho do conferirSenha
// sem derivar nada, que é justamente o vazamento que ele existe pra
// fechar.
//
// Sai com o custo do momento. Enquanto houver no banco hash do formato
// antigo (mais barato), o login de uma conta ainda não migrada responde
// um pouco mais rápido que o de uma conta que não existe; a diferença
// some conta a conta, no primeiro login certo de cada uma.
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

// O passo de migração das rotas de login: chamado depois de a senha
// conferir. Regrava o hash com o custo do momento quando o guardado é
// mais fraco. Não mexe em `senhaAlteradaEm`: a senha é a mesma, e as
// sessões abertas continuam valendo. A falha vai pro log e o login
// segue — a próxima entrada tenta de novo.
export async function regravarSeMaisFraco(
  guardado: string,
  senha: string,
  gravar: (novoHash: string) => Promise<unknown>,
  log: { warn(objeto: object, mensagem: string): void }
): Promise<void> {
  if (!precisaRegravar(guardado)) return;
  try {
    await gravar(await gerarHashSenha(senha));
  } catch (erro) {
    log.warn({ erro }, "não foi possível regravar o hash da senha com o custo novo");
  }
}
