
const PAGARME_API_URL = 'https://api.pagar.me/core/v5/orders';

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
  
  // 1. Prepare Split
  const splits = [];
  let allocatedAmount = 0;

  // Filter valid coproducers with Pagar.me Recipient ID
  const validCoproducers = coproducers.filter(c => c.pagarmeRecipientId && c.isActive !== false);

  for (const copro of validCoproducers) {
    const sharePercentage = Number(copro.percentage) || 0;
    const shareAmount = Math.round(totalAmountCents * (sharePercentage / 100));
    
    if (shareAmount > 0) {
      splits.push({
        amount: shareAmount,
        recipient_id: copro.pagarmeRecipientId,
        type: 'flat',
        options: {
          charge_processing_fee: true,
          charge_remainder_fee: true,
          liable: true
        }
      });
      allocatedAmount += shareAmount;
    }
  }

  // 2. Master Split (Remainder)
  // If there's a remaining amount, it must go to the main recipient (Master)
  // We assume the Master Recipient ID is provided in orderData or environment
  const masterRecipientId = process.env.PAGARME_MASTER_RECIPIENT_ID;
  const remainder = totalAmountCents - allocatedAmount;

  if (remainder > 0 && masterRecipientId) {
    splits.push({
      amount: remainder,
      recipient_id: masterRecipientId,
      type: 'flat',
      options: {
        charge_processing_fee: true,
        charge_remainder_fee: true,
        liable: true
      }
    });
  } else if (remainder > 0 && splits.length > 0) {
    // If no master ID but we have other splits, add remainder to the first one to avoid rounding errors
    splits[0].amount += remainder;
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
        payment_method: orderData.payment_method === 'credit_card' ? 'credit_card' : (orderData.payment_method === 'pix' ? 'pix' : 'boleto'),
        [orderData.payment_method === 'credit_card' ? 'credit_card' : (orderData.payment_method === 'pix' ? 'pix' : 'boleto')]: orderData.card_token ? {
            // If credit card, use token or detailed data (V5 standard prefers tokens or complete card objects)
            card_token: orderData.card_token,
            installments: orderData.installments || 1,
            statement_descriptor: 'VIBECODE'
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
  console.log('[Pagarme] handleWebhook called with:', payload);
  throw new Error('Pagar.me service integration pending.');
};
