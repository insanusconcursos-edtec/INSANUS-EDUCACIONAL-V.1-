import type { VercelRequest, VercelResponse } from '@vercel/node';
import { provisionTictoPurchase, revokeTictoPurchase } from '../../src/backend/services/provisioningService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Webhooks da Ticto vêm via POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    const incomingStatus = payload?.status;
    const incomingProductId = payload?.item?.product_id;
    const incomingToken = payload?.token;

    // Verificação de Teste da Ticto (Geralmente enviado ao configurar o webhook)
    if (incomingStatus === 'waiting_payment' || incomingProductId === 1 || incomingProductId === '1') {
      console.log("Webhook Ticto: Teste de conexão recebido e aprovado.");
      return res.status(200).json({ received: true, message: "Teste Ticto Aprovado" });
    }

    // Verificação de Token de Segurança
    const tictoToken = "Zbi2TLCWBPbYJU1Xz14JF7gt8LGm8LQ0tNfMzGcu0US35mR56ye4PFU44We9c5eHcYU6wDzNxNOkx13UDWsVd7FHzI1brmjRrt0i";
    if (incomingToken !== tictoToken) {
      console.warn("⚠️ Webhook Ticto: Token inválido recebido.");
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, customer, item } = payload;
    
    // Log para auditoria na Vercel
    console.log(`✅ Webhook Ticto Recebido - Pedido: ${payload?.order?.hash} | Status: ${status} | Email: ${customer?.email}`);

    // Processamento de Ações de Provisionamento ou Revogação
    if (status === 'approved' || status === 'paid' || status === 'authorized') {
      await provisionTictoPurchase(customer, String(item.product_id));
      console.log(`🚀 Acesso liberado para ${customer?.email} (Produto: ${item?.product_id})`);
    } else if (['refunded', 'chargeback', 'canceled', 'overdue'].includes(status)) {
      await revokeTictoPurchase(customer?.email, String(item.product_id));
      console.log(`🚫 Acesso revogado para ${customer?.email} (Produto: ${item?.product_id})`);
    } else {
      console.log(`ℹ️ Status '${status}' ignorado. Nenhuma ação necessária.`);
    }

    // Resposta rápida de sucesso para a Ticto (Obrigatório)
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("🔴 Erro ao processar Webhook da Ticto:", error);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
}
