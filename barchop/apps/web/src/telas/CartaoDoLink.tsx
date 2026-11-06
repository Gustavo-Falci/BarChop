"use client";

import { useEffect, useState } from "react";
import { Botao, BotaoLink } from "../componentes/Botao";
import { formatarDataComSemana } from "../formato/datas";
import { linkDoWhatsApp } from "./AvisoDoPrazo";
import estilos from "./CartaoDoLink.module.css";

// O tempo de leitura antes do Concluir (decisão do dono, 06/11): o
// cartão é a única chance de quem agendou sem conta guardar o link.
export const SEGUNDOS_PARA_CONCLUIR = 5;

function digitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

// "Dá até 2 horas antes do horário." O prazo é o da barbearia, o mesmo
// que a página do link aplica. Sem o perfil (falhou), a frase some: o
// link continua valendo e a página diz o prazo.
function fraseDoPrazo(prazoHoras: number | undefined): string {
  if (prazoHoras === undefined) return "";
  if (prazoHoras === 0) return " Dá até o horário começar.";
  return ` Dá até ${prazoHoras} ${prazoHoras === 1 ? "hora" : "horas"} antes do horário.`;
}

// O cartão "Pra cancelar ou confirmar depois" (06/11), na tela de
// sucesso de quem agendou sem conta: o link do horário, o mesmo do
// e-mail de lembrete, com as instruções pra ler antes de concluir.
export function CartaoDoLink({
  link,
  telefone,
  data,
  horaInicio,
  nomeDaBarbearia,
  prazoCancelarHoras,
  whatsappDaBarbearia,
  telefoneDaBarbearia,
  aoConcluir,
}: {
  link: string;
  // O de quem agendou: o "Mandar pro meu WhatsApp" abre a conversa
  // consigo mesmo, com o link no texto.
  telefone: string;
  data: string;
  horaInicio: string;
  nomeDaBarbearia: string | undefined;
  prazoCancelarHoras: number | undefined;
  whatsappDaBarbearia: string | null;
  telefoneDaBarbearia: string | null;
  aoConcluir: () => void;
}) {
  const [faltam, setFaltam] = useState(SEGUNDOS_PARA_CONCLUIR);
  const [copia, setCopia] = useState<"nada" | "copiado" | "falhou">("nada");

  // Um segundo por vez, e não um intervalo: cada passo agenda o
  // próximo, e desmontar no meio não deixa relógio rodando.
  useEffect(() => {
    if (faltam <= 0) return;
    const relogio = setTimeout(() => setFaltam((antes) => antes - 1), 1000);
    return () => clearTimeout(relogio);
  }, [faltam]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopia("copiado");
    } catch {
      // Navegador sem permissão (ou sem a API): o WhatsApp e a agenda
      // seguem guardando o link.
      setCopia("falhou");
    }
  }

  const onde = nomeDaBarbearia ? ` na ${nomeDaBarbearia}` : "";
  const texto = `Meu horário${onde}: ${formatarDataComSemana(data)} às ${horaInicio}. Pra confirmar ou cancelar: ${link}`;
  const paraMim = `${linkDoWhatsApp(telefone)}?text=${encodeURIComponent(texto)}`;
  const travado = faltam > 0;

  return (
    <section className={estilos.cartao} aria-labelledby="link-do-horario">
      <div className={estilos.cabeca}>
        <h2 id="link-do-horario" className={estilos.titulo}>
          Pra cancelar ou confirmar depois
        </h2>
        <p className={estilos.apoio}>Você agendou sem conta. Leia antes de concluir:</p>
      </div>

      <ol className={estilos.instrucoes}>
        <li>
          <span>
            <b>Guarde o link do seu horário.</b> Mande pro seu WhatsApp ou copie. Ele também vai junto se
            você adicionar à agenda.
          </span>
        </li>
        <li>
          <span>
            <b>Pra cancelar,</b> abra o link e toque em “Cancelar horário”.{fraseDoPrazo(prazoCancelarHoras)}
          </span>
        </li>
        <li>
          <span>
            <b>Pra avisar que vem,</b> abra o link e toque em “Confirmar presença”.
          </span>
        </li>
        <li>
          <span>
            <b>Passou do prazo?</b> Fale com a barbearia
            {whatsappDaBarbearia ? (
              <>
                {" "}
                pelo <a href={linkDoWhatsApp(whatsappDaBarbearia)}>WhatsApp</a>.
              </>
            ) : telefoneDaBarbearia ? (
              <>
                {" "}
                pelo telefone <a href={`tel:${digitos(telefoneDaBarbearia)}`}>{telefoneDaBarbearia}</a>.
              </>
            ) : (
              "."
            )}
          </span>
        </li>
        <li>
          <span>
            <b>Não repasse o link.</b> Quem tiver ele consegue cancelar o seu horário.
          </span>
        </li>
      </ol>

      <div className={estilos.acoes}>
        <BotaoLink href={paraMim} variante="contorno" externo>
          Mandar pro meu WhatsApp
        </BotaoLink>
        <Botao type="button" variante="fantasma" onClick={copiar}>
          {copia === "copiado" ? "Copiar de novo" : "Copiar o link"}
        </Botao>
        <p role="status" className={estilos.status}>
          {copia === "copiado"
            ? "Link copiado"
            : copia === "falhou"
              ? "Não deu pra copiar. Use o WhatsApp ou adicione à agenda."
              : ""}
        </p>
      </div>

      <div className={estilos.fim}>
        <Botao type="button" disabled={travado} onClick={aoConcluir}>
          {travado ? `Concluir em ${faltam} s` : "Concluir"}
        </Botao>
        <p className={estilos.dica}>
          {travado
            ? `Leia as instruções acima. O botão libera em ${faltam} s.`
            : "Concluir apaga este cartão e volta pra página da barbearia."}
        </p>
      </div>
    </section>
  );
}
