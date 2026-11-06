import { formatarDataComSemana, formatarDataLonga } from "../formato/datas";
import estilos from "./BlocoDoDia.module.css";

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// O dia num bloco amarelo claro, como nas pranchas da onda B (Minha conta
// e Lembrete): a semana curta, o número grande e o mês. Curta porque
// "domingo" por extenso apertava o bloco. O leitor de tela ouve a data
// por extenso; os três pedaços visíveis ficam fora dele.
//
// `soVisual`: quando a data por extenso já está escrita ao lado (o
// Lembrete), o bloco sai do leitor de tela, que senão ouviria o dia duas
// vezes.
export function BlocoDoDia({ data, soVisual = false }: { data: string; soVisual?: boolean }) {
  return (
    <span className={estilos.dia} aria-hidden={soVisual || undefined}>
      <span aria-hidden="true" className={estilos.pequeno}>
        {formatarDataComSemana(data).split(",")[0].slice(0, 3)}
      </span>
      <span aria-hidden="true" className={estilos.numero}>
        {Number(data.slice(8, 10))}
      </span>
      <span aria-hidden="true" className={estilos.pequeno}>
        {MES_CURTO[Number(data.slice(5, 7)) - 1]}
      </span>
      {soVisual ? null : <span className={estilos.somenteLeitor}>{formatarDataLonga(data)}</span>}
    </span>
  );
}
