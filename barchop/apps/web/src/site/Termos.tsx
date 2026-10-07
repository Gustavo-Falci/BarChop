import { CONTROLADOR, ouAPreencher } from "./controlador";
import { DocumentoLegal, SecaoLegal, type ItemDoSumario } from "./DocumentoLegal";

const SUMARIO: ItemDoSumario[] = [
  { id: "quem-somos", titulo: "Quem somos" },
  { id: "o-servico", titulo: "O serviço" },
  { id: "sua-conta", titulo: "Sua conta e a da sua equipe" },
  { id: "dados-dos-clientes", titulo: "Os dados dos seus clientes" },
  { id: "uso-correto", titulo: "Uso correto" },
  { id: "disponibilidade", titulo: "Disponibilidade" },
  { id: "encerramento", titulo: "Encerramento" },
  { id: "mudancas", titulo: "Mudanças nestes termos" },
];

// Termos de uso do BarChop (onda 1s-b). Rascunho base pra revisão
// jurídica; só fala do que o produto já faz.
export function Termos() {
  return (
    <DocumentoLegal titulo="Termos de uso" sumario={SUMARIO}>
      <SecaoLegal id="quem-somos" titulo="Quem somos">
        <p>
          O BarChop é um sistema de agendamento online para barbearias, oferecido por{" "}
          {ouAPreencher(CONTROLADOR.razaoSocial)}, CNPJ {ouAPreencher(CONTROLADOR.cnpj)}. Ao criar uma
          barbearia ou usar o painel, você concorda com estes termos.
        </p>
      </SecaoLegal>

      <SecaoLegal id="o-servico" titulo="O serviço">
        <p>
          A barbearia ganha uma página própria em que o cliente escolhe o serviço, o profissional e o
          horário, e um painel para a equipe cuidar da agenda. O cliente pode receber lembrete do
          horário por e-mail, com link para confirmar a presença ou cancelar.
        </p>
        <p>Durante o lançamento o uso é gratuito. Se isso mudar, avisamos com antecedência no painel.</p>
      </SecaoLegal>

      <SecaoLegal id="sua-conta" titulo="Sua conta e a da sua equipe">
        <ul>
          <li>Quem cria a barbearia é o dono da conta e responde pelo uso que a equipe faz dela.</li>
          <li>Os dados informados no cadastro precisam ser verdadeiros, e o e-mail precisa ser seu.</li>
          <li>A senha é pessoal. Se desconfiar que alguém a conhece, troque pelo painel.</li>
          <li>O endereço da página (o link da barbearia) é único e só muda com um pedido ao suporte.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="dados-dos-clientes" titulo="Os dados dos seus clientes">
        <p>
          Nome, telefone, e-mail e histórico de agendamentos dos clientes da barbearia pertencem à
          barbearia. O BarChop os guarda e trata só para fazer o agendamento funcionar, em nome da
          barbearia — os detalhes estão na <a href="/privacidade">política de privacidade</a>.
        </p>
        <p>
          A barbearia é responsável por usar esses dados de acordo com a LGPD: só para atender o
          cliente, e nunca para enviar o que ele não pediu.
        </p>
      </SecaoLegal>

      <SecaoLegal id="uso-correto" titulo="Uso correto">
        <p>
          Não é permitido usar o BarChop para enviar mensagens em massa, publicar conteúdo ilegal na
          página da barbearia, tentar acessar a conta de outra barbearia ou atrapalhar o funcionamento
          do sistema. Nesses casos a conta pode ser suspensa.
        </p>
      </SecaoLegal>

      <SecaoLegal id="disponibilidade" titulo="Disponibilidade">
        <p>
          Trabalhamos para o sistema ficar no ar o tempo todo, mas pode haver paradas para manutenção
          ou por falhas fora do nosso controle. Guardamos cópias de segurança diárias dos dados. O
          BarChop não responde por horários perdidos durante uma parada.
        </p>
      </SecaoLegal>

      <SecaoLegal id="encerramento" titulo="Encerramento">
        <p>
          Você pode encerrar a conta da barbearia quando quiser, pedindo ao suporte. Antes de apagar,
          podemos exportar os seus dados. Depois do encerramento, os dados são apagados no prazo da
          política de privacidade, salvo o que a lei obrigar a guardar.
        </p>
      </SecaoLegal>

      <SecaoLegal id="mudancas" titulo="Mudanças nestes termos">
        <p>
          Quando estes termos mudarem, a data de vigência no topo muda junto e avisamos no painel. Usar
          o BarChop depois do aviso é concordar com a versão nova.
        </p>
      </SecaoLegal>
    </DocumentoLegal>
  );
}
