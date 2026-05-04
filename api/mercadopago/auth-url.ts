import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { coproducerId } = req.query;

    if (!coproducerId) {
      return res.status(400).json({ success: false, error: 'coproducerId é obrigatório' });
    }

    const clientId = process.env.MP_CLIENT_ID;
    const redirectUri = process.env.MP_REDIRECT_URI || `${process.env.FRONTEND_URL || 'https://www.portal-insanus.com'}/api/mercadopago/callback`;
    
    if (!clientId) {
      return res.status(500).json({ success: false, error: 'MP_CLIENT_ID não configurado no servidor' });
    }

    // A URL de autorização requer o client_id e a redirect_uri
    // Adicionamos o coproducerId no state para saber quem estamos autorizando no callback
    const authUrl = `https://auth.mercadopago.com/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${coproducerId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.status(200).json({ success: true, url: authUrl });
  } catch (error: any) {
    console.error('Error generating MP auth URL:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
