# Aviso de agenda cheia

## Problem
Quando todos os horários que o link oferece já estão reservados, nada avisa ninguém. O cliente que chega pelo WhatsApp ou pelo Instagram passa por serviço, profissional e data, encontra todos os dias riscados e desiste sem saber que pode pedir um encaixe. O dono não fica sabendo que a agenda lotou e perde a chance de abrir mais dias ou horários. O profissional não sabe que a agenda dele encheu enquanto a dos colegas ainda tem vaga.

## Evidence
- Nenhum caso relatado até agora, nem reclamação de cliente (dono do produto, 27/11/2026).
- Assumption — needs validation via conversa com o dono da Jesus Barber (piloto), depois que o aviso estiver no ar.
- Telas de exemplo aprovadas pelo dono do produto em 27/11/2026: canvas "Aviso de agenda cheia — telas de exemplo" (https://claude.ai/artifact/KBzsbkz9WNYk8hwhUoA3FJ). Escolhida a variante C.

## Users
- **Primary**:
  - **Cliente da barbearia**: abre a página pública pelo link (WhatsApp, Instagram), quase sempre no celular, querendo marcar.
  - **Dono da barbearia**: quer saber quando a agenda lotou, pra abrir mais horários ou só se planejar.
  - **Profissional da equipe**: quer saber quando a agenda dele lotou, mesmo se os colegas ainda têm vaga.
- **Not for**: a recepção, que vê a agenda de todos no painel e não recebe este aviso; barbearias com a janela de agendamento "sem limite".

## Hypothesis
We believe **um aviso de agenda cheia na página pública, com o contato da barbearia, e um aviso por e-mail e no sininho pro dono e pro profissional** will **dar um caminho pro cliente que não acha horário e avisar a equipe que lotou** for **clientes, donos e profissionais das barbearias com janela de agendamento definida**.
We'll know we're right when **o aviso aparece sempre que o link não oferece nenhum horário, e o dono da Jesus Barber diz que recebeu o aviso e que clientes chamaram pelo WhatsApp a partir dele**.

## Definições
- **Agenda cheia (barbearia)**: até o fim da janela de agendamento, o link não oferece nenhum horário pro serviço ativo mais curto com nenhum profissional. "Oferece" respeita todas as regras que o cliente já enfrenta hoje (antecedência, mesmo dia, intervalo, horário de funcionamento, folgas). Se sobrar um buraco de 15 min que cabe o serviço mais curto, não está cheia.
- **Agenda cheia (profissional)**: a mesma regra, só pros horários dele e pro serviço ativo mais curto que ele faz.
- **Janela "sem limite"**: não há agenda cheia. Nem o aviso, nem o e-mail, nem o sininho.
- **Lotação**: a passagem de "tem horário" para "cheia". Se vagar um horário e encher de novo, é outra lotação.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Aviso na página quando a agenda está cheia | 100% das vezes; nunca quando há horário | Testes automáticos com agenda cheia, com um buraco que cabe o serviço mais curto e com janela sem limite |
| E-mail e sininho por lotação | 1 por lotação, no máximo 1 por dia por pessoa | Testes automáticos (encher, vagar, encher de novo no mesmo dia: 1 aviso só) |
| Cliques no WhatsApp a partir do aviso | TBD — needs validation via conversa com o dono da Jesus Barber (hoje não há medição) | Relato do dono do piloto |

## Scope
**MVP**
1. **Aviso na página pública (variante C)**: com a barbearia cheia, a home mostra, logo abaixo do topo: "Todos os horários estão reservados. Para mais informações, mande mensagem para a barbearia no número (XX) XXXXX-XXXX". O número é o WhatsApp da barbearia. Sem WhatsApp, vai o telefone, com link de ligar. Sem nenhum dos dois, a primeira frase fica sozinha, sem número.
2. **O botão principal muda**: o "Agendar agora" vira "Chamar no WhatsApp" (sem WhatsApp: "Ligar para a barbearia"; sem nenhum: o botão some). Os "Próximos horários" dos serviços somem, porque não há nenhum.
3. **O aviso sai sozinho** quando volta a ter horário: alguém desmarcou, a janela andou um dia, o dono abriu mais horários.
4. **Dono**: na lotação da barbearia, e-mail (texto puro, como os outros do BarChop) e aviso no sininho. Os dois dizem até quando está cheia, quando abre o próximo dia e onde abrir mais dias ou horários no painel.
5. **Profissional**: na lotação da agenda dele, e-mail e aviso no sininho, com até quando está cheia e o link pra agenda dele.
6. **Sem repetição**: um aviso por lotação e no máximo um por dia por pessoa.

**Out of scope**
- Lista de espera ("me avise se vagar") — maior. Fica pra depois de ver o aviso em uso (decisão do dono, 27/11).
- Aviso de profissional cheio na página pública (ex.: no passo de escolher o profissional) — a página só avisa quando a barbearia toda encheu.
- Aviso no passo de escolher a data do agendamento — o aviso fica só na home por enquanto (decisão do dono, 27/11).
- Aviso no app do celular — o app ainda não tem a página pública.
- Mensagem pelo WhatsApp oficial — espera a verificação da Meta (ADR-0004).
- Variantes A e B do canvas — o dono escolheu a C.
- Aviso pra recepção.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Aviso na página pública | Com a barbearia cheia, a home mostra o aviso C e o botão de contato no lugar do "Agendar agora". O aviso sai sozinho quando volta a ter horário | complete | `.claude/plans/agenda-cheia-pagina.plan.md` (PR #442, no ar 27/11) |
| 2 | Aviso pro dono | O dono recebe e-mail e aviso no sininho quando a barbearia lota, uma vez por lotação, no máximo uma por dia | complete | `.claude/plans/agenda-cheia-dono.plan.md` (PR #443, no ar 27/11) |
| 3 | Aviso pro profissional | Cada profissional recebe e-mail e aviso no sininho quando a agenda dele lota, com a mesma regra de repetição | complete | `.claude/plans/agenda-cheia-profissional.plan.md` (PR #444, no ar 27/11) |

## Open Questions
- [x] Quanto tempo depois do agendamento que lotou o e-mail pode chegar? Na hora: a conferência roda na fila logo depois do agendamento (decisão do dono, 27/11).
- [ ] A lotação que acontece "parada", sem ninguém agendar (o dono fecha um dia, uma folga entra), também avisa? Fora do marco 2: a conferência só roda quando um agendamento muda. Decidir depois de ver o aviso em uso.
- [x] Profissional sem e-mail cadastrado: recebe só o sininho (o e-mail do profissional é opcional no banco). Fechada no plano do marco 3.
- [ ] O dono que também atende recebe os dois avisos (o da barbearia e o da agenda dele) no mesmo dia? Proposta do plano do marco 3: quando a barbearia lota, o dono recebe só o da barbearia; se só a agenda dele lota, recebe o de profissional. Validar com o dono.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Calcular "cheia" na página pública deixa a home mais lenta | Média | Médio | Medir o tempo da home antes e depois no marco 1; a página já calcula os próximos horários hoje |
| Aviso falso (diz cheia com horário sobrando, ou o contrário) | Baixa | Alto | Usar a mesma regra que gera os horários do link, sem uma segunda conta; testes com o buraco do serviço mais curto |
| E-mail repetido incomoda o dono e o profissional | Média | Médio | Uma vez por lotação e no máximo uma por dia, guardado no banco e não em memória |
| O número exibido é o errado ou falta | Baixa | Médio | WhatsApp → telefone → sem número, nessa ordem, todos com dados que a API já valida |

---
*Status: COMPLETE — os três marcos no ar em 27/11.*
