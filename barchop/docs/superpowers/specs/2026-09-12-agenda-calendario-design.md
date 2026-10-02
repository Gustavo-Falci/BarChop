# Agenda com estrutura de calendário — design

Data: 2026-09-12
Substitui a tela `/painel/agenda` entregue no sub-projeto C (PR #10) por
três vistas — dia, semana e mês — com eixo de tempo e eventos de altura
proporcional à duração, na estrutura do Google Calendar.

## Contexto

`docs/screens.md:21` descreve a Agenda como **"Visão semanal/mensal,
navegação entre dias"**. O sub-projeto C entregou um dia por vez com uma
faixa de sete botões em cima, e registrou o desvio na decisão 3 da sua
spec:

> A visão de semana em colunas cobriria o "semanal" do mapa numa chamada
> só, mas num dia cheio o bloco fica pequeno demais para ler nome e
> serviço, e não é o desenho que existe.

Este design fecha a lacuna e **mantém a objeção de pé**: a vista de dia
continua existindo, e é lá que nome do cliente e serviços aparecem por
extenso. A coluna estreita da semana mostra o que couber; quem precisa
do detalhe clica no cabeçalho do dia. A objeção nunca foi contra a
semana existir — foi contra a semana ser a única.

## O que a leitura do código revelou

Três fatos que mudaram o desenho, todos verificados no código.

### A grade atual mente sobre o que está livre

`faixasDoDia` casa a faixa com o agendamento por `horaInicio` apenas:

```ts
agendamentos.find((a) => a.horaInicio === hora && a.status !== "cancelado")
```

`horaFim` existe em `AgendamentoSerializado` e a tela nunca o lê. Um
corte de 09:00–10:00 aparece na faixa das 09:00, e **09:15, 09:30 e
09:45 são renderizadas como "livre", com botão que leva a criar um
agendamento em cima da cadeira ocupada.**

A API recusaria o agendamento resultante — a exclusion constraint pega —
mas o barbeiro só descobre depois de preencher a tela inteira. E, olhando
a agenda, ele lê três quartos de hora vagos que não existem.

Altura proporcional à duração não é acabamento aqui: é a correção.

### Dois agendamentos podem se sobrepor, e um some

`GET /agendamentos` filtra por `barbeariaId` (`routers/agendamentos.ts:214`)
— devolve a barbearia inteira. A exclusion constraint é
`EXCLUDE USING gist (barbeiro_id WITH =, periodo WITH &&)`
(`migration.sql:174`): impede sobreposição **por barbeiro**, não por
barbearia. E `serializarAgendamento` não devolve `barbeiroId`.

Com dois barbeiros, dois agendamentos sobrepostos voltam na mesma lista,
o `.find()` fica com o primeiro e o segundo **desaparece sem aviso**.

Hoje isso é latente: `barbeiro.create` aparece num lugar só, o signup
(`routers/auth.ts:60`), e não há rota que adicione um segundo barbeiro a
uma barbearia existente. Toda barbearia tem exatamente um.

**Decisão:** a grade trata sobreposição de forma defensiva — renderiza os
eventos lado a lado em pistas — e **não** se constrói UI de multi-barbeiro
nem se muda a API. A primeira parte custa pouco e remove um modo de falha
silencioso; a segunda seria especular sobre um recurso que não existe.

Quando o segundo barbeiro existir, a dívida é de API: `barbeiroId` no
payload, para poder rotular a pista. Fica registrada aqui, não resolvida.

### A semana e o mês já estão pagos

Nenhuma rota nova é necessária:

- `agendamentosDoIntervalo(de, ate)` devolve `AgendamentoComCliente[]` e
  **a tela já chama** — é o que alimenta o pontinho da faixa de dias.
- `horarios()` devolve os sete dias de uma vez.

A tela passa de duas chamadas (`agendamentosDoDia` + `agendamentosDoIntervalo`)
para uma, com os limites variando por vista.

## Por que linhas de cinco minutos

`duracaoMinutos` é validado como `multipleOf: 5`, mínimo 5, máximo 480
(`routers/servicos.ts:21`). Os horários de início caem na grade de 15
minutos do `packages/scheduling`, que também é múltipla de 5.

Logo, **toda duração e todo início alinham exatamente a uma grade de 5
minutos** — não há arredondamento em lugar nenhum, nem hoje nem para
qualquer serviço que o barbeiro venha a cadastrar.

Um dia de nove horas são 108 linhas. Uma `grid-template-rows` de 108
faixas é barata: são definições de trilha, não elementos.

## Decisões

1. **Três vistas: dia, semana e mês.** Dia e semana compartilham o mesmo
   eixo de tempo e o mesmo componente, mudando só o número de colunas. O
   mês é outro modelo — célula por dia, agendamentos como chips — porque
   não existe eixo de tempo legível num mês.
2. **CSS Grid, não posicionamento absoluto.** O evento ocupa
   `grid-row: início / span duração`; o CSS posiciona e o domínio só
   devolve índices. Slots livres e eventos vivem na mesma grade, então
   cada slot livre continua sendo um `<button>` de verdade — alcançável
   por teclado, como já é hoje. Posicionamento absoluto precisaria da
   mesma camada de slots ao fundo, sem ganhar nada: a exatidão ao minuto
   que ele compra é exatidão que a granularidade de 5 já garante.
3. **Nenhuma biblioteca de calendário.** `apps/web` não tem nenhuma
   dependência de UI — todos os componentes são CSS Modules à mão.
   Introduzir FullCalendar ou react-big-calendar significaria temar tudo
   de novo para o neobrutalismo, e não entregaria nada ao sub-projeto D:
   React Native não roda essas bibliotecas. O que viaja para o Expo é a
   matemática, e ela fica no módulo puro.
4. **`grade.ts` é reescrito em `apps/web`, não promovido agora.** A
   memória do projeto pede promover `grade.ts` e `metricas.ts` para
   `packages/` antes que o app do Expo os copie, porque "copiar primeiro
   e extrair depois é como os dois divergem". O risco que essa regra
   guarda é a cópia, e não há cópia acontecendo aqui. Promover agora
   congelaria a API do módulo antes do segundo consumidor existir, com
   base em suposições sobre um app ainda não desenhado. O módulo nasce
   puro e pronto para promover; a promoção acontece no começo do D.
5. **Estado na URL: `?vista=` e `?data=`.** Mesma postura do filtro de
   busca dos Clientes — o link continua compartilhável e recarregar não
   perde o lugar. `?vista=` inválido cai no padrão em silêncio, como a
   validação do tema já faz.
6. **Padrão é a semana.** É a vista que o mapa pede primeiro e a que
   responde "como está minha semana". Links existentes com `?data=`
   continuam válidos: ganham a semana daquele dia.
7. **Desktop-first.** Abaixo de 900px a semana cai para o dia. O cliente
   móvel do barbeiro é o sub-projeto D, o app do Expo — não esta tela.

## Módulo de domínio

`apps/web/src/painel/grade.ts`, reescrito. Funções puras sobre
`@barchop/types`: sem React, sem DOM, sem relógio próprio (`agora`
entra por parâmetro, como em toda tela que olha o relógio).

```ts
export const MINUTOS_POR_LINHA = 5;

export interface EventoPosicionado {
  agendamento: AgendamentoComCliente;
  linha: number;    // 1-based, entra direto em grid-row
  linhas: number;   // span
  pista: number;    // 0-based; qual pista dentro do grupo sobreposto
  pistas: number;   // quantas pistas o grupo tem
}

export interface FaixaLivre {
  hora: string;     // "HH:mm" — o que vai na URL de novo agendamento
  linha: number;
  linhas: number;
  passada: boolean;
}

export interface ColunaDeDia {
  data: string;
  fechado: boolean;
  eventos: EventoPosicionado[];
  livres: FaixaLivre[];
}

export interface GradeDeTempo {
  minutoInicial: number;
  minutoFinal: number;
  totalLinhas: number;
  colunas: ColunaDeDia[];
  // Onde desenhar a linha do agora, ou null se o instante não cai
  // dentro da janela mostrada.
  agora: { data: string; linha: number } | null;
}

export function gradeDeTempo(entrada: {
  dias: string[];   // 1 dia (vista dia) ou 7 (semana) — mesma função
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
  agora: Date;
}): GradeDeTempo;

export interface CelulaDoMes {
  data: string;
  doMes: boolean;   // false nos dias de preenchimento das bordas
  fechado: boolean;
  agendamentos: AgendamentoComCliente[];
}

export function gradeDoMes(entrada: {
  mes: string;      // "YYYY-MM"
  horarios: HorarioSerializado[];
  agendamentos: AgendamentoComCliente[];
}): CelulaDoMes[];  // sempre semanas completas: 35 ou 42
```

`diasDaSemana` é mantida como está.

### A janela de tempo

`minutoInicial` e `minutoFinal` saem da **união dos horários de
funcionamento dos dias mostrados**. Uma barbearia das 09 às 18 não
renderiza 00:00–24:00 com 60% de vazio.

**A janela estica para conter todo agendamento que exista, mesmo fora do
horário de funcionamento.** Sem isso, mudar o horário de funcionamento
depois de um agendamento marcado o tornaria invisível — e agendamento
invisível na agenda é a pior falha que esta tela pode ter. O caso é real:
`PATCH /horarios` não valida contra agendamentos existentes.

Se todos os dias mostrados estiverem fechados e não houver agendamento
nenhum, não há janela: a vista mostra o estado vazio.

### Sobreposição em pistas

Eventos que se cruzam no tempo formam um grupo. O grupo tem N pistas; cada
evento ocupa uma. Um evento sozinho tem `pistas: 1` e ocupa a coluna
inteira — que é o caso de 100% dos dados hoje, com um barbeiro por
barbearia.

## Componentes

| Arquivo | Papel |
|---|---|
| `componentes/GradeDeTempo.tsx` | dia e semana; muda o nº de colunas |
| `componentes/GradeDoMes.tsx` | células do mês com chips |
| `componentes/SeletorDeVista.tsx` | `[Dia][Semana][Mês]` e `‹ Hoje ›` |
| `telas/painel/Agenda.tsx` | orquestra; renomeia `AgendaDoDia.tsx` |

`GradeDeAgenda.tsx` é substituído por `GradeDeTempo.tsx`.

### O que cada bloco mostra

- **Dia** — hora, nome completo do cliente, serviços por extenso.
- **Semana** — hora e primeiro nome; serviços só quando a altura do
  bloco comportar. É a concessão que a decisão 3 da spec do painel
  previu, e a razão de a vista de dia continuar existindo.
- **Mês** — chip de uma linha: hora e primeiro nome. Passando de quatro
  num dia, os três primeiros e um `+N`, que leva à vista de dia.

Uma coluna de dia fechado não fica em branco: recebe hachura e o rótulo
"Fechado", para que fechado se distinga de aberto-e-vazio. São estados
diferentes, e confundi-los faz o barbeiro achar que perdeu o dia.

### Navegação

`‹ ›` anda no passo da vista corrente — um dia, uma semana, um mês — e
`Hoje` volta para a data de hoje sem trocar a vista. Trocar de vista
preserva a data: quem está na semana do dia 10 e clica em "Mês" vê
setembro, não o mês corrente.

### A linha do agora

Uma régua horizontal na coluna do dia corrente, na posição do minuto
atual. Não usa `--cor-accent`, que já significa "selecionado" no painel,
nem o vermelho de erro `#b3261e`, que significa falha. Usa `--cor-ink`
com um marcador na ponta esquerda.

Ela não se move sozinha: `agora` entra por parâmetro e a tela não monta
temporizador. Quem recarrega ou navega vê a linha atualizada. Um relógio
vivo é escopo que esta tela não precisa para ser correta.

## Dados

Uma chamada, com limites por vista:

| Vista | Intervalo |
|---|---|
| dia | `data` … `data` |
| semana | domingo … sábado da semana de `data` |
| mês | primeira … última célula da grade (inclui as bordas do mês vizinho) |

`horarios()` é uma chamada só, independente da vista.

O mês pede o intervalo da **grade inteira**, não do mês civil: as células
de preenchimento mostram agendamentos reais dos meses vizinhos, e buscar
só o mês civil as deixaria falsamente vazias.

## Erros

Postura idêntica à atual, sem caminho novo:

- erro ao carregar agendamentos → `Aviso`, bloqueia a tela;
- erro ao carregar horários → `Aviso`, bloqueia. Sem os horários não há
  janela de tempo, e a tela ficaria em "Carregando…" para sempre
  esperando uma resposta que já chegou como erro.

## Testes

**Domínio, puro e sem DOM:**

- um agendamento de 60 minutos não deixa nenhuma faixa livre dentro do
  seu span — a regressão do bug que motivou o trabalho;
- dois agendamentos sobrepostos produzem duas pistas, e nenhum some;
- a janela estica para conter agendamento fora do horário de
  funcionamento;
- dia fechado não gera coluna com faixas;
- a grade do mês sempre fecha em semanas completas, e marca `doMes:
  false` nas bordas.

**Componentes:**

- o `grid-row` calculado corresponde ao horário do agendamento;
- a linha do agora aparece na coluna certa, e não aparece quando o
  instante cai fora da janela;
- clicar numa faixa livre navega para `/painel/agendamentos/novo` com
  data e hora;
- faixa passada não oferece criar — comportamento atual, preservado.

**Preservado:** a string "Fechado neste dia." e a intenção dos seis
testes atuais de `agenda.test.tsx`.

Toda asserção é traçada contra a **remoção** do ramo, não só contra a
inversão — a terceira armadilha registrada na memória do projeto.

## Fora de escopo

- Arrastar para mover e redimensionar para mudar a duração. `PATCH
  /agendamentos/:id` aceita só `status` e `observacoes`: remarcar não
  existe no escopo do barbeiro, e a UI não pode oferecer o que a API
  recusa.
- UI de multi-barbeiro e `barbeiroId` no payload — ver acima.
- Popover de "+N mais" no mês; o `+N` navega para o dia.
- Relógio vivo na linha do agora.
- **A tela "Hoje".** Ela passa a se sobrepor com a vista de dia: lista os
  agendamentos de hoje e mostra três números. Decidir se ela vira só os
  números, ou se desaparece, é trabalho próprio — não se resolve de
  passagem nesta leva.
