# BarChop — brief do produto

## O que é

SaaS de agendamento e gestão para barbearias brasileiras. Cada
barbearia que assina ganha:

- **uma página pública** em `<slug>.barchop.com.br`, onde o cliente
  final vê serviços, equipe e horários livres, e agenda sozinho;
- **um painel** para o dono, os profissionais e a recepção tocarem o
  dia a dia: agenda, clientes, serviços, equipe e, depois, caixa e
  comissões;
- **lembrete automático** por WhatsApp e e-mail, que o cliente confirma
  ou cancela respondendo.

A promessa central é **agenda cheia e menos faltas**. Todo o resto
(caixa, comissão, assinatura, fidelidade, loja, IA) entra em ondas, como
consequência dela.

A GR Barber é o primeiro cliente e o piloto, não o produto. Domínio:
**barchop.com.br**. Referência de mercado: o Barbeiro.app, analisado em
2026-10-02.

## Problema

Validado conversando com um barbeiro real: ele registra agendamentos em
bloco de notas e marca horário pelo WhatsApp. Sem visão do dia, sem
lembrete automático, sem histórico de cliente. Na prática isso vira dois
clientes no mesmo horário, falta sem aviso e o dia gasto respondendo
"tem horário?".

## Para quem

- **Quem paga:** o dono de barbearia pequena ou média, de 1 a ~6
  profissionais, que hoje marca horário pelo WhatsApp.
- **Quem usa o painel:** o dono (acesso total), o profissional (a
  própria agenda, os próprios clientes e comissões) e a recepção
  (agendamentos e pagamentos no balcão).
- **Quem agenda:** o cliente final, pelo link da barbearia que chega
  por WhatsApp, Instagram ou Google.
- **Fora do recorte por ora:** redes e franquias com muitas unidades, e
  salões de beleza em geral.

## Decisão central: quem agenda é o cliente

Não é o barbeiro que cria o agendamento — é o **cliente** que:

1. Escolhe um ou mais serviços (e, a partir da Onda 1, o profissional)
2. O sistema soma a duração total dos serviços escolhidos
3. Calcula, dentro da jornada do profissional e considerando os
   agendamentos já existentes, quais horários têm espaço livre
   suficiente pra essa duração
4. Cliente só vê os horários que cabem, escolhe um, confirma
5. Lembrete automático disparado

O barbeiro também pode criar agendamentos manualmente (walk-in,
telefone), usando o mesmo motor de cálculo — ver
`packages/scheduling`. O banco tem uma trava própria (`EXCLUDE`) contra
dois agendamentos sobrepostos do mesmo profissional.

## Multi-tenant

Um backend só guarda todas as barbearias, separadas por `barbeariaId`
em toda tabela. O `Cliente` é por barbearia: o mesmo telefone em duas
barbearias são dois cadastros, com login separado em cada uma. A
barbearia é resolvida pelo subdomínio (ADR-0002).

## Modelo de negócio

Plano grátis permanente para entrar, planos pagos com preço base mais
valor por profissional extra, desconto no anual e teste de 14 dias sem
cartão. Ao cancelar, a conta volta para o grátis sem perder dados. Nomes,
preços e limites ficam definidos num lugar só (ADR-0007); os valores são
uma pergunta em aberto no PRD.

## Como é entregue

Em ondas, cada uma com resultado de negócio próprio (ADR-0001):

| Onda | Resultado |
|---|---|
| 0 | Casa arrumada: contas, slugs, datas, docs |
| 1 | Agenda que funciona: equipe, página pública rica, lembretes, onboarding, piloto em produção |
| 1s | Site de marketing mínimo, em paralelo |
| 2 | Dinheiro: caixa, comissões, relatórios, cobrança do SaaS |
| 3 | Retenção do cliente final: pagamento online, pacotes, clube, fidelidade, lista de espera, avaliações |
| 4 | Crescimento: indicação, loja, unidades, campanhas, login social |
| 5 | Diferenciais: IA no WhatsApp, NFS-e, domínio próprio, app do profissional |

O PRD com hipótese, métricas e o estado de cada onda está em
`.claude/prds/barchop-saas.prd.md`; o roteiro detalhado, em
`docs/roadmap.md`; as telas, em `docs/screens.md`.

## Entidades centrais

Hoje: `Barbearia`, `Barbeiro`, `Cliente`, `Servico`, `Agendamento`,
`AgendamentoServico`, `HorarioFuncionamento`, `CodigoVerificacao` —
schema em `packages/database`. As ondas acrescentam jornada e bloqueios
por profissional, papéis, lembretes, pagamentos, caixa, comissões,
planos de assinatura, fidelidade, produtos e pedidos.

## Infra

API (Fastify), app web (Next.js: site, página pública e painel) e
Postgres numa VM da Oracle OCI, com DNS e certificado coringa para os
subdomínios. Ainda não provisionada — faz parte da Onda 1.
