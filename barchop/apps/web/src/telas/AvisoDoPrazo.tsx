import { Aviso } from "../componentes/Aviso";

function digitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

// Passado o prazo da barbearia, os botões somem e o cliente vê com quem
// falar (decisão do dono, painel v2, marco 3): o WhatsApp da casa, ou o
// telefone quando não há WhatsApp.
export function AvisoDoPrazo({
  acao,
  whatsapp,
  telefone,
}: {
  // "alterar" quando os dois prazos (remarcar e cancelar) já passaram.
  acao: "remarcar" | "cancelar" | "alterar";
  whatsapp: string | null;
  telefone: string | null;
}) {
  return (
    <Aviso tom="atencao">
      O prazo pra {acao} pelo link acabou. Fale com a barbearia
      {whatsapp ? (
        <>
          {" "}
          pelo <a href={`https://wa.me/55${digitos(whatsapp)}`}>WhatsApp {whatsapp}</a>.
        </>
      ) : telefone ? (
        <>
          {" "}
          pelo telefone <a href={`tel:${digitos(telefone)}`}>{telefone}</a>.
        </>
      ) : (
        "."
      )}
    </Aviso>
  );
}
