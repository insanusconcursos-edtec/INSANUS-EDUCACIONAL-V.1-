export const calculateNetCommissions = (price: number, commissionPercent: number) => {
  // Taxes for each payment method
  const pixTax = 0.0099; // 0.99%
  const cardTax = 0.0498; // 4.98%
  const boletoTax = 3.49; // Fixed R$ 3.49

  // Calculate net amount after gateway fees
  const pixNet = price - (price * pixTax);
  const cardNet = price - (price * cardTax);
  const boletoNet = price > boletoTax ? price - boletoTax : 0;

  // Calculate commission based on net amount
  const calc = (netAmount: number) => ((netAmount * commissionPercent) / 100).toFixed(2);

  return {
    pix: calc(pixNet),
    card: calc(cardNet),
    boleto: calc(boletoNet)
  };
};
