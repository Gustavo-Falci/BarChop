import { ErroDeNegocio } from "./erro-negocio";
import { agoraNaBarbearia, dateParaData, dateParaHora } from "./horas";

// Cancelar e remarcar têm exatamente a mesma porta de entrada, e ela
// mora aqui em vez de em cada rota: as duas regras têm que concordar,
// senão o cliente cancelaria um agendamento que não consegue remarcar,
// ou o contrário.
export function garantirAlteravel(agendamento: {
  data: Date;
  horaInicio: Date;
  status: string;
}): void {
  // `concluido` e `no_show` são fatos passados; `cancelado` já está no
  // destino. Nenhum dos três é alterável pelo cliente.
  if (agendamento.status !== "pendente" && agendamento.status !== "confirmado") {
    throw new ErroDeNegocio(
      `agendamento ${agendamento.status} não pode ser alterado`,
      "status_nao_permite"
    );
  }

  const agora = agoraNaBarbearia();
  const data = dateParaData(agendamento.data);
  const hora = dateParaHora(agendamento.horaInicio);

  // Comparação de string, e não de Date: os dois lados estão no formato
  // do contrato, que ordena igual à linha do tempo. Construir um Date a
  // partir daqui reintroduziria o fuso da máquina, que é justamente o
  // que o agoraNaBarbearia existe pra evitar.
  if (data < agora.data || (data === agora.data && hora <= agora.hora)) {
    throw new ErroDeNegocio("esse agendamento já passou", "agendamento_passado");
  }
}

// O destino de quem cria ou move um agendamento pelo lado do cliente.
// O `horariosLivres` não conhece o "agora" — só a janela e os ocupados
// —, então sem esta guarda um horário de ontem passava. E o resultado
// era pior que um agendamento estranho: era um agendamento que o
// `garantirAlteravel` acima recusa cancelar ou remarcar depois.
//
// Recebe as strings do contrato ("YYYY-MM-DD", "HH:mm"), e compara como
// string pelo mesmo motivo do `garantirAlteravel`. A criação manual pelo
// barbeiro não passa por aqui: registrar um walk-in depois do fato é
// legítimo.
export function garantirFuturo(data: string, horaInicio: string): void {
  const agora = agoraNaBarbearia();

  if (data < agora.data || (data === agora.data && horaInicio <= agora.hora)) {
    throw new ErroDeNegocio("esse horário já passou", "horario_passado");
  }
}
