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

## O que existe hoje (2026-10-16)

Tudo no ar. As tabelas por onda, mais abaixo, guardam de onde cada
tela veio; esta é a foto de agora.

### Painel — 32 rotas

| Rota | O que faz | Muda em |
|---|---|---|
| `/painel/entrar` | Entrar e "Esqueci a senha" (e-mail → código → senha nova) | — |
| `/painel/cadastro` | Cadastro do dono: link sugerido pelo nome, código no e-mail, aceite dos termos | — |
| `/painel/convite` | Profissional convidado define a senha e entra | — |
| `/painel` | Hoje: trilha dos primeiros passos (só o dono), agendamentos hoje, ainda hoje e previsto, próximos atendimentos com "Agora", ocupação da casa e por profissional, cartão do link com QR | 🔧 Onda 2 (caixa do dia) |
| `/painel/cartaz` | Cartaz do link com QR, pra imprimir | — |
| `/painel/agenda` | Dia, semana e mês, com eixo de tempo; dia em colunas por profissional, semana com pílulas por profissional; fora do expediente e pausa sombreados; horários livres com a hora escrita, clique de 15 em 15; faixa de resumo, "Agora" e "Bloquear" | — |
| `/painel/agendamentos/novo` | Cliente, serviços, profissional, data e horário; Cancelar volta pra tela anterior | — |
| `/painel/agendamentos/[id]` | Status e observações, sem caixas (Salvar/Descartar só quando muda); "Lembrar pelo WhatsApp"; presença confirmada pelo lembrete | 🔧 Onda 2 (registrar pagamento) |
| `/painel/clientes` | Lista com busca e pílulas Todos / Vieram em 30 dias / Sem registro em 90 dias, contadas no servidor | 🔧 Onda 3 (segmentos) |
| `/painel/clientes/novo` | Nome, telefone e e-mail | — |
| `/painel/clientes/[id]` | Resumo, WhatsApp e Agendar no topo; histórico em Próximos e Anteriores; dados | 🔧 Onda 3 (pontos, assinatura) |
| `/painel/servicos` | Lista por categoria (lista fechada), pílulas, busca, "Onde aparece"; inativos atenuados | — |
| `/painel/servicos/novo`, `/painel/servicos/[id]` | Nome, duração, preço, categoria em pílulas, descrição e foto, com a prévia "Como o cliente vê"; desativar e reativar | — |
| `/painel/equipe` | Lista com papel e situação, pílulas Todos / Atendem / Convites pendentes / Inativos | — |
| `/painel/equipe/novo` | Convidar por e-mail (só o dono); respeita o limite de profissionais do plano | — |
| `/painel/equipe/[id]` | Dados, foto, papel, serviços que faz, jornada da semana com pausa, situação — cada grupo salva sozinho | — |
| `/painel/bloqueios` | Folgas e bloqueios: dia inteiro ou só algumas horas, atalhos de motivo | — |
| `/painel/configuracoes` | Índice "X de N decididas": Operação (Horários, Regras de agendamento) e Canais com clientes (Dados do negócio, Aparência, Comunicação, Notificações), mais o Seu perfil | — |
| `/painel/configuracoes/horarios` | Horário da semana com pausa, rotina pronta, exceções por data | — |
| `/painel/configuracoes/regras-de-agendamento` | Intervalo entre horários, antecedência mínima, janela da agenda, prazo pro cliente remarcar ou cancelar | — |
| `/painel/configuracoes/dados-do-negocio` | Abas Identidade (nome, endereço, apresentação, link), Marca (logo e capa) e Comodidades (comodidades e formas de pagamento) | — |
| `/painel/configuracoes/aparencia` | 17 temas, cores, fontes, cantos, botões, cards e layout dos serviços; rascunho, prévia (celular/computador, modo escuro) e publicar | — |
| `/painel/configuracoes/comunicacao` | Telefone, botão de WhatsApp e Instagram da página | — |
| `/painel/configuracoes/notificacoes` | Lembrete por e-mail: ligado e antecedência | 🔧 quando a Meta sair do standby (WhatsApp) |
| `/painel/configuracoes/perfil` | O perfil de quem está logado (pra profissional e recepção, é a tela inteira de Configurações) | — |
| `/painel/faturas` | Só o dono. Sem plano pago: Plano → Pagamento (cartão; Pix e Boleto "Em breve") → Acesso liberado. Com plano pago: Seu plano, faturas da Stripe (inclusive reembolsadas) e Gerenciar assinatura (Portal) | — |
| `/painel/faturas/cancelado` | Volta do Checkout desistido | — |
| `/painel/ajuda` | Central de ajuda: perguntas por assunto, com busca | — |
| `/painel/suporte/entrar`, `/painel/suporte` | Suporte da plataforma: entrar e a fila de pedidos de troca de link | — |
| `/painel/suporte/avisos` | Publicar aviso pra todas as barbearias e ver quantos leram | — |

Em todas as telas do painel, a **barra do topo**: Novidades, Central de
ajuda, Aparência do painel (claro, escuro ou sistema), o sino de
notificações (Não lidas / Todas / Avisos) e o menu da conta (Minha
conta, Faturas, Indique e ganhe "Em breve", Sair).

### Página pública — 8 telas e 2 redirects

Em `<slug>.barchop.com.br` (no desenvolvimento, `/[slug]`). Segue o
tema do aparelho e a Aparência publicada pelo dono.

| Rota | O que faz | Muda em |
|---|---|---|
| `/` | Capa, logo, aberto agora, serviços por categoria (lista ou abas) com os próximos horários, equipe, horário, comodidades, pagamento, contatos e mapa | 🔧 Onda 2 (planos da barbearia) |
| `/agendar` | Passo 1: serviços | — |
| `/agendar/profissional` | Passo 2: profissional ou "qualquer um" | — |
| `/agendar/data` | Passo 3: dia e horário numa tela | — |
| `/agendar/confirmar` | Passo 4: identificação, resumo, confirmação e sucesso com `.ics` | 🔧 Onda 3 (pagamento/sinal) |
| `/entrar` | Login, primeiro acesso e esqueci a senha por código no e-mail | 🔧 Onda 4 (Google/Apple) |
| `/minha-conta` | Meus agendamentos: cancelar e remarcar | 🔧 Onda 3 (assinatura, pontos) |
| `/lembrete/[token]` | Confirmar ou cancelar pelo link do lembrete | — |
| `/agendar/horario`, `/agendar/dados` | Redirects de URLs antigas | — |

### Site — 5 páginas

Em `barchop.com.br`, sempre claro: `/` (promessa, como funciona,
tabela dos planos), `/precos`, `/gratis`, `/termos` e `/privacidade`.

## Onda 0 — Casa arrumada

| Tela | Superfície | O que muda | Referência |
|---|---|---|---|
| 🔧 Entrar no painel | painel | Caminho "Esqueci a senha": e-mail → código → nova senha | login do admin |
| 🔧 Configurações | painel | Lê por `GET /barbearias/me`; campo "Link da barbearia" com prévia e troca | — |
| 🔧 Criar barbearia | painel | Avisa quando o slug é reservado | prévia `suabarbearia.barbeiro.app` |

## Onda 1 — Agenda que funciona

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| ✅ Cadastro do dono | painel | Tela dividida: promessa e mini-painel à esquerda, formulário à direita, prévia do link — `/painel/cadastro` no F1, link sugerido pelo nome; código no e-mail antes de criar (F3) | `admin…/register` |
| ✅ Onboarding | painel | Trilha de passos no topo do painel do dia, só pro dono: horário → serviço → equipe (ou "Trabalho sozinho") → copiar link → primeira reserva pelo link (bloco F2) | trilha de 6 passos da central de ajuda |
| ✅ Equipe | painel | Lista com e-mail sob o nome, papel, situação (Ativo / Convite pendente / Inativo) e pílulas Todos / Atendem / Convites pendentes / Inativos; convidar (bloco A; painel v2, marco 5) | Equipe |
| ✅ Profissional | painel | Perfil, foto, papel (dono, profissional, recepção), serviços que faz, jornada da semana — perfil, papel e "atende" no bloco A; jornada e serviços no B4; foto no bloco E; sem caixas no #110 | Equipe |
| ✅ Folgas e bloqueios | painel | Férias, almoço, horário bloqueado por profissional (`/painel/bloqueios`, bloco B) | bloqueio de horários e folgas |
| ✅ Aceitar convite | painel | Profissional convidado define a senha e entra (`/painel/convite`, bloco A) | — |
| ✅ Painel do dia (Hoje) | painel | Painel v2, marco 4 (PRs #75, #76 e `painel-v2-hoje-dia`): agendamentos hoje, ainda hoje e previsto; próximos atendimentos (até 5, "Agora" no que está acontecendo, "com quem" com equipe); cartão do link com QR e janela de compartilhar (copiar, WhatsApp, compartilhar do celular, baixar QR, cartaz em `/painel/cartaz`); ocupação da API (`GET /barbearias/me/ocupacao`: jornada, pausa, data especial e bloqueios), da casa e por profissional | painel do dia |
| ✅ Agenda | painel | Colunas por profissional; bloqueios visíveis; profissional vê só a própria (bloco C, na vista de dia) | agenda da equipe |
| ✅ Novo agendamento | painel | Escolhe o profissional (bloco C) | — |
| ✅ Configurações | painel | Antecedência do lembrete; comodidades; capa e logo; WhatsApp, Instagram; formas de pagamento — em subtelas desde o painel v2 (marco 2), mais Regras de agendamento (marco 3) e Aparência (#121 a #128) | — |
| ✅ Página da barbearia | pública | Capa, logo, comodidades, aberto até, equipe com fotos, serviços por categoria com os próximos 3 horários livres, mapa e rota, contatos, formas de pagamento; visual da Aparência | Início da página pública |
| ✅ Escolher profissional | pública | Passo entre serviços e horário, com "qualquer um" (`/agendar/profissional`, bloco C) | fluxo de agendamento |
| ✅ Confirmar ou cancelar | pública | Destino do link do lembrete (`/lembrete/[token]`); confirma ou cancela com um toque (bloco D) | resposta ao lembrete |

## Onda 1s — Site de marketing (mínimo)

| Tela | O que faz | Referência |
|---|---|---|
| ✅ Landing | Promessa, como funciona, tabela dos planos (desde o #146; antes, "grátis durante o lançamento"), CTA pro cadastro, em `/` (PR #40). Sem prova social até o piloto medir | Home |
| ✅ Termos e privacidade | `/termos` e `/privacidade`, aceite no cadastro do dono (PR #70); com a cobrança, a Stripe e quem vende (pessoa física: nome, CPF e e-mail, que é também o contato do encarregado de dados), vigência 15/10/2026 (#146) | `/terms`, `/privacy` |

`robots.txt` (fecha `/painel` e o link do lembrete), `sitemap.xml` e
Open Graph da home saem de `NEXT_PUBLIC_URL_DO_SITE` (PR #74); a imagem
do link é gerada no build (#114).

**Entraram com a Onda 2** (decisão do dono, 2026-10-05: o site não
promete limite que a API não aplica): ✅ Preços (`/precos`, tabela
Grátis, Essencial e Completo, mensal e anual) e ✅ Plano grátis
(`/gratis`), no ar desde 2026-10-15 (#146).

Depois do mínimo: páginas de funcionalidade (template de 9 blocos),
`/comparar`, blog, sobre e metodologia.

## Onda 2 — Dinheiro

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Caixa do dia | painel | Entradas por forma de pagamento, abrir e fechar caixa | caixa do dia |
| 🆕 Comissões | painel | Regras por profissional e serviço; extrato do profissional | comissões |
| 🆕 Relatórios | painel | Faturamento, ocupação, faltas, clientes novos e recorrentes | relatórios |
| ✅ Plano e assinatura | painel | `/painel/faturas`: plano atual, teste de 14 dias, assinar pelo Checkout da Stripe, faturas, trocar de plano e cancelar pelo Portal (marco 1, #141 a #150) | Faturas |
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
