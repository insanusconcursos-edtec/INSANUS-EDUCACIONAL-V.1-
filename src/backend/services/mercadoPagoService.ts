import { MercadoPagoConfig, Payment } from 'mercadopago';
import { provisionPurchase } from './provisioningService.js';

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '' 
});

export const createMPPayment = async (data: any) => {
  // 2. Verificação do Access Token
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error("❌ ERRO: MP_ACCESS_TOKEN não está definido no ambiente.");
    throw new Error("Configuração do Mercado Pago ausente no servidor (Token).");
  }

  const payment = new Payment(client);
  
  // 1. Sanitização do Payer Payload
  const rawCpf = data.payer?.identification?.number || '';
  const sanitizedCpf = rawCpf.replace(/\D/g, ''); // Apenas números
  const email = data.payer?.email?.trim();

  try {
    console.log(`[MP] Iniciando criação de pagamento para: ${email}`);
    
    // 3. Construção Dinâmica do Body (Evita erro 500 por campos conflitantes no Pix)
    const paymentBody: any = {
      transaction_amount: Number(data.transaction_amount),
      description: data.description,
      payment_method_id: data.payment_method_id,
      payer: {
        email: email,
        identification: { 
          type: 'CPF', 
          number: sanitizedCpf 
        },
      },
      metadata: data.metadata,
      external_reference: String(data.metadata?.courseId || data.metadata?.course_id || '')
    };

    // Proteção Adicional: Validação de segurança para transaction_amount e payment_method_id
    // Fallback de segurança no servidor
    if (!data.payment_method_id && (data.payment_type_id === 'bank_transfer' || data.paymentType === 'bank_transfer' || data.selectedPaymentMethod === 'bank_transfer')) {
      data.payment_method_id = 'pix';
    }

    if (!data.payment_method_id) {
      console.error("❌ MP Falha Crítica: Payload recebido sem payment_method_id:", JSON.stringify(data, null, 2));
      throw new Error("Falha interna: payment_method_id ausente no payload da requisição.");
    }

    if (!paymentBody.transaction_amount || isNaN(paymentBody.transaction_amount)) {
      console.error("❌ MP Falha: transaction_amount inválido no payload:", data.transaction_amount);
      throw new Error("Falha interna: transaction_amount inválido ou ausente no payload.");
    }

    // Lógica condicional por método de pagamento
    if (data.payment_method_id === 'pix') {
      paymentBody.installments = 1;
      // Pix não aceita token ou issuer_id
    } else {
      // Cartões e outros métodos
      paymentBody.token = data.token;
      paymentBody.installments = Number(data.installments) || 1;
      if (data.issuer_id) {
        paymentBody.issuer_id = data.issuer_id;
      }
    }

    const response = await payment.create({
      body: paymentBody
    });

    console.log(`[MP] Pagamento criado com sucesso: ${response.id} | Status: ${response.status}`);
    return response;
  } catch (error: any) {
    // Log detalhado para o console do servidor
    console.error("❌ MP Create Payment Error:", {
      message: error?.message,
      cause: error?.cause,
      status: error?.status,
      details: error?.response?.data || error?.details
    });
    
    // Lançando o erro com detalhes simplificados para o server.ts
    const detailedMessage = error?.cause?.[0]?.description || error?.message || 'Erro interno no processamento do Mercado Pago';
    throw new Error(detailedMessage);
  }
};

export const handleMPWebhook = async (payload: any) => {
  try {
    // Mercado Pago provides action and data.id for notifications
    if (payload.action === 'payment.created' || payload.action === 'payment.updated' || payload.type === 'payment') {
      const paymentId = payload.data?.id || payload.id;
      
      if (!paymentId) return { success: false, error: 'No payment ID found' };

      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status === 'approved') {
        const { metadata, payer, external_reference } = paymentData;
        const courseId = metadata?.course_id || metadata?.courseId || external_reference;
        const email = metadata?.user_email || metadata?.userEmail || payer?.email;
        const name = metadata?.user_name || metadata?.userName || 'Aluno';
        const phone = metadata?.user_phone || metadata?.userPhone || '';
        const cpf = metadata?.user_cpf || metadata?.userCpf || '';

        if (email && courseId) {
          console.log(`[MP] Pagamento Aprovado. Providenciando acesso para ${email} (Produto: ${courseId})`);
          
          const customerData = {
            email,
            name,
            phone: phone,
            cpf: cpf
          };

          await provisionPurchase(customerData, String(courseId), 'mp');
          return { success: true };
        } else {
          console.warn('[MP] Pagamento aprovado mas faltam dados (email ou courseId):', { email, courseId });
        }
      }
    }
    
    return { success: true, message: 'Notification received' };
  } catch (error) {
    console.error('Error handling Mercado Pago webhook:', error);
    throw error;
  }
};
