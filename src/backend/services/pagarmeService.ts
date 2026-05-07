
import { provisionPurchase } from './provisioningService.js';
import { getAdminConfig } from './firebaseAdmin.js';

const PAGARME_API_URL = 'https://api.pagar.me/core/v5/orders';

// Pagar.me Fees (in cents)
const GATEWAY_FEE = 40; // R$ 0,40
const BOLETO_FEE = 319; // R$ 3,19
const PIX_RATE = 0.012; // 1.20%
const CC_RATES: Record<number, number> = {
  1: 0.0516, 2: 0.0353, 3: 0.0316, 4: 0.0285, 5: 0.0258, 6: 0.0238,
  7: 0.0274, 8: 0.0265, 9: 0.0262, 10: 0.0263, 11: 0.0271, 12: 0.0285
};

const INSTALLMENT_MULTIPLIERS: Record<number, number> = {
  1: 1.00000, 2: 1.04018, 3: 1.06027, 4: 1.08036,
  5: 1.10045, 6: 1.12054, 7: 1.14063, 8: 1.16072,
  9: 1.18081, 10: 1.20090, 11: 1.22100, 12: 1.24109
};

/**
 * Calculates financial distribution in cascade:
 * Total -> Fees -> Affiliate -> Coproducers -> Master
 */
const calculateCascadeSplits = (
  totalAmountCents: number,
  method: string,
  installments: number,
  affiliateData: { percentage: number, recipientId: string } | null,
  coproducers: any[]
) => {
  // 1. Calculate Pagarme Fees
  let pagarmeFee = GATEWAY_FEE;
  if (method === 'credit_card') {
    const rate = CC_RATES[installments] || CC_RATES[1];
    pagarmeFee += Math.round(totalAmountCents * rate);
  } else if (method === 'pix') {
    pagarmeFee += Math.round(totalAmountCents * PIX_RATE);
  } else if (method === 'ticket') {
    pagarmeFee += BOLETO_FEE;
  }

  // 2. Post-Fee Value
  const postFeeValue = totalAmountCents - pagarmeFee;
  const splits = [];
  let totalDistributed = 0;

  // 3. Affiliate Commission (on Post-Fee Value)
  if (affiliateData && affiliateData.recipientId && affiliateData.percentage > 0) {
    const affiliateAmount = Math.floor(postFeeValue * (affiliateData.percentage / 100));
    if (affiliateAmount > 0) {
      splits.push({
        amount: affiliateAmount,
        recipient_id: affiliateData.recipientId,
        type: 'flat',
        options: {
          charge_processing_fee: false,
          charge_remainder_fee: false,
          liable: true
        }
      });
      totalDistributed += affiliateAmount;
    }
  }

  // 4. Coproducers Commission (on what's left after Affiliate)
  const remainingAfterAffiliate = postFeeValue - totalDistributed;
  
  for (const copro of coproducers) {
    // Validação rigorosa do ID do recebedor Pagar.me
    if (!copro.pagarmeRecipientId || !copro.pagarmeRecipientId.startsWith('re_') || copro.isActive === false) {
      console.warn(`⚠️ [Pagarme] Coprodutor ${copro.coproducerName || 'sem nome'} ignorado no split: ID inválido ou inativo.`);
      continue;
    }
    
    const coproPercentage = Number(copro.percentage) || 0;
    const coproAmount = Math.floor(remainingAfterAffiliate * (coproPercentage / 100));
    
    if (coproAmount > 0) {
      splits.push({
        amount: coproAmount,
        recipient_id: copro.pagarmeRecipientId,
        type: 'flat',
        options: {
          charge_processing_fee: false,
          charge_remainder_fee: false,
          liable: true
        }
      });
      totalDistributed += coproAmount;
    }
  }

  // 5. Master Split (Remainder covering fees)
  // Master gets: Total - (Affiliate + Coproducers)
  // Pagar.me will then deduct the real fees from Master's balance because charge_processing_fee: true
  const masterRecipientId = process.env.PAGARME_MASTER_RECIPIENT_ID;
  const masterAmount = totalAmountCents - totalDistributed;

  if (masterRecipientId) {
    splits.push({
      amount: masterAmount,
      recipient_id: masterRecipientId,
      type: 'flat',
      options: {
        charge_processing_fee: true,
        charge_remainder_fee: true,
        liable: true
      }
    });
  } else {
    console.error("❌ [Pagarme] PAGARME_MASTER_RECIPIENT_ID não configurado! Split pode falhar.");
  }

  return splits;
};

const getHeaders = () => {
  const secretKey = process.env.PAGARME_SECRET_KEY;
  if (!secretKey) throw new Error('PAGARME_SECRET_KEY not found in environment');
  
  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
};

export const createPagarmeOrder = async (orderData: any, initialCoproducers: any[] = []) => {
  console.log('[Pagarme] 🛒 Iniciando criação de pedido para:', orderData.description);
  const { dbAdmin } = getAdminConfig();

  // 0. Fetch Product/Offer data from Firestore to get Split Rules
  let coproducers = [...initialCoproducers];
  let affiliateDataFromDB = null;

  try {
    const productId = orderData.metadata?.courseId || orderData.metadata?.productId || orderData.productId;
    const offerId = orderData.metadata?.offerId;
    
    // 1. Tentar buscar por Oferta primeiro (regras específicas de preço/split)
    if (offerId) {
      console.log(`[Pagarme] Buscando regras na Oferta: ${offerId}`);
      const offerDoc = await dbAdmin.collection('offers').doc(offerId).get();
      if (offerDoc.exists) {
        const data = offerDoc.data();
        if (data?.coproducers && Array.isArray(data.coproducers) && coproducers.length === 0) {
          coproducers = data.coproducers;
          console.log(`[Pagarme] ✅ ${coproducers.length} Coprodutores encontrados na Oferta.`);
        }
      }
    }

    // 2. Se não encontrou coprodutores na oferta, tenta no Curso/Produto base
    if (coproducers.length === 0 && productId) {
      console.log(`[Pagarme] Buscando regras no Curso/Produto: ${productId}`);
      const courseDoc = await dbAdmin.collection('courses').doc(productId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        if (data?.coproducers && Array.isArray(data.coproducers)) {
          coproducers = data.coproducers;
          console.log(`[Pagarme] ✅ ${coproducers.length} Coprodutores encontrados no Curso.`);
        }
      }
    }
        
    // 3. Buscar dados do Vendedor (Afiliado) se houver ID
    const affiliateId = orderData.metadata?.affiliateId || orderData.affiliateId;
    if (affiliateId) {
      const affDoc = await dbAdmin.collection('users').doc(affiliateId).get();
      if (affDoc.exists) {
        const affUser = affDoc.data();
        if (affUser?.pagarmeRecipientId) {
          affiliateDataFromDB = {
            percentage: Number(orderData.metadata?.affiliatePercentage) || Number(orderData.affiliatePercentage) || 0,
            recipientId: affUser.pagarmeRecipientId
          };
          console.log(`[Pagarme] ✅ Vendedor (Afiliado) identificado: ${affUser.name} (${affiliateId}) - ${affiliateDataFromDB.percentage}%`);
        } else {
          console.warn(`⚠️ [Pagarme] Vendedor ${affiliateId} não possui pagarmeRecipientId configurado.`);
        }
      }
    }
  } catch (error) {
    console.error('[Pagarme] ❌ Erro ao buscar dados de split no Firestore:', error);
  }

  // Recalculate total amount with interest based on installments
  const installments = orderData.installments || 1;
  const multiplier = INSTALLMENT_MULTIPLIERS[installments] || 1;
  const originalAmount = Number(orderData.transaction_amount);
  const totalAmountWithInterest = originalAmount * multiplier;

  // Pagar.me works with cents
  const totalAmountCents = Math.round(totalAmountWithInterest * 100);
  
  // Prepare Cascade Splits
  const finalAffiliateData = affiliateDataFromDB || (orderData.affiliateId && orderData.affiliateRecipientId ? {
    percentage: Number(orderData.affiliatePercentage) || 0,
    recipientId: orderData.affiliateRecipientId
  } : null);

  const splits = calculateCascadeSplits(
    totalAmountCents,
    orderData.payment_method,
    installments,
    finalAffiliateData,
    coproducers
  );

  // Log Split Payload specifically for debugging as requested
  if (splits.length > 0) {
    console.log("🚀 Payload de Split preparado:", JSON.stringify(splits, null, 2));
  }

  // 3. Build Payload
  const payload: any = {
    items: [
      {
        amount: totalAmountCents,
        description: orderData.description || 'Produto Digital',
        quantity: 1,
        code: orderData.productId || 'item_1'
      }
    ],
    customer: {
      name: orderData.payer.name,
      email: orderData.payer.email,
      type: 'individual',
      document: orderData.payer.document.replace(/\D/g, ''),
      phones: {
        mobile_phone: {
          country_code: '55',
          area_code: orderData.metadata.userPhone?.substring(1, 3) || '11',
          number: orderData.metadata.userPhone?.replace(/\D/g, '').substring(2) || '999999999'
        }
      }
    },
    payments: [
      {
        payment_method: orderData.payment_method,
        [orderData.payment_method]: orderData.payment_method === 'credit_card' ? {
            installments: orderData.installments || 1,
            statement_descriptor: 'VIBECODE',
            card: orderData.card_token ? {
              token: orderData.card_token
            } : {
              number: orderData.card_number,
              holder_name: orderData.card_holder_name,
              exp_month: orderData.card_expiration_month,
              exp_year: orderData.card_expiration_year,
              cvv: orderData.card_cvv
            }
        } : (orderData.payment_method === 'pix' ? {
            expires_in: 1800 // 30 minutes
        } : {
            expires_in: 86400 * 3 // 3 days
        }),
        split: splits.length > 0 ? splits : undefined,
        splits: splits.length > 0 ? splits : undefined
      }
    ],
    metadata: orderData.metadata
  };

  // Critical Log for Auditing as requested
  console.log("🚀 [Pagarme] Payload Final do Pedido:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(PAGARME_API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Pagarme] API Error:', result);
      // Pagar.me often returns errors in an 'errors' array or just a 'message'
      const errorMessage = result.message || (result.errors && result.errors[0]?.message);
      throw new Error(errorMessage || 'Erro ao criar pedido no Pagar.me');
    }

    // Check for payment failure in the charge
    const charge = result.charges?.[0];
    if (charge && (charge.status === 'failed' || charge.status === 'not_authorized')) {
      const declineReason = charge.last_transaction?.acquirer_message || charge.last_transaction?.status_details || 'Pagamento recusado pelo banco emissor.';
      console.warn('[Pagarme] Payment Refused:', declineReason);
      
      const error = new Error(declineReason);
      (error as any).status = 'failed';
      (error as any).pagarmeResponse = result;
      throw error;
    }

    if (result.status === 'paid') {
      console.log('[Pagarme] Order paid immediately. Provisioning access...');
      const customerData = {
        email: orderData.payer.email,
        name: orderData.payer.name,
        cpf: orderData.payer.document.replace(/\D/g, ''),
        phone: orderData.metadata.userPhone
      };
      const productId = orderData.productId || orderData.metadata.courseId || orderData.metadata.productId;
      
      if (productId) {
        try {
          await provisionPurchase(customerData, String(productId), 'pagarme');
          console.log('[Pagarme] Immediate provisioning success for:', customerData.email);
        } catch (err) {
          console.error('[Pagarme] Error provisioning immediate access:', err);
          // We don't necessarily want to fail the whole payment if provisioning fails 
          // (it might be retried via webhook), but since it's synchronous paid status, 
          // we should probably let it continue or handle it.
        }
      }
    }

    return result;
  } catch (error: any) {
    console.error('[Pagarme] fetch error:', error);
    throw error;
  }
};

export const createPagarmeTransaction = async (data: Record<string, any>) => {
  // Keeping this for compatibility but routing to createPagarmeOrder
  return createPagarmeOrder(data);
};

export const createPagarmeRecipient = async (data: Record<string, any>) => {
  console.log('[Pagarme] createRecipient called with:', data);
  throw new Error('Pagar.me service integration pending.');
};

export const getPagarmeOrderStatus = async (orderId: string) => {
  console.log(`[Pagarme] Checking status for order: ${orderId}`);
  
  try {
    const response = await fetch(`${PAGARME_API_URL}/${orderId}`, {
      method: 'GET',
      headers: getHeaders()
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Pagarme] Status Check API Error:', result);
      throw new Error('Erro ao consultar status no Pagar.me');
    }

    return result;
  } catch (error) {
    console.error('[Pagarme] Error checking order status:', error);
    throw error;
  }
};

export const handlePagarmeWebhook = async (payload: Record<string, any>) => {
  console.log('✅ [Pagarme] Webhook recebido:', payload.type);

  try {
    const eventType = payload.type;
    const orderData = payload.data;

    if (eventType === 'order.paid') {
      const email = orderData.metadata?.userEmail || orderData.customer.email;
      console.log(`🚀 [Pagarme] Processando order.paid para o e-mail: ${email}`);
      
      const customerData = {
        email: email,
        name: orderData.metadata?.userName || orderData.customer.name,
        cpf: orderData.customer.document || '',
        phone: orderData.metadata?.userPhone || (orderData.customer.phones?.mobile_phone 
          ? `${orderData.customer.phones.mobile_phone.country_code}${orderData.customer.phones.mobile_phone.area_code}${orderData.customer.phones.mobile_phone.number}`
          : '')
      };

      const productId = orderData.metadata?.courseId || orderData.metadata?.productId || orderData.metadata?.offerId;
      
      if (productId) {
        await provisionPurchase(customerData, String(productId), 'pagarme');
        return { success: true, message: 'Provisioning triggered' };
      } else {
        console.warn(`⚠️ [Pagarme] Webhook: Ordem paga (${orderData.id}) sem courseId/productId no metadata`);
      }
    }

    return { success: true, message: 'Webhook received' };
  } catch (error) {
    console.error('❌ [Pagarme] Erro ao processar webhook:', error);
    throw error;
  }
};
