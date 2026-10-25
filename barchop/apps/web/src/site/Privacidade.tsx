import { ouAPreencher, vendedor } from "./controlador";
import { DocumentoLegal, SecaoLegal, type ItemDoSumario } from "./DocumentoLegal";

const SUMARIO: ItemDoSumario[] = [
  { id: "papeis", titulo: "Quem decide sobre cada dado" },
  { id: "dados-coletados", titulo: "Que dados coletamos" },
  { id: "para-que", titulo: "Para que usamos" },
  { id: "quem-ajuda", titulo: "Quem nos ajuda a operar" },
  { id: "por-quanto-tempo", titulo: "Por quanto tempo guardamos" },
  { id: "seus-direitos", titulo: "Seus direitos" },
  { id: "contato", titulo: "Contato" },
];

// Política de privacidade do BarChop (onda 1s-b), pela LGPD. Rascunho
// base pra revisão jurídica. O BarChop tem dois papéis: controlador dos
// dados da conta (dono e equipe) e operador dos dados dos clientes
// finais, que são da barbearia.
export function Privacidade() {
  const { nome, cpf, email } = vendedor();
  return (
    <DocumentoLegal titulo="Política de privacidade" sumario={SUMARIO}>
      <SecaoLegal id="papeis" titulo="Quem decide sobre cada dado">
        <p>
          Para os dados de quem cria e usa o painel — o dono da barbearia e a equipe —, o BarChop (
          {ouAPreencher(nome)}) é o <strong>controlador</strong>: decide como esses dados são usados.
        </p>
        <p>
          Para os dados dos clientes que agendam pela página da barbearia, a barbearia é a
          controladora e o BarChop é o <strong>operador</strong>: trata esses dados só em nome dela e
          para o agendamento funcionar.
        </p>
      </SecaoLegal>

      <SecaoLegal id="dados-coletados" titulo="Que dados coletamos">
        <ul>
          <li>Da conta: nome, e-mail, telefone, senha (guardada só como hash) e o papel na equipe.</li>
          <li>
            Da barbearia: nome, endereço, contatos, horários, serviços, preços, fotos e as configurações
            do painel.
          </li>
          <li>Dos clientes da barbearia: nome, telefone, e-mail (quando informado) e os agendamentos.</li>
          <li>
            Dos clientes que assinam um plano da barbearia: as assinaturas, as mensalidades recebidas e os usos de cada
            ciclo. De quem assina um plano online, também o CPF, que o Asaas exige para cobrar; ele fica no cadastro do
            cliente naquela barbearia.
          </li>
          <li>
            De quem vende planos online: a chave de API do Asaas, guardada cifrada. Ela não volta para a tela, que só
            mostra os últimos caracteres.
          </li>
          <li>
            Da assinatura do BarChop: o plano, a situação da cobrança e as faturas. Os dados do cartão ficam com a Stripe: o
            BarChop não vê nem guarda os dados do cartão.
          </li>
          <li>Técnicos: endereço IP e registros de acesso, para segurança e para evitar abuso.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal id="para-que" titulo="Para que usamos">
        <ul>
          <li>Fazer o agendamento funcionar: mostrar horários livres, marcar, remarcar e cancelar.</li>
          <li>Enviar o código de verificação e o lembrete do horário por e-mail.</li>
          <li>Cobrar a assinatura dos planos pagos e avisar o dono sobre ela.</li>
          <li>
            Fazer os planos que a barbearia vende funcionarem: criar e cancelar a cobrança na conta de quem vende,
            receber do Asaas a situação dos pagamentos e contar os usos no caixa.
          </li>
          <li>Proteger as contas e o sistema contra acesso indevido e uso abusivo.</li>
          <li>Cumprir obrigações legais.</li>
        </ul>
        <p>Não vendemos dados e não usamos os dados dos clientes da barbearia para publicidade.</p>
      </SecaoLegal>

      <SecaoLegal id="quem-ajuda" titulo="Quem nos ajuda a operar">
        <ul>
          <li>Resend: envio dos e-mails (código de verificação e lembrete).</li>
          <li>Stripe: cobrança da assinatura do BarChop e os dados do cartão de quem assina um plano pago do BarChop.</li>
          <li>Oracle Cloud: hospedagem do sistema e do banco de dados.</li>
          <li>Cloudflare: endereço (DNS) do site.</li>
        </ul>
        <p>Eles tratam os dados só para prestar esse serviço ao BarChop.</p>
        <p>
          Nos planos que a barbearia vende online, o Asaas é o serviço de pagamento escolhido por quem vende, e não um
          fornecedor do BarChop. Quando um cliente assina, o BarChop envia o nome, o CPF, o e-mail e o celular do
          cliente para a conta de quem vende no Asaas, para criar a cobrança. O pagamento é feito na página do Asaas: o BarChop não vê nem guarda
          os dados do cartão.
        </p>
      </SecaoLegal>

      <SecaoLegal id="por-quanto-tempo" titulo="Por quanto tempo guardamos">
        <p>
          Enquanto a conta da barbearia existir. Depois do encerramento, os dados são apagados em até 90
          dias, salvo o que a lei obrigar a guardar por mais tempo. Os códigos de verificação valem
          poucos minutos e não são guardados depois de usados. A chave de API do Asaas é apagada quando quem vende
          desconecta a conta.
        </p>
      </SecaoLegal>

      <SecaoLegal id="seus-direitos" titulo="Seus direitos">
        <p>
          Pela LGPD, você pode pedir para confirmar se tratamos seus dados, acessá-los, corrigi-los,
          apagá-los, levá-los para outro serviço e saber com quem os compartilhamos. Se você é cliente
          de uma barbearia, o pedido pode ir direto à barbearia — ou a nós, que encaminhamos.
        </p>
      </SecaoLegal>

      <SecaoLegal id="contato" titulo="Contato">
        <ul>
          <li>
            Responsável: {ouAPreencher(nome)}, pessoa física, CPF {ouAPreencher(cpf)}
          </li>
          <li>
            E-mail, também para o encarregado de dados (DPO):{" "}
            {email ? <a href={`mailto:${email}`}>{email}</a> : ouAPreencher(email)}
          </li>
        </ul>
      </SecaoLegal>
    </DocumentoLegal>
  );
}
