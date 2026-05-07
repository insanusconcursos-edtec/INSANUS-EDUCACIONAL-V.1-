
import { provisionPurchase } from './provisioningService.js';

const PAGARME_API_URL = 'https://api.pagar.me/core/v5/orders';

// Pagar.me Fees (in cents)
const GATEWAY_FEE = 40; // R$ 0,40
const BOLETO_FEE = 319; // R$ 3,19
const PIX_RATE = 0.012; // 1.20%
const CC_RATES: Record<number, number> = {
  1: 0.0516, 2: 0.0353, 3: 0.0316, 4: 0.0285, 5: 0.0258, 6: 0.0238,
  7: 0.0274, 8: 0.0265, 9: 0.0262, 10: 0.0263, 11: 0.0271, 12: 0.0285
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
    if (!copro.pagarmeRecipientId || copro.isActive === false) continue;
    
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

export const createPagarmeOrder = async (orderData: any, coproducers: any[] = []) => {
  console.log('[Pagarme] Creating order for:', orderData.description);

  // Pagar.me works with cents
  const totalAmountCents = Math.round(Number(orderData.transaction_amount) * 100);
  
  // Prepare Cascade Splits
  const affiliateData = orderData.affiliateId && orderData.affiliateRecipientId ? {
    percentage: Number(orderData.affiliatePercentage) || 0,
    recipientId: orderData.affiliateRecipientId
  } : null;

  const splits = calculateCascadeSplits(
    totalAmountCents,
    orderData.payment_method,
    orderData.installments || 1,
    affiliateData,
    coproducers
  );

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
            expires_in: 3600 // 1 hour
        } : {
            expires_in: 86400 * 3 // 3 days
        }),
        split: splits.length > 0 ? splits : undefined
      }
    ],
    metadata: orderData.metadata
  };

  try {
    const response = await fetch(PAGARME_API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Pagarme] API Error:', result);
      throw new Error(result.message || 'Erro ao criar pedido no Pagar.me');
    }

    if (response.ok && result.status === 'paid') {
      console.log('[Pagarme] Order paid immediately. Provisioning access...');
      const customerData = {
        email: orderData.payer.email,
        name: orderData.payer.name,
        cpf: orderData.payer.document.replace(/\D/g, ''),
        phone: orderData.metadata.userPhone
      };
      const productId = orderData.productId || orderData.metadata.courseId || orderData.metadata.productId;
      
      if (productId) {
        provisionPurchase(customerData, String(productId), 'pagarme').catch(err => {
          console.error('[Pagarme] Error provisioning immediate access:', err);
        });
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

export const handlePagarmeWebhook = async (payload: Record<string, any>) => {
  console.log('[Pagarme] handleWebhook called event:', payload.type);

  try {
    const eventType = payload.type;
    const orderData = payload.data;

    if (eventType === 'order.paid') {
      console.log('[Pagarme] Webhook: Order paid. Provisioning access for:', orderData.customer.email);
      
      const customerData = {
        email: orderData.customer.email,
        name: orderData.customer.name,
        cpf: orderData.customer.document || '',
        phone: orderData.customer.phones?.mobile_phone 
          ? `${orderData.customer.phones.mobile_phone.country_code}${orderData.customer.phones.mobile_phone.area_code}${orderData.customer.phones.mobile_phone.number}`
          : ''
      };

      const productId = orderData.metadata?.courseId || orderData.metadata?.productId;
      
      if (productId) {
        await provisionPurchase(customerData, String(productId), 'pagarme');
        return { success: true, message: 'Provisioning triggered' };
      } else {
        console.warn('[Pagarme] Webhook: Paid order missing courseId/productId in metadata');
      }
    }

    return { success: true, message: 'Webhook received' };
  } catch (error) {
    console.error('[Pagarme] Error processing webhook:', error);
    throw error;
  }
};
