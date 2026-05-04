export interface Coproducer {
  id: string;
  name: string;
  email: string;
  document: string; // CPF or CNPJ
  mpCollectorId: string; // Mercado Pago Account ID
  mp_access_token?: string;
  mp_user_id?: string;
  mp_connected_at?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
