import { MercadoPagoConfig, Payment } from 'mercadopago';
import { provisionPurchase } from './provisioningService.js';
import { getAdminConfig } from './firebaseAdmin.js';

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || '' 
});

export const createMPPayment = async (data: Record<string, any>) => {
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
    const paymentBody: Record<string, any> = {
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

    // 4. Implementação de Split de Pagamento (Coprodução e Afiliados)
    const productId = data.productId || data.metadata?.courseId;
    const offerId = data.metadata?.offerId;
    const affiliateId = data.affiliateId || data.metadata?.refId;

    if (productId) {
      try {
        const { dbAdmin } = getAdminConfig();
        const productRef = dbAdmin.collection('ticto_products').doc(productId);
        const productDoc = await productRef.get();

        if (productDoc.exists) {
          const productData = productDoc.data();
          const disbursements: any[] = [];
          let totalPercentage = 0;

          // 4.1. Processamento de Coprodução (Vendedor Original)
          const coproductionSplits = productData?.coproduction || [];
          if (Array.isArray(coproductionSplits)) {
            coproductionSplits.forEach((split: any) => {
              const percentage = Number(split.percentage) || 0;
              totalPercentage += percentage;
              
              const splitAmount = Number(((percentage / 100) * Number(data.transaction_amount)).toFixed(2));
              if (splitAmount > 0 && split.mpCollectorId) {
                disbursements.push({
                  collector_id: Number(split.mpCollectorId),
                  disbursement_amount: splitAmount,
                  disbursement_fee: 0
                });
              }
            });
          }

          // 4.2. Processamento de Afiliado (Se habilitado na oferta)
          if (offerId && affiliateId && affiliateId.trim()) {
            const offer = productData?.offers?.find((o: any) => o.id === offerId);
            
            if (offer && offer.isAffiliationEnabled) {
              const commission = Number(offer.affiliateCommission) || 0;
              
              // Busca o vendedor (collaborator) pelo username (refId)
              const affiliateSnapshot = await dbAdmin.collection('users')
                .where('username', '==', affiliateId.trim().toLowerCase())
                .where('role', '==', 'seller')
                .limit(1)
                .get();

              if (!affiliateSnapshot.empty) {
                const affiliateData = affiliateSnapshot.docs[0].data();
                const mpCollectorId = affiliateData.mpCollectorId;

                if (mpCollectorId && commission > 0) {
                  totalPercentage += commission;
                  const affiliateAmount = Number(((commission / 100) * Number(data.transaction_amount)).toFixed(2));
                  
                  disbursements.push({
                    collector_id: Number(mpCollectorId),
                    disbursement_amount: affiliateAmount,
                    disbursement_fee: 0
                  });
                  console.log(`[MP] Split de Afiliado configurado (${affiliateId}): ${commission}% (R$ ${affiliateAmount})`);
                }
              }
            }
          }

          // Proteção Final: Garante que a soma não ultrapasse 100%
          if (totalPercentage <= 100) {
            if (disbursements.length > 0) {
              paymentBody.disbursements = disbursements;
              console.log(`[MP] Split Total configurado: ${disbursements.length} destinatários. Total: ${totalPercentage}%`);
            }
          } else {
            console.error(`[MP] Falha Crítica: Soma dos splits (${totalPercentage}%) ultrapassa 100% para o produto ${productId}. Abortando transação.`);
            throw new Error(`Configuração de split inválida (${totalPercentage}%). A soma dos splits não pode ultrapassar 100%.`);
          }
        }
      } catch (dbError: any) {
        if (dbError.message && dbError.message.includes('A soma dos splits')) {
          throw dbError; // Re-throw split validation error
        }
        console.error(`[MP] Erro ao carregar regras de split para o produto ${productId}:`, dbError);
      }
    }

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
  } catch (error: unknown) {
    const err = error as any;
    // Log detalhado para o console do servidor
    console.error("❌ MP Create Payment Error:", {
      message: err?.message,
      cause: err?.cause,
      status: err?.status,
      details: err?.response?.data || err?.details
    });
    
    // Lançando o erro com detalhes simplificados para o server.ts
    let detailedMessage = err?.cause?.[0]?.description || err?.message || 'Erro interno no processamento do Mercado Pago';
    
    // Captura específica para erro de chave PIX ausente na conta do vendedor
    if (detailedMessage.includes('Collector user without key enabled') || err?.message?.includes('Collector user without key enabled')) {
      detailedMessage = "O vendedor não possui uma chave PIX cadastrada no Mercado Pago. Por favor, cadastre uma chave PIX na sua conta do Mercado Pago para aceitar pagamentos via PIX.";
    }

    throw new Error(detailedMessage);
  }
};

export const handleMPWebhook = async (payload: Record<string, any>) => {
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
