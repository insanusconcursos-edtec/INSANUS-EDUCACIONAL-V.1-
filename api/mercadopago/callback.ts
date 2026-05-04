import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminConfig } from '../../src/backend/services/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;

  if (error) {
    console.error('MP OAuth Error:', error);
    return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:3000'}/admin/coproducers?error=${error}`);
  }

  if (!code || !state) {
    return res.status(400).send('Código de autorização ou estado ausente.');
  }

  try {
    const coproducerId = state as string;
    const clientId = process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET;
    const redirectUri = process.env.MP_REDIRECT_URI || `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/mercadopago/callback`;

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` // Opcional mas recomendado usar o token da plataforma
      },
      body: new URLSearchParams({
        'client_id': clientId || '',
        'client_secret': clientSecret || '',
        'grant_type': 'authorization_code',
        'code': code as string,
        'redirect_uri': redirectUri,
        'test_token': 'true' // Remover em produção se necessário
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MP token exchange error:', data);
      throw new Error(data.message || 'Erro ao trocar código por token');
    }

    // Salvar no Firestore
    const { dbAdmin } = getAdminConfig();
    await dbAdmin.collection('coproducers').doc(coproducerId).update({
      mp_access_token: data.access_token,
      mp_public_key: data.public_key,
      mp_refresh_token: data.refresh_token,
      mp_user_id: data.user_id,
      mp_connected_at: new Date().toISOString(),
      mpCollectorId: String(data.user_id) // Atualizamos também o campo usado no split
    });

    // Redirecionar de volta para o painel
    return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:3000'}/admin/coproducers?connected=true`);
  } catch (error: any) {
    console.error('Callback error:', error);
    return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:3000'}/admin/coproducers?error=callback_failed`);
  }
}
