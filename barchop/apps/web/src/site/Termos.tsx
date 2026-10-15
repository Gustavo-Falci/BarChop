import { DIAS_DE_TESTE } from "@barchop/formato";
import { ouAPreencher, vendedor } from "./controlador";
import { DocumentoLegal, SecaoLegal, type ItemDoSumario } from "./DocumentoLegal";

const SUMARIO: ItemDoSumario[] = [
  { id: "quem-somos", titulo: "Quem somos" },
  { id: "o-servico", titulo: "O serviço" },
  { id: "planos-e-cobranca", titulo: "Planos, cobrança e cancelamento" },
  { id: "sua-conta", titulo: "Sua conta e a da sua equipe" },
  { id: "dados-dos-clientes", titulo: "Os dados dos seus clientes" },
  { id: "uso-correto", titulo: "Uso correto" },
  { id: "disponibilidade", titulo: "Disponibilidade" },
  { id: "encerramento", titulo: "Encerramento" },
  { id: "mudancas", titulo: "Mudanças nestes termos" },
];

// Termos de uso do BarChop (onda 1s-b; cobrança na Onda 2, PR 6).
// Rascunho base pra revisão jurídica; só fala do que o produto já faz.
// As regras da cobrança são as que a Stripe e a API aplicam; os preços
// ficam em /precos, lidos de planos.ts, e não são escritos aqui.
export function Termos() {
  const { nome, cpf, email } = vendedor();
  return (
    <DocumentoLegal titulo="Termos de uso" sumario={SUMARIO}>
      <SecaoLegal id="quem-somos" titulo="Quem somos">
        <p>
          O BarChop é um sistema de agendamento online para barbearias, oferecido por {ouAPreencher(nome)}, pessoa
          física, CPF {ouAPreencher(cpf)}. Contato: {email ? <a href={`mailto:${email}`}>{email}</a> : ouAPreencher(email)}
          . Ao criar uma barbearia ou usar o painel, você concorda com estes termos.
        </p>
      </SecaoLegal>

      <SecaoLegal id="o-servico" titulo="O serviço">
        <p>
          A barbearia ganha uma página própria em que o cliente escolhe o serviço, o profissional e o
          horário, e um painel para a equipe cuidar da agenda. O cliente pode receber lembrete do
          horário por e-mail, com link para confirmar a presença ou cancelar.
        </p>
      </SecaoLegal>

      <SecaoLegal id="planos-e-cobranca" titulo="Planos, cobrança e cancelamento">
        <ul>
          <li>Toda barbearia começa com {DIAS_DE_TESTE} dias de teste com tudo liberado, sem cartão.</li>
          <li>
            Os planos, o que cada um inclui e os preços estão na página de <a href="/precos">preços</a>. Quando um
            preço mudar, avisamos no painel com pelo menos 30 dias de antecedência, e o valor novo só vale a
            partir da renovação seguinte.
          </li>
          <li>
            O valor dos planos pagos depende de quantos profissionais atendem: o dono e os profissionais da
            equipe. A recepção não conta. Incluir um profissional com o plano pago soma o valor proporcional na
            cobrança.
          </li>
          <li>
            O pagamento é no cartão de crédito, pela Stripe, que processa a cobrança. O BarChop não vê nem guarda
            os dados do cartão.
          </li>
          <li>
            O plano se renova sozinho ao fim de cada período, mensal ou anual, com a cobrança adiantada do período
            seguinte. Quem assina durante o teste só é cobrado quando o teste acaba.
          </li>
          <li>
            Subir de plano no meio do período: paga-se na hora só a diferença pelos dias que faltam. Descer de
            plano ou trocar o anual pelo mensal: a mudança vale no fim do período já pago.
          </li>
          <li>
            Você pode cancelar quando quiser, sem multa, em Faturas, no painel. O plano vale até o fim do período
            já pago, sem devolução proporcional do período em curso.
          </li>
          <li>
            Desistiu da primeira assinatura? Em até 7 dias da primeira cobrança, peça pelo e-mail de contato e o
            valor é devolvido (direito de arrependimento, art. 49 do Código de Defesa do Consumidor).
          </li>
          <li>
            Se a cobrança falhar, a Stripe tenta cobrar de novo nos dias seguintes, e o BarChop continua
            funcionando enquanto isso. Se ela não conseguir, a assinatura é cancelada.
          </li>
          <li>
            Sem plano pago (no fim do teste, depois de cancelar ou quando a cobrança não passa), a barbearia vai
            para o Grátis: nada é apagado, mas só 1 profissional aparece no link de agendamento.
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="sua-conta" titulo="Sua conta e a da sua equipe">
        <ul>
          <li>Quem cria a barbearia é o dono da conta e responde pelo uso que a equipe faz dela.</li>
          <li>Os dados informados no cadastro precisam ser verdadeiros, e o e-mail precisa ser seu.</li>
          <li>A senha é pessoal. Se desconfiar que alguém a conhece, troque pelo painel.</li>
          <li>O endereço da página (o link da barbearia) é único e só muda com um pedido ao suporte.</li>
          <li>Só o dono vê e mexe na assinatura e nas faturas.</li>
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
          Você pode encerrar a conta da barbearia quando quiser, pedindo ao suporte. Encerrar a conta
          cancela a assinatura. Antes de apagar, podemos exportar os seus dados. Depois do
          encerramento, os dados são apagados no prazo da política de privacidade, salvo o que a lei
          obrigar a guardar.
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
