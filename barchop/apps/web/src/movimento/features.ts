// As features de animação num módulo à parte, só pra virarem um chunk
// próprio: o ProvedorDeMovimento as busca com import() depois que a
// página carrega, em vez de elas entrarem no JS de toda rota.
import { domAnimation } from "motion/react";

export default domAnimation;
