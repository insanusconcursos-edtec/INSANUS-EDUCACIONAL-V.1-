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
    
    // 3. Tratamento de Erro (Try/Catch) Explícito com Log Detalhado
    const response = await payment.create({
      body: {
        transaction_amount: Number(data.transaction_amount),
        token: data.token,
        description: data.description,
        installments: Number(data.installments),
        payment_method_id: data.payment_method_id,
        issuer_id: data.issuer_id,
        payer: {
          email: email,
          identification: { 
            type: 'CPF', 
            number: sanitizedCpf 
          },
        },
        metadata: data.metadata,
        external_reference: String(data.metadata?.courseId || data.metadata?.course_id || '')
      }
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
