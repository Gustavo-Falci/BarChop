export interface Escolhas {
  servicoIds: string[];
  data?: string;
  hora?: string;
  // Quando presente, o fluxo está remarcando um agendamento existente
  // em vez de criar um novo.
  remarcar?: string;
  // Recado que atravessa uma navegação: a tela de destino monta do
  // zero, e estado local (useState) não sobrevive a isso. Vai na URL
  // pelo mesmo motivo que as outras escolhas do fluxo vão.
  aviso?: string;
  // Com quem (id do profissional). Ausente é "qualquer um": a API
  // escolhe quem estiver livre na hora.
  profissional?: string;
}

// Dia e horário são um passo só ("data"), e identificação e
// confirmação também ("confirmar"). As rotas antigas /agendar/horario
// e /agendar/dados ainda existem, só como redirect — ver
// src/fluxo/rotaAntiga.ts.
export type Passo = "servicos" | "profissional" | "data" | "confirmar";

const CAMINHO_DO_PASSO: Record<Passo, string> = {
  servicos: "/agendar",
  profissional: "/agendar/profissional",
  data: "/agendar/data",
  confirmar: "/agendar/confirmar",
};

export function lerEscolhas(query: URLSearchParams): Escolhas {
  return {
    // O filter tira id vazio de uma vírgula solta: vazio viraria
    // ?servicoIds= na chamada, e o pattern de uuid da API responderia
    // 400.
    servicoIds: (query.get("servicos") ?? "")
      .split(",")
      .filter((id) => id.length > 0),
    data: query.get("data") ?? undefined,
    hora: query.get("hora") ?? undefined,
    remarcar: query.get("remarcar") ?? undefined,
    aviso: query.get("aviso") ?? undefined,
    profissional: query.get("profissional") ?? undefined,
  };
}

export function montarQuery(escolhas: Escolhas): string {
  const params = new URLSearchParams();
  if (escolhas.servicoIds.length > 0) {
    params.set("servicos", escolhas.servicoIds.join(","));
  }
  if (escolhas.data) params.set("data", escolhas.data);
  if (escolhas.hora) params.set("hora", escolhas.hora);
  if (escolhas.remarcar) params.set("remarcar", escolhas.remarcar);
  // Por último e de propósito: as asserções de query existentes fixam
  // a ordem dos campos anteriores, e um campo novo no meio deslocaria
  // todas elas.
  if (escolhas.aviso) params.set("aviso", escolhas.aviso);
  // Depois do aviso, pelo mesmo motivo: entrou no bloco C da Onda 1.
  if (escolhas.profissional) params.set("profissional", escolhas.profissional);

  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function caminhoDoPasso(
  slug: string,
  passo: Passo,
  escolhas: Escolhas
): string {
  return `/${slug}${CAMINHO_DO_PASSO[passo]}${montarQuery(escolhas)}`;
}

// `Object.hasOwn` e NÃO o operador `in`: o `in` percorre a cadeia de
// protótipos, então `"toString"`, `"constructor"` e companhia passariam
// por passos válidos — e o valor vem da query, ou seja, de fora.
export function ehPasso(valor: unknown): valor is Passo {
  return typeof valor === "string" && Object.hasOwn(CAMINHO_DO_PASSO, valor);
}

// O passo pra onde voltar depois do login, lido da query. Aceita
// "dados" como sinônimo de "confirmar": era o passo de identificação
// antes de ele entrar na confirmação, e quem estava no meio do login
// durante a mudança chega com `voltar=dados` — cair no destino padrão
// jogaria fora o agendamento que a pessoa estava fazendo.
export function passoDoVoltar(valor: unknown): Passo | null {
  if (valor === "dados") return "confirmar";
  return ehPasso(valor) ? valor : null;
}

// Caminho pra tela de entrar carregando de onde o fluxo saiu.
//
// O destino NÃO viaja como URL pronta. Vai como o nome do passo, mais
// as escolhas que já estavam na query — e quem reconstrói o caminho do
// outro lado é o `caminhoDoPasso`, a partir do slug da própria rota.
// Assim nenhuma string vinda de fora chega no `router.push`: um
// `?voltar=https://outro-site` não casa com passo conhecido nenhum (ver
// `ehPasso`) e cai no destino padrão.
//
// Guardar a URL inteira num parâmetro seria o formato clássico do
// redirecionamento aberto, e validá-la por prefixo não bastaria:
// `//outro-site` é tratado como absoluto pelo navegador,
// `/<slug>/../../outro` é normalizado, e `/<slug>outro-site.com` passa
// por um `startsWith` sem a barra final.
export function caminhoDoLogin(
  slug: string,
  voltar: Passo,
  escolhas: Escolhas
): string {
  // `.slice(1)` tira o "?" que o montarQuery devolve; com a query
  // vazia ele devolve "", e o slice de "" continua "".
  const params = new URLSearchParams(montarQuery(escolhas).slice(1));
  params.set("voltar", voltar);
  return `/${slug}/entrar?${params.toString()}`;
}
