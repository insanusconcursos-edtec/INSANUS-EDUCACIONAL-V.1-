import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getAdminConfig } from './firebaseAdmin.js';
import { provisionPurchase } from './provisioningService.js';

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '' 
});

export const createMPPayment = async (data: any) => {
  const payment = new Payment(client);
  
  try {
    const response = await payment.create({
      body: {
        transaction_amount: data.transaction_amount,
        token: data.token,
        description: data.description,
        installments: data.installments,
        payment_method_id: data.payment_method_id,
        issuer_id: data.issuer_id,
        payer: {
          email: data.payer.email,
          identification: data.payer.identification,
        },
        metadata: data.metadata // courseId, etc.
      }
    });

    return response;
  } catch (error) {
    console.error('Error creating Mercado Pago payment:', error);
    throw error;
  }
};

export const handleMPWebhook = async (payload: any) => {
  const { dbAdmin } = getAdminConfig();
  
  try {
    // Mercado Pago provides action and data.id for notifications
    if (payload.action === 'payment.created' || payload.action === 'payment.updated' || payload.type === 'payment') {
      const paymentId = payload.data?.id || payload.id;
      
      if (!paymentId) return { success: false, error: 'No payment ID found' };

      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status === 'approved') {
        const { metadata, payer } = paymentData;
        const courseId = metadata?.course_id || metadata?.courseId;
        const email = payer?.email;
        const name = metadata?.user_name || metadata?.userName || 'Aluno';
        const phone = metadata?.user_phone || metadata?.userPhone || '';

        if (email && courseId) {
          console.log(`Liberando acesso via Mercado Pago para ${email} no curso ${courseId}`);
          
          // We need a customer data object for the provisioner
          const customerData = {
            email,
            name,
            phone: phone
          };

          // We'll use a modified provisioner or ensure it handles course IDs directly
          await provisionPurchase(customerData, courseId, 'mp');
          return { success: true };
        }
      }
    }
    
    return { success: true, message: 'Notification received' };
  } catch (error) {
    console.error('Error handling Mercado Pago webhook:', error);
    throw error;
  }
};
