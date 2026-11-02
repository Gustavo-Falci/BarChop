# Plan: Redesenho dos detalhes e cadastros do painel (onda A)

**Fonte**: manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md` e o canvas do Claude Design, página "Detalhes e cadastros", 11 pranchas nos dois temas (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb, versão `1793577405-cf1e`). O dono aprovou o desenho em 01/11 e as cinco decisões abaixo. O canvas é direção, não especificação: regra de negócio e decisão registrada no código valem mais que ele (manual §18.4–5). As caixas tracejadas "Redesenho" das pranchas são notas, não vão pro código.

Primeira de quatro ondas do pedido do dono de 01/11 ("todas as outras telas que não tiveram redesign"): **A** detalhes e cadastros do painel → **B** o que o cliente vê → **C** o resto do painel (faturas, ajuda, cartaz, entrar, cadastro, convite, suporte) → **D** o site de divulgação.

## Telas da onda A (10 rotas, 7 componentes)
- `agendamentos/[id]` → `DetalheDoAgendamento` (+ `PagamentoDoAtendimento`)
- `agendamentos/novo` → `NovoAgendamento`
- `clientes/[id]` → `DetalheDoCliente`; `clientes/novo` → `CadastroDeCliente`
- `equipe/[id]` e `equipe/novo` → `CadastroDeMembro` (+ `JornadaDoMembro`, `ServicosDoMembro`)
- `servicos/[id]` e `servicos/novo` → `CadastroDeServico`
- `planos/[id]` e `planos/novo` → `CadastroDePlano`

## Decisões do dono (01/11)
1. **Interruptor × caixinha**: o que liga e desliga vira `Interruptor` (Atende clientes, Pode vender planos, Online na página, No balcão). Escolha de itens fica caixinha (serviços do plano, do membro e do agendamento; "Ilimitado").
2. **Salvar**: tela de editar salva pela `BarraDeMudancas` ("o que mudou"); tela de criar tem um botão só no fim, e o "Cancelar" sai (o "← voltar" faz isso).
3. **Concluir e registrar pagamento** abre numa folha de baixo.
4. **Categoria do serviço e cada dia da Jornada**: uma linha que abre a escolha numa folha (`FolhaDeEscolha`, como nas Regras).
5. **Títulos de seção** viram h2 como nas Configurações ("Serviços", "Cliente"), no lugar dos rótulos em caixa alta.

## Achados da conferência (01/11, 390px, escuro)
- **Andamento do agendamento em duas linhas**: Pendente, Confirmado e Concluído pedem 88 + 144 + 133 + 16 = 381px num `.caminho` de 306px (`flex-wrap`). Quebra em qualquer celular.
- **Vão de 88px** entre "Cancelar agendamento" e "Mudar horário" no cartão do agendamento; três estilos de botão no mesmo cartão.
- **Sem "← voltar"**: Editar serviço, Novo cliente, Novo agendamento. Título genérico em Editar serviço.
- **Pílula do cliente** no Novo agendamento quebra o telefone no meio ("90000-/0001").
- **Jornada**: três pílulas por dia, a "Folga" desce sozinha; a semana passa de 1.300px.
- **Categoria do serviço**: 7 pílulas em três linhas.
- **Cliente**: "Trocar" solto, sem dizer o quê; "E-mail —".

## PRs
### PR 1 — Detalhe do agendamento (feito em 01/11: branch local `redesenho-detalhes-pr1-agendamento`, `dfaa390`, sem PR ainda)
- Andamento numa linha (um passo por coluna, nome embaixo da bolinha).
- Mudar horário, Marcar falta e Cancelar agendamento em linhas do cartão; sem o vão.
- "Concluir e registrar pagamento" preso embaixo, com o valor.
- Títulos h2 (Serviços, Cliente); cliente numa linha que leva ao cadastro dele.
- Fora, de propósito: o cliente numa linha só (são dois links, nome e telefone) e o valor ao lado do botão preso.
- No computador, a coluna da situação ganhou `minmax(20rem, 1fr)` e o principal vem primeiro (`order: -1`): sem isso os nomes do andamento se sobrepunham.

### PR 2 — Concluir e registrar pagamento em folha
- `PagamentoDoAtendimento` abre numa folha de baixo (decisão 3); valores, desconto e gorjeta lado a lado.

### PR 3 — Novo agendamento
- Passo feito vira linha com o escolhido e "Trocar"; total e "Agendar" presos embaixo; "← Agenda" no lugar do "Cancelar".

### PR 4 — Cliente e Novo cliente
- WhatsApp e Agendar lado a lado; Próximos, Planos e Dados em seções; "De quem é este cliente" em linha que abre a folha. Novo cliente com "← Clientes" e um botão.

### PR 5 — Membro: dados (e Convidar)
- Atende clientes e Pode vender planos no `Interruptor`; salvar pela barra; Situação em seção própria.

### PR 6 — Membro: jornada
- Um dia por linha; tocar abre a folha com as três opções e os horários (decisão 4).

### PR 7 — Serviço (e Novo serviço)
- Título = nome do serviço, com "← Serviços"; categoria em linha que abre a folha; salvar pela barra.

### PR 8 — Plano (e Novo plano)
- Online e No balcão no `Interruptor`; serviços incluídos seguem em caixinha; salvar pela barra.

## Conferência visual
- Semente `apps/api/scripts/conferencia-visual.ts` + `next dev`; token em `sessao.barbeiro`.
- A cada PR: 360, 390 e 1280px, nos dois temas. Nada de concluir, cancelar ou marcar falta de verdade sem necessidade: a semente recria tudo, mas o teste cobre o salvar.
