
import React, { useState } from 'react';
import { X, ShieldCheck, CreditCard, Lock } from 'lucide-react';
import { createPagarmePayment } from '../../../services/paymentService';
import { TictoProduct } from '../../../types/product';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface CheckoutModalProps {
  product: TictoProduct;
  offerId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CheckoutModal({ product, offerId, onClose, onSuccess }: CheckoutModalProps) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [cardData, setCardData] = useState({
    number: '',
    holderName: '',
    expiry: '',
    cvv: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Masking logic
    let maskedValue = value;
    if (name === 'number') {
      maskedValue = value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19);
    } else if (name === 'expiry') {
      maskedValue = value.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1/').substring(0, 5);
    } else if (name === 'cvv') {
      maskedValue = value.replace(/\D/g, '').substring(0, 4);
    } else if (name === 'holderName') {
      maskedValue = value.toUpperCase();
    }

    setCardData(prev => ({ ...prev, [name]: maskedValue }));
  };

  const currentOffer = offerId 
    ? product.offers?.find(o => o.id === offerId) 
    : product.offers?.find(o => o.isDefault);

  const price = currentOffer?.price || product.price || 0;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardData.number || !cardData.holderName || !cardData.expiry || !cardData.cvv) {
      toast.error('Por favor, preencha todos os campos do cartão.');
      return;
    }

    const [exp_month, exp_year] = cardData.expiry.split('/');
    if (!exp_month || !exp_year || exp_month.length !== 2 || exp_year.length !== 2) {
      toast.error('Validade inválida. Use o formato MM/AA.');
      return;
    }

    setLoading(true);
    try {
      const paymentData = {
        transaction_amount: price,
        description: `Compra de ${product.name}${currentOffer ? ` - ${currentOffer.name}` : ''}`,
        payment_method: 'credit_card',
        card_number: cardData.number.replace(/\s/g, ''),
        card_holder_name: cardData.holderName,
        card_expiration_month: exp_month,
        card_expiration_year: `20${exp_year}`,
        card_cvv: cardData.cvv,
        installments: 1,
        payer: {
          name: currentUser?.displayName || cardData.holderName,
          email: currentUser?.email || 'aluno@exemplo.com',
          document: currentUser?.cpf || '00000000000',
        },
        metadata: {
          courseId: product.id!,
          offerId: currentOffer?.id || 'default',
          userName: currentUser?.displayName || cardData.holderName,
          userPhone: (currentUser as any)?.phone || '11999999999',
        },
      };

      await createPagarmePayment(paymentData);
      
      toast.success('Pedido processado com sucesso!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Erro ao processar o pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-red-600/10 rounded-lg text-red-500">
                <CreditCard size={20} />
             </div>
             <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Checkout Seguro</h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Pagamento via Pagar.me</p>
             </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
             <div className="md:col-span-1">
                <div className="aspect-[474/1000] rounded-xl border border-zinc-800 overflow-hidden relative group">
                   <img src={product.coverUrl} alt={product.name} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-80" />
                   <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Você está adquirindo:</p>
                      <h4 className="text-sm font-bold text-white leading-tight">{product.name}</h4>
                   </div>
                </div>
                <div className="mt-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                   <p className="text-[10px] font-black text-zinc-500 uppercase mb-1">Total a pagar:</p>
                   <p className="text-2xl font-black text-white tracking-tighter">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                   </p>
                </div>
             </div>

             <div className="md:col-span-2">
                <form onSubmit={handlePayment} className="space-y-4">
                   <div>
                      <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Número do Cartão</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="number"
                          value={cardData.number}
                          onChange={handleInputChange}
                          placeholder="0000 0000 0000 0000"
                          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors"
                          required
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
                          <CreditCard size={18} />
                        </div>
                      </div>
                   </div>

                   <div>
                      <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Nome do Titular</label>
                      <input
                        type="text"
                        name="holderName"
                        value={cardData.holderName}
                        onChange={handleInputChange}
                        placeholder="NOME COMO NO CARTÃO"
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors uppercase"
                        required
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Validade (MM/AA)</label>
                        <input
                          type="text"
                          name="expiry"
                          value={cardData.expiry}
                          onChange={handleInputChange}
                          placeholder="MM/AA"
                          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors text-center"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">CVV</label>
                        <div className="relative">
                          <input
                            type="text"
                            name="cvv"
                            value={cardData.cvv}
                            onChange={handleInputChange}
                            placeholder="123"
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors text-center"
                            required
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
                            <Lock size={14} />
                          </div>
                        </div>
                      </div>
                   </div>

                   <button
                     type="submit"
                     disabled={loading}
                     className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                   >
                     {loading ? (
                       <>
                         <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                         Processando...
                       </>
                     ) : (
                       <>
                         <ShieldCheck size={18} />
                         Finalizar Pagamento
                       </>
                     )}
                   </button>
                   
                   <p className="text-[9px] text-zinc-600 text-center uppercase font-bold tracking-widest">
                     Pagamento processado de forma segura via Pagar.me
                   </p>
                </form>
             </div>
          </div>

          {/* Footer Info */}
          <div className="p-4 bg-zinc-900/30 border border-dotted border-zinc-800 rounded-xl flex items-center justify-between gap-4">
             <div className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-green-500" />
                <div>
                   <p className="text-[10px] font-bold text-white uppercase leading-none">Ambiente 100% Seguro</p>
                   <p className="text-[9px] text-zinc-500 uppercase mt-1">Seus dados estão protegidos por criptografia de ponta a ponta.</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
