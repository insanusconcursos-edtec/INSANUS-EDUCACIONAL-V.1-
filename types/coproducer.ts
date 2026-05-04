export interface Coproducer {
  id: string;
  name: string;
  email: string;
  document: string; // CPF or CNPJ
  mpCollectorId: string; // Mercado Pago Account ID
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
