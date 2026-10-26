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

## O que existe hoje (2026-10-25)

Tudo no ar. As tabelas por onda, mais abaixo, guardam de onde cada
tela veio; esta é a foto de agora.

### Painel — 38 rotas

| Rota | O que faz | Muda em |
|---|---|---|
| `/painel/entrar` | Entrar e "Esqueci a senha" (e-mail → código → senha nova) | — |
| `/painel/cadastro` | Cadastro do dono: link sugerido pelo nome, código no e-mail, aceite dos termos | — |
| `/painel/convite` | Profissional convidado define a senha e entra | — |
| `/painel` | Hoje: trilha dos primeiros passos (só o dono), agendamentos hoje, ainda hoje e previsto, próximos atendimentos com "Agora", ocupação da casa e por profissional, cartão do link com QR | 🔧 Onda 2 (caixa do dia) |
| `/painel/cartaz` | Cartaz do link com QR, pra imprimir | — |
| `/painel/agenda` | Dia, semana e mês, com eixo de tempo; dia em colunas por profissional, semana com pílulas por profissional; fora do expediente e pausa sombreados; horários livres com a hora escrita, clique de 15 em 15; faixa de resumo, "Agora" e "Bloquear" | — |
| `/painel/agendamentos/novo` | Cliente, serviços, profissional, data e horário; Cancelar volta pra tela anterior | — |
| `/painel/agendamentos/[id]` | Status e observações, sem caixas (Salvar/Descartar só quando muda); "Lembrar pelo WhatsApp"; presença confirmada pelo lembrete; "Concluir e registrar pagamento" (valor, desconto, gorjeta, forma e quem recebeu) com o resumo e a frase da divisão; "Usar o plano" pra quem assina, com o uso de cada serviço e o que passa do plano cobrado à parte; dia fechado só leitura | — |
| `/painel/caixa` | Caixa do dia (anterior, hoje, próximo): acerto por pessoa e repasses em frases, quanto entrou por forma (com a linha Online no dia de mensalidade paga pelo Asaas), pagamentos e mensalidades dos planos, pendências com link; "Fechar o dia" e reabrir só do dono; o profissional vê o dele; Grátis vê o convite | — |
| `/painel/clientes` | Lista com busca e pílulas Todos / Vieram em 30 dias / Sem registro em 90 dias, contadas no servidor | 🔧 Onda 3 (segmentos) |
| `/painel/clientes/novo` | Nome, telefone e e-mail | — |
| `/painel/clientes/[id]` | Resumo, WhatsApp e Agendar no topo; histórico em Próximos e Anteriores; dados; "Cliente de X" (de quem é no caixa), com Trocar pro dono; os planos que assina, com "Assinar plano" no balcão, o "Recebi" de cada ciclo e cancelar | 🔧 Onda 3 (pontos) |
| `/painel/servicos` | Lista por categoria (lista fechada), pílulas, busca, "Onde aparece"; inativos atenuados | — |
| `/painel/servicos/novo`, `/painel/servicos/[id]` | Nome, duração, preço, categoria em pílulas, descrição e foto, com a prévia "Como o cliente vê"; desativar e reativar | — |
| `/painel/equipe` | Lista com papel e situação, pílulas Todos / Atendem / Convites pendentes / Inativos | — |
| `/painel/equipe/novo` | Convidar por e-mail (só o dono); respeita o limite de profissionais do plano | — |
| `/painel/equipe/[id]` | Dados, foto, papel, serviços que faz, jornada da semana com pausa, "Pode vender planos" (o dono libera), situação — cada grupo salva sozinho; desativar quem tem assinantes cancela as assinaturas dos planos que a pessoa vende | — |
| `/painel/planos` | Planos de assinatura da casa e de cada profissional, com a aba Assinantes e o selo "Pagamento online indisponível" no plano com online sem a conta de quem vende (filtro pela situação e "Recebi"); "Mostrar os planos na página" (só o dono); atalho pra Pagamentos online; fora do Completo, o convite | — |
| `/painel/planos/novo`, `/painel/planos/[id]` | Nome, descrição, ciclo, preço, dias grátis, quanto quem atende ganha por atendimento (plano da casa), serviços incluídos com os usos por ciclo e como o cliente paga (online, na página, e no balcão); desativar e reativar | — |
| `/painel/bloqueios` | Folgas e bloqueios: dia inteiro ou só algumas horas, atalhos de motivo | — |
| `/painel/configuracoes` | Índice "X de N decididas": Operação (Horários, Regras de agendamento) e Canais com clientes (Dados do negócio, Aparência, Comunicação, Notificações); fora da contagem, Divisão do dinheiro, Pagamentos online e o Seu perfil. O profissional vê só Seu perfil e Pagamentos online (a conta dele); a recepção cai direto no perfil | — |
| `/painel/configuracoes/divisao` | Só o dono. Parte da casa de cada um e a grade "cliente de ↓ × atendeu →", com o exemplo de R$ 100,00 do efeito; Salvar/Descartar só quando muda | — |
| `/painel/configuracoes/pagamentos-online` | A conta do Asaas da casa (só o dono) e a de quem vende: colar a chave de API, ver os últimos caracteres, chip Sandbox, trocar a chave e desconectar (recusado com assinatura online viva, com a lista de quem cancelar) | — |
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

### Página pública — 9 telas e 2 redirects

Em `<slug>.barchop.com.br` (no desenvolvimento, `/[slug]`). Segue o
tema do aparelho e a Aparência publicada pelo dono.

| Rota | O que faz | Muda em |
|---|---|---|
| `/` | Capa, logo, aberto agora, serviços por categoria (lista ou abas) com os próximos horários, os planos de assinatura em resumo, equipe, horário, comodidades, pagamento, contatos e mapa | — |
| `/agendar` | Passo 1: serviços | — |
| `/agendar/profissional` | Passo 2: profissional ou "qualquer um" | — |
| `/agendar/data` | Passo 3: dia e horário numa tela | — |
| `/agendar/confirmar` | Passo 4: identificação, resumo, confirmação e sucesso com `.ics` | 🔧 Onda 3 (pagamento/sinal) |
| `/planos` | Os planos de assinatura em cartões: o preço em destaque, com quem vale, o que inclui (lista com ✓), dias grátis; "Assinar" (pede login, que volta pro plano), CPF quando o Asaas pede e a fatura do Asaas em outra aba; plano só de balcão com "Agendar" (já com o profissional quando o plano é dele); online marcado e sem a conta de quem vende: "Pagamento online indisponível" no lugar do "Assinar" (o plano não some); volta pra barbearia, "Já assina?" pra Minha conta e "Como funciona" em três passos | — |
| `/entrar` | Login, primeiro acesso e esqueci a senha por código no e-mail; volta pro passo do agendamento ou pro plano escolhido | 🔧 Onda 4 (Google/Apple) |
| `/minha-conta` | Meus agendamentos: cancelar e remarcar; Minhas assinaturas: até quando vale, os usos que sobram, "Pagar" a fatura em aberto e cancelar | 🔧 Onda 3 (pontos) |
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
| ✅ Caixa do dia | painel | `/painel/caixa`: entradas por forma de pagamento, acerto e repasses entre a equipe, pendências, fechar e reabrir o dia (marco 2, #153 a #160) | caixa do dia |
| ✅ Comissões | painel | `/painel/configuracoes/divisao`: parte da casa por profissional e a matriz "cliente de × atendeu" (marco 2). Regra por serviço e extrato do profissional ficam pro marco 4, se o dono pedir | comissões |
| 🆕 Relatórios | painel | Faturamento, ocupação, faltas, clientes novos e recorrentes | relatórios |
| ✅ Plano e assinatura | painel | `/painel/faturas`: plano atual, teste de 14 dias, assinar pelo Checkout da Stripe, faturas, trocar de plano e cancelar pelo Portal (marco 1, #141 a #150) | Faturas |
| ✅ Detalhe do agendamento | painel | Concluir e registrar pagamento, com a divisão (marco 2) e o "Usar o plano" (marco 3) | — |
| ✅ Planos de assinatura | painel + pública | Marco 3 (#204 a #221 e o PR 12): planos da casa e de cada profissional, assinantes, "Recebi" no balcão, "Usar o plano" no pagamento, mensalidades no caixa; vitrine na página, `/planos` pra assinar e pagar pela fatura do Asaas na conta de quem vende; as assinaturas na Minha conta; Pagamentos online nas Configurações | `/membership` |

## Onda 3 — Retenção do cliente final

| Tela | Superfície | O que faz | Referência |
|---|---|---|---|
| 🆕 Pagamento no agendar | pública | PIX, cartão ou no local; sinal quando a barbearia exige | pagamento no fluxo |
| 🆕 Pacotes | painel + pública | Combos com desconto | pacotes promocionais |
| ✅ Clube de assinatura | painel + pública | Entrou na Onda 2, marco 3 (ver "Planos de assinatura" acima) | `/membership` |
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
