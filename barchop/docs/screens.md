# Mapa de telas do SaaS

Todas as telas do BarChop, por onda. É um mapa, não uma especificação:
campo por campo e visual de cada tela ficam no plano da onda
(`.claude/plans/`), feito com `ecc:plan` quando a onda começa. O visual
base está em `docs/design-system.html`.

Legenda: ✅ existe · 🔧 existe e muda na onda indicada · 🆕 nova.
A coluna "Referência" aponta a tela equivalente do Barbeiro.app,
analisado em 2026-10-02.

As telas vivem em três superfícies do mesmo app Next (ADR-0002 e
ADR-0006): o **painel**, a **página pública** de cada barbearia
(`<slug>.barchop.com.br`, hoje `/[slug]`) e o **site** de marketing
(`www`).

## O que existe hoje (até 2026-10-02)

### Painel — 12 rotas

| Rota | O que faz | Muda em |
|---|---|---|
| `/painel/entrar` | Entrar, e criar a barbearia no primeiro acesso | 🔧 Onda 0 (esqueci a senha), 🔧 Onda 1 (cadastro vira tela própria) |
| `/painel` | Dashboard: contagem, ocupação, previsto e a lista do dia | 🔧 Onda 1 (painel do dia por profissional) |
| `/painel/agenda` | Dia, semana e mês, com eixo de tempo | 🔧 Onda 1 (colunas por profissional, bloqueios) |
| `/painel/agendamentos/novo` | Cliente, serviços, data e horário | 🔧 Onda 1 (escolhe o profissional) |
| `/painel/agendamentos/[id]` | Status e observações | 🔧 Onda 2 (registrar pagamento) |
| `/painel/clientes` | Lista com busca, filtro e paginação | — |
| `/painel/clientes/novo` | Nome, telefone e email | — |
| `/painel/clientes/[id]` | Dados e histórico | 🔧 Onda 3 (pontos, assinatura) |
| `/painel/servicos` | Lista, inativos inclusive | 🔧 Onda 1 (categorias) |
| `/painel/servicos/novo` | Nome, duração e preço | 🔧 Onda 1 (categoria, descrição, foto) |
| `/painel/servicos/[id]` | Editar, desativar e reativar | 🔧 Onda 1 (idem) |
| `/painel/configuracoes` | Barbearia, horários da semana e perfil | 🔧 Onda 0 (link/slug), 🔧 Onda 1 (lembretes, comodidades, fotos, contatos, pagamento) |

### Página pública — 6 telas e 2 redirects

| Rota | O que faz | Muda em |
|---|---|---|
| `/[slug]` | Perfil: apresentação, serviços com preço, aberto agora, horários | 🔧 Onda 1 (página rica) |
| `/[slug]/agendar` | Passo 1: serviços | 🔧 Onda 1 (passo do profissional) |
| `/[slug]/agendar/data` | Passo 2: dia e horário numa tela | 🔧 Onda 0 (some horário passado), 🔧 Onda 1 (por profissional) |
| `/[slug]/agendar/confirmar` | Passo 3: identificação, resumo, confirmação e sucesso com `.ics` | 🔧 Onda 3 (pagamento/sinal) |
| `/[slug]/entrar` | Login, primeiro acesso e esqueci a senha por código | 🔧 Onda 1 (código pelo WhatsApp), 🔧 Onda 4 (Google/Apple) |
| `/[slug]/minha-conta` | Meus agendamentos: cancelar e remarcar | 🔧 Onda 3 (assinatura, pontos, pedidos) |
| `/agendar/horario`, `/agendar/dados` | Redirects de URLs antigas | — |

## Onda 0 — Casa arrumada

| Tela | Superfície | O que muda | Referência |
|---|---|---|---|
| 🔧 Entrar no painel | painel | Caminho "Esqueci a senha": e-mail → código → nova senha | login do admin |
| 🔧 Configurações | painel | Lê por `GET /barbearias/me`; campo "Link da barbearia" com prévia e troca | — |
| 🔧 Criar barbearia | painel | Avisa quando o slug é reservado | prévia `suabarbearia.barbeiro.app` |

## Onda 1 — Agenda que funciona

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Cadastro do dono | painel | Tela dividida: promessa e mini-painel à esquerda, formulário à direita, prévia do link | `admin…/register` |
| 🆕 Onboarding | painel | Trilha de passos: barbearia → serviços → equipe → link → primeira reserva | trilha de 6 passos da central de ajuda |
| 🆕 Equipe | painel | Lista de profissionais com papel e status, convidar | Equipe |
| 🆕 Profissional | painel | Perfil, foto, papel (dono, profissional, recepção), serviços que faz, jornada da semana | Equipe |
| 🆕 Folgas e bloqueios | painel | Férias, almoço, horário bloqueado por profissional | bloqueio de horários e folgas |
| 🆕 Aceitar convite | painel | Profissional convidado define a senha e entra | — |
| 🔧 Painel do dia | painel | Previsto do dia, próximos clientes, por profissional | painel do dia |
| 🔧 Agenda | painel | Colunas por profissional; bloqueios visíveis; profissional vê só a própria | agenda da equipe |
| 🔧 Novo agendamento | painel | Escolhe o profissional | — |
| 🔧 Configurações | painel | Antecedência e canal do lembrete; comodidades; fotos; WhatsApp, Instagram, mapa; formas de pagamento | — |
| 🔧 Página da barbearia | pública | Capa, comodidades, aberto até, equipe com fotos, serviços por categoria com os próximos 3 horários livres, mapa e rota, contatos, formas de pagamento | Início da página pública |
| 🆕 Escolher profissional | pública | Passo entre serviços e horário, com "qualquer um" | fluxo de agendamento |
| 🆕 Confirmar ou cancelar | pública | Destino do link do lembrete; confirma ou cancela com um toque | resposta ao lembrete |

## Onda 1s — Site de marketing (mínimo)

| Tela | O que faz | Referência |
|---|---|---|
| 🆕 Landing | Promessa, dor, como funciona, prova, preços, FAQ, CTA final — versão curta das 17 seções | Home |
| 🆕 Preços | Seletor de profissionais, mensal/anual, planos e complementos | seção Preços |
| 🆕 Plano grátis | O que o grátis faz e o que não faz | `/gratis` |
| 🆕 Termos e privacidade | Legal e LGPD | `/terms`, `/privacy` |

Depois do mínimo: páginas de funcionalidade (template de 9 blocos),
`/comparar`, blog, sobre e metodologia.

## Onda 2 — Dinheiro

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Caixa do dia | painel | Entradas por forma de pagamento, abrir e fechar caixa | caixa do dia |
| 🆕 Comissões | painel | Regras por profissional e serviço; extrato do profissional | comissões |
| 🆕 Relatórios | painel | Faturamento, ocupação, faltas, clientes novos e recorrentes | relatórios |
| 🆕 Plano e assinatura | painel | Plano atual, uso dos limites, upgrade, teste de 14 dias, faturas | — |
| 🔧 Detalhe do agendamento | painel | Concluir com pagamento | — |

## Onda 3 — Retenção do cliente final

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Pagamento no agendar | pública | PIX, cartão ou no local; sinal quando a barbearia exige | pagamento no fluxo |
| 🆕 Pacotes | painel + pública | Combos com desconto | pacotes promocionais |
| 🆕 Clube de assinatura | painel + pública | Planos com usos por mês e regras; cobrança recorrente | `/membership` |
| 🆕 Fidelidade | painel + pública | Regras de pontos, níveis e recompensas; saldo do cliente | fidelidade |
| 🆕 Lista de espera | painel + pública | Entrar na fila de um horário cheio; aviso quando vagar | lista de espera |
| 🆕 Avaliação | pública | Nota e comentário depois do atendimento | avaliações |

## Onda 4 — Crescimento

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Loja | painel + pública | Produtos, estoque, preço no PIX, retirada no local, meus pedidos | `/shop` |
| 🆕 Indicação | painel + pública | Link por cliente, recompensa dupla, ranking | indicação |
| 🆕 Unidades | painel + pública | Cadastro de unidades; seletor "Qual unidade?" na página | seletor de unidade |
| 🆕 Campanhas | painel | Mensagens em massa para segmentos de clientes | campanhas |
| 🔧 Entrar (cliente) | pública | Google e Apple | modal de login |

## Onda 5 — Diferenciais

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Inbox do WhatsApp com IA | painel | Conversas, IA atendendo no número do dono, pausa quando o dono responde | WhatsApp com IA |
| 🆕 Assistente na página | pública | Chat com perguntas prontas (preços, horários, meus agendamentos) | assistente "Barba" |
| 🆕 NFS-e | painel | Configuração e emissão de nota | NFS-e |
| 🆕 Domínio próprio | painel | Apontar o domínio da barbearia | domínio próprio |
| 🆕 App do profissional | Expo | Agenda do dia, novo agendamento, clientes — o antigo sub-projeto D (10 telas mapeadas até 2026-10-02) | app do profissional |
