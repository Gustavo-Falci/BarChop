// Gera components/<Comp>/preview.html, README.md e components/index.d.ts dos componentes do pacote.
// As prévias montam window.BarChop.<Comp> com dados de exemplo; os READMEs resumem os comentários do código.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { COMPONENTES, SAIDA } from "./caminhos.mts";

const DS = join(SAIDA, "components");

const LOGO = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#26221c"/><text x="60" y="74" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#f0c93a" text-anchor="middle">GR</text></svg>',
);

const SERVICO = `{ id: "s1", nome: "Corte social", duracaoMinutos: 30, preco: "35.00", ativo: true, categoria: "cabelo", descricao: "Tesoura e máquina, acabamento na navalha.", fotoUrl: null }`;
const SERVICO2 = `{ id: "s2", nome: "Barba completa", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: "barba", descricao: null, fotoUrl: null }`;

const C = {
  Botao: {
    grupo: "Ações", altura: 120,
    demo: `function Demo() {
  return h("div", { className: "linha" },
    h(B.Botao, null, "Confirmar agendamento"),
    h(B.Botao, { variante: "contorno" }, "Ver detalhes"),
    h(B.Botao, { variante: "fantasma" }, "Descartar"),
    h(B.Botao, { carregando: true }, "Salvando"),
    h(B.Botao, { disabled: true }, "Indisponível"));
}`,
    readme: `O botão do BarChop: a ação de um clique, com as variantes \`primario\` (ouro), \`contorno\` e \`fantasma\` e o estado \`carregando\`.

## Quando usar
- \`primario\`: a ação principal da tela. Um por tela ("Confirmar agendamento", "Cadastrar").
- \`contorno\`: ação secundária ao lado da principal.
- \`fantasma\`: ação leve, como "Descartar" na \`BarraDeMudancas\`.
- Para ir a outro lugar use \`BotaoLink\`, não \`Botao\` com \`onClick\`.

## Props
- \`variante\`: \`"primario" | "contorno" | "fantasma"\` (padrão \`primario\`).
- \`carregando\`: mostra o giro e desliga o botão. O \`disabled\` é real, não só estilo: o segundo clique na confirmação criaria outro agendamento.
- Todo atributo de \`<button>\` (\`type\`, \`onClick\`, \`disabled\`…). \`children\` é o rótulo: verbo com objeto.

## Na página pública
Lê \`--botao-fundo\`, \`--botao-texto\`, \`--botao-borda\` e \`--raio-botao\` quando a Aparência da barbearia define; sem isso, \`cor-accent\`, \`cor-on-accent\` e \`raio-md\`.`,
  },
  BotaoLink: {
    grupo: "Ações", altura: 96,
    demo: `function Demo() {
  return h("div", { className: "linha" },
    h(B.BotaoLink, { href: "#agendar" }, "Agendar horário"),
    h(B.BotaoLink, { href: "https://wa.me/5500000000000", variante: "contorno", externo: true }, "Chamar no WhatsApp"));
}`,
    readme: `Um link com a cara do \`Botao\`, para ações que levam a outro lugar.

## Quando usar
Agendar pra este cliente, abrir o WhatsApp, ir para outra tela. É \`<a>\`, não \`<button>\`: abre em outra aba, o leitor de tela anuncia como link e o endereço aparece ao passar o mouse.

## Props
- \`href\` (obrigatório), \`children\` (o rótulo).
- \`variante\`: as mesmas do \`Botao\`.
- \`externo\`: sai do app, abre em outra aba e não passa o referrer.`,
  },
  Aviso: {
    grupo: "Retorno", altura: 200,
    demo: `function Demo() {
  return h("div", { className: "pilha" },
    h(B.Aviso, null, "Esse horário acabou de ser ocupado. Escolha outro."),
    h(B.Aviso, { tom: "sucesso" }, "Cliente cadastrado."),
    h(B.Aviso, { tom: "atencao" }, "Data salva. Dois agendamentos ficaram fora do horário novo."));
}`,
    readme: `A mensagem que aparece depois de uma ação: erro, sucesso ou atenção.

## Quando usar
- \`erro\` (padrão): o que deu errado e como resolver.
- \`sucesso\`: confirma um cadastro ou uma mudança que não é óbvia pela tela seguinte.
- \`atencao\`: deu certo, mas tem consequência a cuidar.

Tem \`role="alert"\`: o leitor de tela anuncia quando aparece. Usa \`cor-erro\`/\`cor-erro-fundo\`, \`cor-ok\`/\`cor-ok-fundo\` e \`cor-atencao\`/\`cor-atencao-fundo\`.

## Props
- \`children\`: o texto, que diz o que aconteceu e, quando dá, o que fazer.
- \`tom\`: \`"erro" | "sucesso" | "atencao"\`.`,
  },
  Carregando: {
    grupo: "Retorno", altura: 320,
    demo: `function Demo() {
  return h("div", { className: "pilha" }, h(B.Carregando, null), h("hr", null), h(B.Carregando, { compacto: true }));
}`,
    readme: `O esqueleto da tela enquanto os dados chegam, com a forma da tela (título, apoio, cartões) no lugar de um "Carregando…" solto.

## Quando usar
Em toda busca que leva mais que um instante. Quando o conteúdo chega, ele cai no mesmo lugar em vez de empurrar a tela. O texto continua para o leitor de tela, num \`status\`.

## Props
- \`compacto\`: a versão de uma seção dentro da tela (três linhas, sem título nem cartões).`,
  },
  IndicadorDePasso: {
    grupo: "Agendar", altura: 120,
    demo: `function Demo() {
  return h("div", { className: "pilha" }, h(B.IndicadorDePasso, { atual: 1 }), h(B.IndicadorDePasso, { atual: 3 }));
}`,
    readme: `Onde o cliente está no fluxo de agendar: quatro segmentos e o "Passo 3 de 4" em texto.

## Quando usar
No topo de cada passo do agendamento público. O texto é o que o leitor de tela lê; os segmentos são só desenho.

## Props
- \`atual\`: \`1 | 2 | 3 | 4\`.`,
  },
  ItemDeServico: {
    grupo: "Agendar", altura: 150,
    demo: `function Demo() {
  const [marcados, setMarcados] = React.useState({ s1: true });
  const alternar = (id) => setMarcados((m) => ({ ...m, [id]: !m[id] }));
  return h("div", { className: "pilha" },
    h(B.ItemDeServico, { servico: ${SERVICO}, marcado: !!marcados.s1, aoAlternar: alternar }),
    h(B.ItemDeServico, { servico: ${SERVICO2}, marcado: !!marcados.s2, aoAlternar: alternar }));
}`,
    readme: `Uma linha de serviço com caixinha: nome, duração e preço, para escolher vários.

## Quando usar
Escolha de serviços em lista simples. Para o cartão com foto e próximos horários da página pública, use \`CartaoDeServico\`. É um \`input[type=checkbox]\` de verdade (teclado, leitor de tela).

## Props
- \`servico\`: \`ServicoSerializado\` (\`id\`, \`nome\`, \`duracaoMinutos\`, \`preco\` como string decimal "35.00", \`categoria\`, \`descricao\`, \`fotoUrl\`). O preço só vira "R$ 35,00" aqui, na borda.
- \`marcado\`, \`aoAlternar(id)\`.`,
  },
  Campo: {
    grupo: "Formulário", altura: 360,
    demo: `function Demo() {
  const [nome, setNome] = React.useState("Gustavo");
  const [tel, setTel] = React.useState("11987654321");
  const [senha, setSenha] = React.useState("segredo123");
  return h("div", { className: "pilha estreita" },
    h(B.Campo, { rotulo: "Seu nome", valor: nome, onChange: setNome }),
    h(B.Campo, { rotulo: "WhatsApp", formato: "telefone", valor: tel, onChange: setTel, apoio: "É por ele que chega o lembrete." }),
    h(B.Campo, { rotulo: "Senha", type: "password", valor: senha, onChange: setSenha, erro: "A senha precisa de pelo menos 8 caracteres." }));
}`,
    readme: `O campo de texto: rótulo visível em cima, apoio que fica, erro embaixo em \`cor-erro\`.

## Quando usar
Todo campo de texto, nas telas públicas e no painel. A dica que importa vai em \`apoio\`, não no placeholder, que some na primeira tecla. Senha ganha o botão de mostrar/esconder.

## Props
- \`rotulo\` (obrigatório), \`apoio\`, \`erro\`.
- \`valor\`, \`onChange(valor)\`: recebe a string, não o evento.
- \`formato="telefone"\`: aplica a máscara (DDD e número).
- \`type\` e os demais atributos de \`<input>\`.`,
  },
  LogoDaBarbearia: {
    grupo: "Marca", altura: 140,
    demo: `function Demo() {
  const url = ${JSON.stringify(LOGO)};
  return h("div", { className: "linha" },
    h(B.LogoDaBarbearia, { url, formato: "redonda", nome: "GR Barber", tamanho: "g" }),
    h(B.LogoDaBarbearia, { url, formato: "quadrada", nome: "GR Barber", tamanho: "m" }),
    h(B.LogoDaBarbearia, { url, formato: "livre", nome: "GR Barber", tamanho: "p" }));
}`,
    readme: `A logo de cada barbearia na moldura que o dono escolheu: redonda, quadrada (cantos arredondados) ou livre.

## Quando usar
Na página pública, no topo do fluxo de agendar, na marca do painel e na prévia da Aparência. Não é a marca BarChop: é a de cada cliente. A imagem da prévia é um exemplo.

## Props
- \`url\`, \`formato\`: \`"redonda" | "quadrada" | "livre"\`, \`nome\` (o texto alternativo).
- \`tamanho\`: \`"p" | "m" | "g"\`.
- \`decorativa\`: quando o nome já está escrito ao lado (o leitor de tela não lê duas vezes).`,
  },
  Chip: {
    grupo: "Retorno", altura: 110,
    demo: `function Demo() {
  return h("div", { className: "pilha" },
    h("div", { className: "linha" }, h(B.Chip, null, "Mais pedido"), h(B.Chip, { tom: "neutro" }, "30 min"), h(B.Chip, { tom: "ok" }, "Configurado"), h(B.Chip, { tom: "atencao" }, "Faltando"), h(B.Chip, { tom: "erro" }, "Recusado")),
    h("div", { className: "linha" }, h(B.Chip, { tamanho: "pequeno", tom: "neutro" }, "Inativo"), h(B.Chip, { tamanho: "pequeno", tom: "ok" }, "Conectada")));
}`,
    readme: `Etiqueta curta em pílula: estado, categoria ou destaque.

## Quando usar
- \`acento\` (padrão): destaque da marca.
- \`neutro\`: informação ("30 min", "Inativo").
- \`ok\`, \`atencao\`, \`erro\`: os estados ("Configurado", "Faltando", o que deu errado). O texto diz o estado; a cor só reforça.
- \`tamanho="pequeno"\`: o selo ao lado de um título. O normal é etiqueta de linha de lista.

## Props
- \`children\`, \`tom\`, \`tamanho\`: \`"normal" | "pequeno"\`.`,
  },
  Resumo: {
    grupo: "Agendar", altura: 90,
    demo: `function Demo() { return h(B.Resumo, { itens: ["2 serviços", "50 min", "R$ 60,00"] }); }`,
    readme: `A barra "2 serviços · 50 min" que acompanha os passos do agendamento.

## Quando usar
Nos passos que vêm depois da escolha de serviços, para o cliente não perder o que escolheu.

## Props
- \`itens\`: as partes, já escritas; o componente põe o separador.`,
  },
  MarcaDeConfirmado: {
    grupo: "Agendar", altura: 110,
    demo: `function Demo() {
  return h("div", { className: "centro" }, h(B.MarcaDeConfirmado, null), h("p", { className: "titulo" }, "Agendamento confirmado"));
}`,
    readme: `O ✓ do "Agendamento confirmado": o círculo aparece com uma mola firme e o traço se desenha por cima.

## Quando usar
Só na confirmação do agendamento: é o único momento de comemoração do fluxo. É decorativo; quem diz que deu certo é o título abaixo dele. Com "reduzir movimento", aparece sem animar.

## Props
Nenhuma.`,
  },
  ListaDeHorarios: {
    grupo: "Agendar", altura: 300,
    demo: `function Demo() {
  const [hora, setHora] = React.useState("14:30");
  const horarios = ["09:00", "09:30", "10:00", "11:30", "13:00", "14:00", "14:30", "15:00", "18:00", "18:30", "19:00"];
  return h(B.ListaDeHorarios, { horarios, selecionada: hora, aoEscolher: setHora });
}`,
    readme: `Os horários livres do dia em botões, agrupados por período (manhã, tarde, noite).

## Quando usar
No passo de escolher o horário. Período vazio some; um período só dispensa o cabeçalho.

## Props
- \`horarios\`: \`"HH:mm"\` com zero à esquerda, em ordem.
- \`selecionada\`: a hora marcada, quando a tela chega com uma.
- \`aoEscolher(hora)\`.`,
  },
  FaixaDeDias: {
    grupo: "Agendar", altura: 120,
    demo: `function Demo() {
  const dias = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];
  const disponiveis = { "2026-11-05": true, "2026-11-06": true, "2026-11-07": true, "2026-11-08": false, "2026-11-09": false, "2026-11-10": true, "2026-11-11": true, "2026-11-12": true };
  const [dia, setDia] = React.useState("2026-11-06");
  return h(B.FaixaDeDias, { dias, disponiveis, selecionada: dia, aoEscolher: setDia });
}`,
    readme: `Os próximos dias numa fila que rola de lado, com o dia da semana.

## Quando usar
No passo de escolher a data, acima do \`Calendario\`: quem agenda corte quase sempre quer "esta semana ou a próxima". Dia sem vaga aparece desligado.

## Props
- \`dias\`: \`"YYYY-MM-DD"\` em ordem.
- \`disponiveis\`: data → tem vaga.
- \`selecionada\`, \`aoEscolher(data)\`.`,
  },
  CartaoDeServico: {
    grupo: "Agendar", altura: 400,
    demo: `function Demo() {
  const [marcado, setMarcado] = React.useState(false);
  const agora = new Date("2026-11-05T12:00:00-03:00");
  const proximos = [
    { data: "2026-11-05", horaInicio: "14:00", href: "#" },
    { data: "2026-11-05", horaInicio: "14:30", href: "#" },
    { data: "2026-11-06", horaInicio: "09:00", href: "#" },
  ];
  return h("div", { className: "estreita" },
    h(B.CartaoDeServico, { servico: ${SERVICO}, marcado, aoAlternar: () => setMarcado((m) => !m), proximos, agora }));
}`,
    readme: `O cartão de um serviço na página pública: miniatura, nome, descrição, duração, preço e os próximos horários.

## Quando usar
Na escolha de serviços do cliente. O cartão inteiro é um \`<label>\` com checkbox de verdade; os próximos horários ficam fora dele, como links que levam direto à confirmação só com aquele serviço.

## Props
- \`servico\`: \`ServicoSerializado\`. Sem \`fotoUrl\`, a miniatura mostra a categoria.
- \`marcado\`, \`aoAlternar(id)\`.
- \`proximos\`: \`{ data, horaInicio, href }[]\`, agrupados por dia ("hoje 14:00 14:30").
- \`agora\`: a data de referência para "hoje" e "amanhã".`,
  },
  Calendario: {
    grupo: "Agendar", altura: 420,
    demo: `function Demo() {
  const [mes, setMes] = React.useState("2026-11");
  const dias = {};
  for (let d = 1; d <= 30; d++) { const k = "2026-11-" + String(d).padStart(2, "0"); dias[k] = d % 7 !== 2 && d % 7 !== 3; }
  const [dia, setDia] = React.useState("2026-11-12");
  return h("div", { className: "estreita" },
    h(B.Calendario, { mes, dias, agora: new Date("2026-11-05T12:00:00-03:00"), selecionada: dia, aoEscolher: setDia, aoTrocarMes: setMes }));
}`,
    readme: `A grade do mês para escolher uma data, com setas para o mês vizinho.

## Quando usar
No passo de escolher a data (abaixo da \`FaixaDeDias\`) e no painel, para pular de data. O passado fica desligado, a não ser com \`livre\`.

## Props
- \`mes\`: \`"YYYY-MM"\`. \`dias\`: data → tem vaga.
- \`agora\`: decide o que é passado.
- \`selecionada\`: a data marcada (o painel chega com uma).
- \`livre\`: todo dia escolhível, passado incluído.
- \`aoEscolher(data)\`, \`aoTrocarMes(mes)\`.`,
  },
};

const ESTILO = `html,body{margin:0}
body{padding:16px;background:var(--cor-paper);color:var(--cor-ink);font-family:var(--fonte-corpo);font-size:var(--texto-md);line-height:1.5}
.linha{display:flex;flex-wrap:wrap;gap:var(--espaco-sm);align-items:center}
.pilha{display:flex;flex-direction:column;gap:var(--espaco-md)}
.estreita{max-width:380px}
.centro{display:flex;flex-direction:column;align-items:center;gap:var(--espaco-sm)}
.titulo{margin:0;font-family:var(--fonte-display);font-weight:700;font-size:var(--texto-lg)}
hr{border:0;border-top:var(--borda-hairline) solid var(--cor-line);margin:0}`;

const semCartao = COMPONENTES.filter((nome) => !(nome in C));
if (semCartao.length) throw new Error(`componente sem prévia nem README: ${semCartao.join(", ")}`);

for (const [nome, c] of Object.entries(C)) {
  const pasta = join(DS, nome);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, "preview.html"), `<!-- @dsCard group="${c.grupo}" height=${c.altura} -->
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
${ESTILO}
</style>
</head>
<body>
<div id="raiz"></div>
<script>
const h = React.createElement;
const B = window.BarChop;
${c.demo}
ReactDOM.createRoot(document.getElementById("raiz")).render(h(Demo));
</script>
</body>
</html>
`);
  writeFileSync(join(pasta, "README.md"), c.readme + "\n");
}

writeFileSync(join(DS, "index.d.ts"), `// Tipos dos componentes do BarChop (apps/web/src/componentes). Documentação, não checados.
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";

export type CategoriaDeServico = "cabelo" | "barba" | "combo" | "sobrancelha" | "quimica" | "infantil";
export type FormatoDaLogo = "redonda" | "quadrada" | "livre";
export interface ServicoSerializado {
  id: string;
  nome: string;
  duracaoMinutos: number;
  /** Decimal em string ("35.00"), nunca number. */
  preco: string;
  ativo: boolean;
  categoria: CategoriaDeServico | null;
  descricao: string | null;
  fotoUrl: string | null;
}
export interface HorarioProximo { data: string; horaInicio: string; href: string; }

type Variante = "primario" | "fantasma" | "contorno";

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> { variante?: Variante; carregando?: boolean; }
export declare function Botao(props: BotaoProps): JSX.Element;

export interface BotaoLinkProps { href: string; variante?: Variante; externo?: boolean; children: ReactNode; }
export declare function BotaoLink(props: BotaoLinkProps): JSX.Element;

export interface AvisoProps { children: ReactNode; tom?: "erro" | "sucesso" | "atencao"; }
export declare function Aviso(props: AvisoProps): JSX.Element;

export interface CarregandoProps { compacto?: boolean; }
export declare function Carregando(props: CarregandoProps): JSX.Element;

export interface IndicadorDePassoProps { atual: 1 | 2 | 3 | 4; }
export declare function IndicadorDePasso(props: IndicadorDePassoProps): JSX.Element;

export interface ItemDeServicoProps { servico: ServicoSerializado; marcado: boolean; aoAlternar: (id: string) => void; }
export declare function ItemDeServico(props: ItemDeServicoProps): JSX.Element;

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  rotulo: string;
  /** Dica que fica (o placeholder some na primeira tecla). */
  apoio?: string;
  erro?: string;
  formato?: "telefone";
  valor?: string;
  onChange?: (valor: string) => void;
}
export declare function Campo(props: CampoProps): JSX.Element;

export interface LogoDaBarbeariaProps { url: string; formato: FormatoDaLogo; nome: string; tamanho?: "p" | "m" | "g"; decorativa?: boolean; className?: string; }
export declare function LogoDaBarbearia(props: LogoDaBarbeariaProps): JSX.Element;

export interface ChipProps { children: ReactNode; tom?: "acento" | "neutro" | "ok" | "atencao" | "erro"; tamanho?: "normal" | "pequeno"; }
export declare function Chip(props: ChipProps): JSX.Element;

export interface ResumoProps { itens: string[]; }
export declare function Resumo(props: ResumoProps): JSX.Element;

export type MarcaDeConfirmadoProps = Record<string, never>;
export declare function MarcaDeConfirmado(props: MarcaDeConfirmadoProps): JSX.Element;

export interface ListaDeHorariosProps { horarios: string[]; selecionada?: string; aoEscolher: (hora: string) => void; }
export declare function ListaDeHorarios(props: ListaDeHorariosProps): JSX.Element;

export interface FaixaDeDiasProps { dias: string[]; disponiveis: Record<string, boolean>; selecionada?: string; aoEscolher: (data: string) => void; }
export declare function FaixaDeDias(props: FaixaDeDiasProps): JSX.Element;

export interface CartaoDeServicoProps { servico: ServicoSerializado; marcado: boolean; aoAlternar: (id: string) => void; proximos: HorarioProximo[]; agora: Date; }
export declare function CartaoDeServico(props: CartaoDeServicoProps): JSX.Element;

export interface CalendarioProps {
  mes: string;
  dias: Record<string, boolean>;
  agora: Date;
  selecionada?: string;
  livre?: boolean;
  aoEscolher: (data: string) => void;
  aoTrocarMes: (mes: string) => void;
}
export declare function Calendario(props: CalendarioProps): JSX.Element;
`);
console.log("cartões:", Object.keys(C).length, "componentes com prévia e README");
