
import React, { useState } from 'react';
import { X, ShieldCheck, CreditCard } from 'lucide-react';
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

  const currentOffer = offerId 
    ? product.offers?.find(o => o.id === offerId) 
    : product.offers?.find(o => o.isDefault);

  const price = currentOffer?.price || product.price || 0;

  const handleSimulatedPayment = async () => {
    setLoading(true);
    try {
      const paymentData = {
        transaction_amount: price,
        description: `Compra de ${product.name}${currentOffer ? ` - ${currentOffer.name}` : ''}`,
        payment_method: 'credit_card',
        payer: {
          name: currentUser?.displayName || 'Aluno',
          email: currentUser?.email || 'aluno@exemplo.com',
          document: currentUser?.cpf || '00000000000',
        },
        metadata: {
          courseId: product.id!,
          offerId: currentOffer?.id || 'default',
          userName: currentUser?.displayName || 'Aluno',
        },
      };

      await createPagarmePayment(paymentData);
      
      toast.success('Solicitação de pagamento enviada! (Integração Pagar.me em andamento)');
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
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Migrando para Pagar.me</p>
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
                <div className="p-8 text-center bg-zinc-900/50 border border-zinc-800 rounded-2xl h-full flex flex-col items-center justify-center gap-6">
                   <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center text-red-500">
                      <CreditCard size={32} />
                   </div>
                   <div>
                      <h3 className="text-white font-black uppercase tracking-tight mb-2">Transição de Gateway</h3>
                      <p className="text-zinc-500 text-sm">
                        Estamos migrando nosso processador de pagamentos para a <b>Pagar.me</b> para oferecer uma melhor experiência.
                      </p>
                   </div>
                   <button
                     onClick={handleSimulatedPayment}
                     disabled={loading}
                     className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-sm disabled:opacity-50"
                   >
                     {loading ? 'Processando...' : 'Finalizar Pedido (Teste)'}
                   </button>
                </div>
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
