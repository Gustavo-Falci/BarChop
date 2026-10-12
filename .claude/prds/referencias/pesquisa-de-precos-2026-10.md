# Pesquisa de preços — sistemas para barbearia (outubro de 2026)

> Levantamento de 12/10/2026 para o marco 1 do PRD da Onda 2 (`.claude/prds/onda-2-dinheiro.prd.md`). Preços de terceiros mudam e divergem entre fontes: a coluna "Fonte" diz de onde veio cada número. O Barbeiro.app foi visto na tela de assinatura (ver `barbeiro-app-planos-do-saas.md`); o resto, em sites oficiais e comparativos.

## Concorrentes

| Sistema | Grátis | Preço de entrada | 2 profissionais | Modelo | Teste | Fonte |
|---|---|---|---|---|---|---|
| Barbeiro.app | Sim: 1 prof., 100 agend./mês, 5 serviços | Starter R$ 29,90 (até 3 prof.); Pro R$ 39,90 | Starter R$ 39,90; Pro R$ 59,90 | base com 1 prof. + R$ 10 (Starter) ou R$ 20 (demais) por extra; anual −20% | sim (dias variam); 1º mês do Pro a R$ 9,90 | tela de assinatura, 12/10/2026 |
| GENDA | Sim: 1 prof., agend. ilimitados, 50 msgs WhatsApp/mês, comissão e relatórios | PRO R$ 39,90 (1 prof.) | Avançado R$ 79,90 (até 3) | faixa de equipe | 7 dias, sem cartão | site próprio (comparativo, 25/08/2026) |
| Trinks | Não | ≈ R$ 76 (1–2 prof., anual) | ≈ R$ 76–110 | faixa de equipe; WhatsApp é adicional pago | 5 dias | página oficial hoje diz "sob consulta"; valores de comparativos 2026 |
| AppBarber | Não | R$ 79,90 (1 prof.) | R$ 109,90 (2–5) | faixa de equipe (conta todos os cadastrados); semestral −15%, anual −30% | "alguns dias" | central de ajuda oficial |
| Booksy | Não | ≈ R$ 99,90 (1 prof.) | ≈ R$ 119,90 | + R$ 20 por profissional | "alguns dias" | comparativos (sem preço oficial em reais) |
| BarberCode | Não | R$ 79,90 (1 prof.) | R$ 99,90 (até 5) | faixa de equipe; caixa em todos, comissão a partir do 2º plano; anual −10% | não informado | página oficial de planos |
| Gendo | Não | R$ 57 (1 prof. + 20 msgs WhatsApp) | R$ 99,86 (+ 50 msgs) | faixa de equipe | — | comparativo |
| Barba na Hora / AgendaLogo | — | R$ 49,90 | — | — | AgendaLogo: 7 dias | comparativos / site |
| Cash Barber | Não | a partir de R$ 300 | — | gestão + mentoria | — | site oficial |

**O que se repete:**
- Mercado em três degraus: grátis/básico (R$ 0–30), barbearia pequena (R$ 40–110) e completo/rede (R$ 120+).
- Quem cobra por profissional usa "base com 1 incluso + extra"; quem não cobra usa faixa de equipe. Comparativos dizem que o dono reclama de cobrança por cabeça em equipe grande.
- WhatsApp é o recurso que separa os planos (Barbeiro.app, Trinks e Gendo cobram à parte ou só nos planos de cima), porque cada mensagem tem custo da Meta.
- Grátis permanente só no Barbeiro.app e na GENDA; os outros dão de 5 a 7 dias de teste. Os 14 dias do BarChop são mais generosos que todos.
- Caixa e comissão já são esperados nos planos pagos (BarberCode, GENDA, BestBarbers premium).

## Proposta para o BarChop

Preços-base definidos pelo dono em 12/10/2026 (a proposta inicial era R$ 29,90 e R$ 39,90); o resto da tabela segue a proposta.

| Plano | Preço com 1 profissional | Profissional extra | Limite | O que entra |
|---|---|---|---|---|
| Grátis | R$ 0 | — | 1 profissional | Agenda, agendamentos ilimitados, página pública com Aparência, lembrete por e-mail |
| Essencial | R$ 34,90/mês | R$ 10/mês | até 3 | + equipe com papéis, caixa do dia e acerto entre profissionais, relatórios básicos |
| Completo | R$ 44,90/mês | R$ 15/mês | sem limite | + lembrete por WhatsApp, planos de assinatura da barbearia (vitrine e pagamento online), relatórios completos |

- **Anual**: 2 meses grátis (≈ −17%), cobrado de uma vez — Essencial R$ 349,00/ano, Completo R$ 449,00/ano (com 1 profissional).
- **Teste**: 14 dias do Completo, sem cartão. Ao fim, sem pagamento, a barbearia **cai para o Grátis**: guarda os dados, desliga o que é pago, e não bloqueia a agenda do cliente final.
- **GR Barber (2 profissionais)**: Essencial R$ 44,90; Completo R$ 59,90. Comparando: Barbeiro.app Starter R$ 39,90 e Pro R$ 59,90, Trinks ≈ R$ 76, AppBarber R$ 109,90.
- **Como fica**:
  - O Essencial custa R$ 5 a mais que o Starter do Barbeiro.app, mas já traz o caixa e o acerto entre profissionais.
  - O Completo empata com o Pro deles com 2 profissionais e fica mais barato a partir de 3, porque o extra custa R$ 15 contra R$ 20. Exemplo com 4 profissionais: R$ 89,90 contra R$ 99,90.
  - O grátis sem limite de agendamentos é o argumento contra os 100/mês do Barbeiro.app.
- **A conferir antes de fechar**:
  - custo por mensagem do WhatsApp na Meta (define se o Completo aguenta lembrete sem cota);
  - taxa do provedor de pagamento sobre a mensalidade;
  - custo da VM, pra saber quantas contas pagas cobrem a infraestrutura.

## Fontes

- Barbeiro.app — tela de assinatura (`barbeiro-app-planos-do-saas.md`) e https://www.barbeiro.app/blog/melhor-sistema-para-barbearia-2026
- GENDA — https://genda.work/melhor-sistema-para-barbearia
- Trinks — https://negocios.trinks.com/planos/ e https://agendiva.com.br/blog/trinks-vs-belezzia-vs-agendiva
- AppBarber — https://appbarber-appbeleza.zendesk.com/hc/pt-br/articles/360001701331-Planos-e-Pre%C3%A7os-do-Sistema
- Booksy — https://exame.com/pme/com-aporte-de-us-70-mi-americana-booksy-planeja-dobrar-operacao-no-brasil/
- BarberCode — https://barbercode.com.br/planos/
- Gendo, Barba na Hora, AgendaLogo — https://topagenda.online/melhores-apps-para-barbearia e https://agendalogo.com.br/
- Cash Barber — https://sistemacashbarber.com.br/
- BestBarbers — https://www.bestbarbers.app/
