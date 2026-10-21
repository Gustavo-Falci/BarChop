// As features com animação de layout, só pro painel (motion PR 3): o
// indicador que desliza até o item ativo (`layoutId`) e as listas que
// fecham o buraco (`layout`, PR 4). O domMax mais que dobra o chunk das
// features (14KB → 33KB gz, medido), e o site e o agendamento público
// não usam layout — por isso o MovimentoDoPainel as busca à parte, e o
// resto segue com o domAnimation da raiz.
import { domMax } from "motion/react";

export default domMax;
