# Plan: Link do horário na tela de agendamento confirmado

**Fonte**: canvas do Claude Design, página "Página pública", linha "Novo (06/11): link do horário no confirmado" (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb, versão `1793995117-2abb`, pranchas `Pub-ConfirmadoLink(-360)(-Claro)`). O dono aprovou em 06/11 ("Aprovado"). Manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md`.

## O problema
Quem agenda sem conta e sem e-mail não tem como cancelar sozinho:
- sem e-mail, não recebe o lembrete, que é o que traz o link de confirmar ou cancelar;
- o WhatsApp automático está desligado (`WHATSAPP_ATIVO=false`, ADR-0009);
- sem conta, não há Minha conta.

Hoje só sobra a barbearia mandar o link à mão ("Lembrar pelo WhatsApp" no painel) ou o cliente ligar.

## O que o dono aprovou (06/11)
1. **Cartão "Pra cancelar ou confirmar depois"** na tela de sucesso, para **todo cliente sem conta**, mesmo quem digitou e-mail. O lembrete pode estar desligado e, ligado, só sai horas antes. Quem tem conta e quem remarca não veem o cartão (têm Minha conta).
2. **Instruções numeradas no cartão**:
   1. guardar o link;
   2. cancelar, com o prazo da barbearia ("até N horas antes"; com prazo 0, "até a hora do horário");
   3. confirmar presença;
   4. "Passou do prazo?", com o WhatsApp da casa, ou o telefone, ou só "fale com a barbearia";
   5. "Não repasse o link".
3. **Botões do cartão**: "Mandar pro meu WhatsApp" (`wa.me` para o número que o cliente digitou, com o texto e o link) e "Copiar o link", que vira "Copiar de novo" e mostra "Link copiado" num `role="status"`.
4. **"Concluir" com contagem de 5 s** no fim do cartão:
   - travado, mostrando "Concluir em N s", até a contagem acabar;
   - depois, apaga o cartão salvo e volta para a página da barbearia.
   - Substitui "Voltar ao início" para quem não tem conta. "Adicionar à agenda" vira contorno, antes do cartão.
5. **O cartão sobrevive a recarregar**: fica no `sessionStorage` até o Concluir, sem durar além da aba.
6. **O link vai no .ics** do "Adicionar à agenda" (DESCRIPTION).
7. **Confirmar presença logo depois de agendar fica permitido** (a página do link não muda).
8. **Os textos da página do link (`ConfirmarOuCancelar`) deixam de dizer "do e-mail"**, porque o link agora também chega pelo WhatsApp ou copiado.

## Decisões deste plano
- **API**:
  - `POST /barbearias/:slug/agendamentos` passa a devolver `linkDoHorario: string | null`.
  - O link é o mesmo do lembrete: `criarLinkDoLembrete(app, enderecoDasBarbearias(process.env))`, com o token valendo até o horário começar.
  - `null` quando não há endereço configurado; aí a tela não mostra o cartão e fica como antes.
  - A resposta leva `cache-control: no-store`, como a do "Lembrar pelo WhatsApp", porque carrega um link de cancelar que funciona.
  - A rota sempre cria um agendamento novo, então o token só vai para quem acabou de criar aquele horário.
- **Tipo próprio** `AgendamentoCriado = AgendamentoSerializado & { linkDoHorario: string | null }`, só no retorno de `publico.agendar`. O `AgendamentoSerializado` fica como está.
- **Cartão salvo** (`fluxo/horarioConfirmado.ts`):
  - chave `agendamento.confirmado` no `sessionStorage`;
  - guarda o agendamento criado, o link e o slug;
  - volta só quando a URL é a do mesmo agendamento (slug, data, hora). Começar outro agendamento na mesma aba mostra o formulário.
  - Conteúdo torto conta como ausente, como no `dadosDoCliente`.
- **Contagem**: `useEffect` com `setInterval` de 1 s.
  - O botão fica `disabled` durante a contagem, com o texto "Concluir em N s".
  - O apoio diz "Leia as instruções acima. O botão libera em N s." Depois diz "Concluir apaga este cartão e volta pra página da barbearia."
  - Recarregar começa a contagem de novo.
- **WhatsApp**: `linkDoWhatsApp` de `AvisoDoPrazo` para o telefone do cliente, com `?text=` contendo uma linha e o link.
- **Copiar**: `navigator.clipboard.writeText`. Se falhar (navegador sem permissão), o status diz "Não deu pra copiar. Use o WhatsApp ou adicione à agenda."

## Arquivos
| Arquivo | Ação |
|---|---|
| `apps/api/src/routers/agendamentos.ts` | devolve `linkDoHorario` + `no-store` |
| `packages/types/src/index.ts` | `AgendamentoCriado` |
| `packages/api-client/src/publico.ts`, `falso.ts` | retorno `AgendamentoCriado`; o falso devolve um link de mentira |
| `apps/web/src/fluxo/horarioConfirmado.ts` (novo) | ler, gravar e limpar o cartão salvo |
| `apps/web/src/fluxo/ics.ts` | `descricao` opcional |
| `apps/web/src/telas/Confirmacao.tsx` + `.module.css` | cartão, instruções, contagem, restaurar |
| `apps/web/src/telas/ConfirmarOuCancelar.tsx` | textos sem "do e-mail" |
| testes de cada um | primeiro (TDD) |

## Um PR
API e tela juntas: a tela depende do campo novo. A confirmação antes do "Cancelar" da Minha conta fica para o PR seguinte.

## Feito (06/11)
- Branch `link-do-horario-no-confirmado`. Testes: API 1457 (suíte inteira), api-client 240, web 1719 + o novo caso de serviços; tsc e eslint limpos.
- O cartão salvo volta só quando a URL é do mesmo agendamento: barbearia, serviços, dia e hora.
- Conferido no navegador (semente + `URL_DO_PAINEL=http://localhost:3000`): 390 escuro e 360 claro; a contagem libera o Concluir em 5 s; recarregar traz o cartão de volta com a contagem do zero; o link abre o mesmo agendamento; "Link copiado"; o Concluir apaga o cartão e vai para `/barbearia-teste`.
- Desvio da prancha: o `.ics` agora dobra linhas acima de 75 bytes (RFC 5545), porque o link do horário passa disso. Antes não dobrava.
