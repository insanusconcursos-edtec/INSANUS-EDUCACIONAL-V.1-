
import React, { useEffect, useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { X, Loader2, ShieldCheck, CreditCard, Landmark } from 'lucide-react';
import { createMercadoPagoPayment } from '../../../services/paymentService';
import { TictoProduct } from '../../../types/product';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Initialize MP with public key
// Using generic PUBLIC_KEY name as per prompt summary
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || import.meta.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
if (MP_PUBLIC_KEY) {
  initMercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
}

interface CheckoutModalProps {
  product: TictoProduct;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CheckoutModal({ product, onClose, onSuccess }: CheckoutModalProps) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!MP_PUBLIC_KEY) {
      console.error("Mercado Pago Public Key is missing!");
      toast.error("Configuração do Mercado Pago ausente.");
    }
  }, []);

  const initialization = {
    amount: product.price,
    preferenceId: undefined, // Baseado em payment brick (API externa)
    payer: {
      email: currentUser?.email || '',
    },
  };

  const customization = {
    paymentMethods: {
      ticket: ['all'],
      bankTransfer: ['all'],
      creditCard: ['all'],
      debitCard: ['all'],
      mercadoPago: ['all'],
    },
    visual: {
      style: {
        theme: 'dark' as any,
      },
    },
  };

  const onSubmit = async ({ selectedPaymentMethod, formData }: any) => {
    setLoading(true);
    try {
      const paymentData = {
        transaction_amount: formData.transaction_amount,
        token: formData.token,
        description: `Compra de ${product.name}`,
        installments: formData.installments,
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        payer: {
          email: formData.payer.email,
          identification: formData.payer.identification,
        },
        metadata: {
          courseId: product.id!,
          userName: currentUser?.displayName || 'Aluno',
          // userPhone can be added if available in user profile
        },
      };

      await createMercadoPagoPayment(paymentData);
      
      toast.success('Pagamento processado com sucesso! Seu acesso está sendo liberado.');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Erro ao processar o pagamento. Tente outro método.');
    } finally {
      setLoading(false);
    }
  };

  const onError = (error: any) => {
    console.error('Mercado Pago Brick error:', error);
    toast.error('Erro ao carregar o checkout do Mercado Pago.');
  };

  const onReady = () => {
    console.log('Mercado Pago Brick is ready');
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
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Mercado Pago & Planner Insanus</p>
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
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                   </p>
                </div>
             </div>

             <div className="md:col-span-2">
                {!MP_PUBLIC_KEY ? (
                   <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                      <Loader2 className="animate-spin text-zinc-500 mx-auto mb-4" size={32} />
                      <p className="text-sm text-zinc-500 font-bold uppercase tracking-widest">Carregando gateway de pagamento...</p>
                   </div>
                ) : (
                  <div className="min-h-[400px]">
                    <Payment
                      initialization={initialization}
                      customization={customization}
                      onSubmit={onSubmit}
                      onError={onError}
                      onReady={onReady}
                    />
                  </div>
                )}
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
             <div className="flex items-center gap-2 grayscale opacity-50">
                <img src="https://logodownload.org/wp-content/uploads/2019/06/mercado-pago-logo.png" className="h-4" alt="Mercado Pago" />
             </div>
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
             <div className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
             <p className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Processando seu pagamento...</p>
          </div>
        )}
      </div>
    </div>
  );
}
