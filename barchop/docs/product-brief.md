# BarChop — brief do produto

## Problema

Validado conversando com um barbeiro real: hoje ele registra
agendamentos em bloco de notas e marca horário por WhatsApp. Sem
visão do dia, sem lembrete automático, sem histórico de cliente.

## O que é

App de agenda pra barbeiros/barbearias, com três frentes:

- **App mobile do barbeiro** (React Native/Expo) — gestão do dia a dia
- **Painel web do barbeiro** (Next.js) — mesma gestão, tela maior
- **Fluxo do cliente** — link público (sem login) + app opcional com conta

Domínio pretendido: **barchop.com.br**.

## Decisão central: quem agenda é o cliente

Não é o barbeiro que cria o agendamento — é o **cliente** que:

1. Escolhe um ou mais serviços
2. O sistema soma a duração total dos serviços escolhidos
3. Calcula, dentro do horário de funcionamento e considerando os
   agendamentos já existentes, quais horários têm espaço livre
   suficiente pra essa duração
4. Cliente só vê os horários que cabem, escolhe um, confirma
5. Lembrete automático disparado (WhatsApp ou push)

O barbeiro também pode criar agendamentos manualmente (walk-in,
telefone), usando o mesmo motor de cálculo — ver
`packages/scheduling`.

## Multi-tenant desde o início

O modelo já suporta várias barbearias (entidade `Barbearia`) e
`Cliente` é uma identidade **global** na plataforma, não presa a
uma barbearia — pensando em escala, mesmo o MVP mirando o uso de
uma barbearia só (a do barbeiro que validou o problema).

## Escopo do MVP

- Agenda/agendamento por barbeiro
- Cadastro de clientes e serviços
- Confirmação/lembrete automático (WhatsApp ou push)
- Dashboard simples do dia

**Fora do MVP** (decisão consciente, não esquecimento):
- Gestão de múltiplos barbeiros dentro de uma barbearia
- Relatórios/analytics avançados
- Área self-service mais completa pro cliente (além do fluxo de agendamento)

## Entidades centrais

`Barbearia`, `Barbeiro`, `Cliente`, `Servico`, `Agendamento`,
`AgendamentoServico`, `HorarioFuncionamento` — schema completo em
`packages/database`.

## Infra

Hospedado em VM na Oracle OCI, gerenciada via chave SSH e console
web da OCI (ainda não provisionada — ver `docs/roadmap.md`).
