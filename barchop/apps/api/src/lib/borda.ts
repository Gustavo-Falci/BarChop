// A borda da API (Onda 1, G2): o que ela confia do proxy reverso que fica
// na frente (o Caddy, na VM da OCI) e de quais sites o navegador pode
// chamá-la. As duas vêm do ambiente e, em produção, são obrigatórias — a
// API se recusa a subir sem elas, como faz sem canal de mensagem.

type Ambiente = Record<string, string | undefined>;

function emProducao(env: Ambiente): boolean {
  return env.NODE_ENV === "production";
}

// Quantos saltos de proxy, contando de trás pra frente no
// X-Forwarded-For, são de confiança. É o que faz o `request.ip` ser o do
// cliente: atrás do Caddy, sem isto, todo mundo chega com o IP do Caddy e
// os limites por IP de `lib/limites.ts` somam o tráfego de todos num
// orçamento só. E não pode ser ligado sem proxy na frente: aí a API
// acreditaria num X-Forwarded-For que qualquer um escreve, e o limite por
// IP deixaria de limitar.
//
// Número, e não `true`: `true` confia na cadeia inteira, inclusive no
// que o próprio cliente pôs no começo dela.
export function proxiesConfiaveis(env: Ambiente): number | false {
  const valor = env.PROXIES_CONFIAVEIS;
  if (valor === undefined) {
    if (emProducao(env)) {
      throw new Error(
        "PROXIES_CONFIAVEIS ausente em produção: atrás do proxy, os limites por IP virariam um limite global"
      );
    }
    return false;
  }
  if (!/^[1-9]\d*$/.test(valor)) {
    throw new Error(`PROXIES_CONFIAVEIS deve ser um número inteiro de saltos (1 com só o Caddy), veio "${valor}"`);
  }
  return Number(valor);
}

// Uma origem da lista: exata, ou um coringa de UM nível de subdomínio
// (`https://*.barchop.com.br`, as barbearias no host próprio, ADR-0002).
export type ListaDeOrigens = (string | RegExp)[];

const FORMATO_DA_ORIGEM = /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/;

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sem a variável, fora de produção, qualquer origem: o painel local em
// localhost:3000 e os hosts `*.localhost` do tenant em dev. Em produção, a
// lista é obrigatória — `origin: true` deixaria qualquer site chamar a
// API com o navegador de quem está logado.
export function origensPermitidas(env: Ambiente): true | ListaDeOrigens {
  const valor = env.ORIGENS_PERMITIDAS;
  if (valor === undefined) {
    if (emProducao(env)) {
      throw new Error("ORIGENS_PERMITIDAS ausente em produção: a lista de sites que podem chamar a API");
    }
    return true;
  }

  return valor.split(",").map((bruta) => {
    const origem = bruta.trim();
    if (!FORMATO_DA_ORIGEM.test(origem)) {
      throw new Error(
        `ORIGENS_PERMITIDAS: "${origem}" não é uma origem (esquema e host, sem caminho; coringa só como https://*.dominio)`
      );
    }
    if (!origem.includes("://*.")) return origem;
    const [esquema, resto] = origem.split("://*.");
    return new RegExp(`^${escapar(esquema)}://[a-z0-9-]+\\.${escapar(resto)}$`);
  });
}

export function origemPermitida(lista: true | ListaDeOrigens, origem: string): boolean {
  if (lista === true) return true;
  return lista.some((item) => (typeof item === "string" ? item === origem : item.test(origem)));
}

// O formato que o Fastify aceita no `trustProxy`: o número de saltos, na
// forma de função (é o que o proxy-addr faz com um número — confia nos
// `saltos` mais próximos da API, contando do socket).
export function confiancaNoProxy(saltos: number | false): false | ((endereco: string, salto: number) => boolean) {
  if (saltos === false) return false;
  return (_endereco, salto) => salto < saltos;
}
