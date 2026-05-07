
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
        console.log("🚨 [DEBUG DB] Chaves da Oferta:", Object.keys(data || {}));
        console.log("🔍 [Pagarme] Dados brutos de Coprodutores da Oferta:", JSON.stringify(data?.coproducers, null, 2));
        if (data?.coproducers && Array.isArray(data.coproducers) && coproducers.length === 0) {
          coproducers = data.coproducers;
          console.log(`[Pagarme] ✅ ${coproducers.length} Coprodutores encontrados na Oferta.`);
        }
      }
    }

    // 2. Se não encontrou coprodutores na oferta, tenta no Produto Ticto base
    if (coproducers.length === 0 && productId) {
      console.log(`[Pagarme] Buscando regras na coleção ticto_products: ${productId}`);
      
      const docRef = await dbAdmin.collection('ticto_products').doc(productId).get();
      
      if (docRef.exists) {
        const productData = docRef.data();
        console.log(`✅ [DEBUG BD] Produto encontrado com sucesso na coleção: ticto_products`);
        console.log("🚨 [DEBUG DB] Chaves do Produto:", Object.keys(productData || {}));
        
        // O array de divisão no BD se chama 'coproduction'
        const productCoproduction = productData?.coproduction || [];
        if (Array.isArray(productCoproduction) && productCoproduction.length > 0) {
          coproducers = productCoproduction;
          console.log(`[Pagarme] ✅ ${coproducers.length} Coprodutores encontrados na chave 'coproduction'.`);
        } else {
          console.log("⚠️ [Pagarme] Nenhuma regra encontrada na chave 'coproduction'.");
        }
      } else {
        console.error(`❌ [ERRO CRÍTICO] O ID ${productId} não existe na coleção ticto_products!`);
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

  // 🔴 LÓGICA DE DISTRIBUIÇÃO EM CASCATA (Split Cascade):

  // 1. Valor Bruto da Transação
  const grossAmount = totalAmountCents;
  
  // 2. Estimativa de Taxas Pagar.me para determinar Base Líquida
  let estimatedPagarmeFee = GATEWAY_FEE; // R$ 0,40 fixo base
  if (orderData.payment_method === 'pix') {
    estimatedPagarmeFee += Math.round(grossAmount * PIX_RATE);
  } else if (orderData.payment_method === 'credit_card') {
    estimatedPagarmeFee += Math.round(grossAmount * 0.0499); // 4.99% estimativa média para split
  } else {
    estimatedPagarmeFee += BOLETO_FEE; // R$ 3,19 fixo boleto
  }

  // 3. Valor Líquido Gateway (Base para as comissões)
  const netGatewayValue = grossAmount - estimatedPagarmeFee;
  console.log(`[Pagarme Cascade] Bruto: ${grossAmount} | Taxa Est.: ${estimatedPagarmeFee} | Líquido Gateway: ${netGatewayValue}`);

  const splitArray: any[] = [];
  let totalDistributedShares = 0;

  // 4. Vendedor/Afiliado (Comissão sobre o Líquido Gateway)
  if (affiliateDataFromDB && affiliateDataFromDB.recipientId) {
    const affiliateAmount = Math.floor(netGatewayValue * (affiliateDataFromDB.percentage / 100));
    if (affiliateAmount > 0) {
      splitArray.push({
        amount: affiliateAmount,
        recipient_id: affiliateDataFromDB.recipientId,
        type: 'flat',
        options: { charge_processing_fee: false, charge_remainder_fee: false, liable: true }
      });
      totalDistributedShares += affiliateAmount;
      console.log(`✅ [Pagarme Split] Vendedor ${affiliateDataFromDB.recipientId} recebe ${affiliateAmount} (${affiliateDataFromDB.percentage}% do Líquido)`);
    }
  }

  // 5. Base Líquida para Coprodutores
  const coproducerBase = netGatewayValue - totalDistributedShares;
  console.log(`[Pagarme Cascade] Base Líquida Coprodutores: ${coproducerBase}`);

  // 6. Loop de Coprodutores (Comissão sobre a Base de Coprodução)
  const coprodutoresArray = coproducers || [];
  if (coprodutoresArray.length > 0) {
    coprodutoresArray.forEach((copro: any) => {
      const recipientId = copro.pagarmeRecipientId || copro.recipientId;
      const percentage = Number(copro.percentage) || 0;
      
      if (recipientId && recipientId.startsWith('re_') && percentage > 0) {
        const coproAmount = Math.floor(coproducerBase * (percentage / 100));
        if (coproAmount > 0) {
          splitArray.push({
            amount: coproAmount,
            recipient_id: recipientId,
            type: 'flat',
            options: { charge_processing_fee: false, charge_remainder_fee: false, liable: true }
          });
          totalDistributedShares += coproAmount;
          console.log(`✅ [Pagarme Split] Coprodutor ${recipientId} recebe ${coproAmount} (${percentage}%)`);
        }
      } else {
        console.log(`❌ [Pagarme Split] Coprodutor ignorado. ID ou percentual inválido:`, JSON.stringify(copro));
      }
    });
  }

  // 7. Conta Master (Recebe o Bruto - Total Distribuído e Arca com as Taxas)
  const masterAmount = grossAmount - totalDistributedShares;
  const masterRecipientId = process.env.PAGARME_MASTER_RECIPIENT_ID;

  if (masterRecipientId) {
    splitArray.push({
      amount: masterAmount,
      recipient_id: masterRecipientId,
      type: 'flat',
      options: { charge_processing_fee: true, charge_remainder_fee: true, liable: true }
    });
    console.log(`✅ [Pagarme Split] Master ${masterRecipientId} recebe ${masterAmount} (líquido real abaterá as taxas)`);
  } else {
    console.error("❌ [ERRO CRÍTICO] PAGARME_MASTER_RECIPIENT_ID não configurado!");
  }

  console.log("🚨 [Pagarme Cascade] Distribuição Final do Split:", JSON.stringify(splitArray));

  // 3. Build Payload (Update: using the new splitArray)
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
        split: splitArray.length > 0 ? splitArray : undefined,
        splits: splitArray.length > 0 ? splitArray : undefined
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
