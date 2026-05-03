import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createMPPayment } from '../../../src/backend/services/mercadoPagoService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await createMPPayment(req.body);
    return res.status(200).json({ success: true, payment: response });
  } catch (error) {
    console.error("Erro ao criar pagamento Mercado Pago (Serverless):", error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Erro ao processar pagamento." 
    });
  }
}
