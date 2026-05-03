import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMPWebhook } from '../../src/backend/services/mercadoPagoService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook Mercado Pago (Serverless) recebido:', req.body);
    const result = await handleMPWebhook(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Erro no webhook Mercado Pago (Serverless):", error);
    // Mercado Pago expects a 200/201 even on errors sometimes to stop retrying if it's an internal fail
    // but better to return 200 with error info.
    return res.status(200).json({ success: false, error: "Internal error handled" });
  }
}
