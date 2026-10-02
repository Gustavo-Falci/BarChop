# Telas mapeadas

O mapa original previa 23 telas, em três grupos. Dois desses grupos já
vieram maiores do que o mapa previa, uma vez construídos: o fluxo do
cliente ganhou uma oitava tela e o painel ganhou seis rotas a mais que
sua promessa original de seis. Hoje são 30 ao todo — 10 do app do
barbeiro (ainda não construído, contagem do mapa, sem revisão), 8 do
fluxo do cliente e 12 do painel. O padrão é sempre o mesmo: o mapa
subestimou, nunca superestimou, então o 23 continua valendo como
registro de onde a estimativa começou, não como contagem atual — cada
seção abaixo tem o número de verdade. O visual de cada uma está em
`docs/design-system.html` (abra no navegador — inclui toggle de
modo escuro pro app do barbeiro e pro painel).

## App do barbeiro (10 telas)

| Tela | O que faz |
|---|---|
| Login / cadastro | Autenticação; primeiro acesso também cadastra a Barbearia |
| Dashboard do dia | Resumo dos agendamentos de hoje, atalho pra novo agendamento |
| Agenda | Visão semanal/mensal, navegação entre dias |
| Novo agendamento | Criação manual (walk-in, telefone) — usa o mesmo motor de disponibilidade |
| Detalhe do agendamento | Editar, concluir, cancelar |
| Clientes | Lista com busca |
| Cadastro de cliente | Dados + histórico de agendamentos |
| Serviços | Lista com preço/duração |
| Cadastro de serviço | Nome, duração, preço |
| Configurações | Perfil, horário de funcionamento, canal de lembrete |

## Fluxo do cliente (8 telas — web público + app opcional)

O mapa previa sete. `/[slug]/entrar` é a oitava: existe porque "Meus
agendamentos" exige token e nenhuma tela do mapa fazia login. Ela cobre
também o primeiro acesso, sem o qual ninguém jamais teria senha.

| Tela | O que faz |
|---|---|
| Perfil da barbearia | Landing pública, ponto de entrada do link do WhatsApp |
| Escolha dos serviços | Checklist com soma de duração em tempo real |
| Escolha da data | Calendário — dias sem horário suficiente ficam desabilitados |
| Escolha do horário | Só mostra horários calculados como disponíveis |
| Dados do cliente | Nome + telefone (pulado se já logado no app opcional) |
| Confirma e agenda | Resumo final, confirma, dispara lembrete |
| Entrar | Login e primeiro acesso — pré-requisito de "Meus agendamentos" |
| Meus agendamentos | Só no app opcional — histórico, cancelar/remarcar |

## Painel web (12 rotas)

O mapa previa seis telas — Login, Dashboard, Agenda, Clientes, Serviços
e Configurações. São doze rotas, por duas razões.

Quatro são telas que este mapa deu ao app do barbeiro e não ao painel,
para a mesma função: detalhe do agendamento, novo agendamento, cadastro
de cliente e cadastro de serviço.

A décima segunda o mapa não tem em lugar nenhum: **criar barbearia**. O
primeiro acesso estava na tela de login do app do barbeiro, que é o
sub-projeto D; como o painel veio antes, ele é o único caminho pelo qual
uma barbearia pode existir.

| Rota | O que faz |
|---|---|
| `/painel/entrar` | Entrar, e criar a barbearia no primeiro acesso |
| `/painel` | Dashboard: contagem, ocupação, previsto e a lista do dia |
| `/painel/agenda` | O dia em faixas, com a semana em cima |
| `/painel/agendamentos/novo` | Cliente, serviços, data e horário numa tela |
| `/painel/agendamentos/[id]` | Status e observações |
| `/painel/clientes` | Lista com busca na URL |
| `/painel/clientes/novo` | Nome, telefone e email |
| `/painel/clientes/[id]` | Dados e histórico |
| `/painel/servicos` | Lista, inativos inclusive |
| `/painel/servicos/novo` | Nome, duração e preço |
| `/painel/servicos/[id]` | Editar, desativar e reativar |
| `/painel/configuracoes` | Barbearia, horários da semana e perfil |

O prefixo `/painel` existe porque o slug da barbearia não tem lista de
reservados: uma rota estática na raiz tornaria aquele slug inalcançável.
