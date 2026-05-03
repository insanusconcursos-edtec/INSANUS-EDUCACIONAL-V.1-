
export interface MPPaymentData {
  transaction_amount: number;
  token: string;
  description: string;
  installments: number;
  payment_method_id: string;
  issuer_id: string;
  payer: {
    email: string;
    identification: {
      type: string;
      number: string;
    };
  };
  metadata: {
    courseId: string;
    userName: string;
    userPhone?: string;
  };
}

export const createMercadoPagoPayment = async (data: MPPaymentData) => {
  const response = await fetch('/api/payments/mercadopago/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao processar pagamento');
  }

  return await response.json();
};
