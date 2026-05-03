import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import { getProductByOfferId } from '../../services/productService';
import { TictoProduct, ProductOffer } from '../../types/product';
import { SystemLogo } from '../../components/common/SystemLogo';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { createMercadoPagoPayment } from '../../services/paymentService';
import { Loader2, ShieldCheck, CreditCard, QrCode } from 'lucide-react';

const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY : undefined);

export default function StandaloneCheckout() {
  const { offerId } = useParams<{ offerId: string }>();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<TictoProduct | null>(null);
  const [offer, setOffer] = useState<ProductOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMpReady, setIsMpReady] = useState(false);

  useEffect(() => {
    if (MP_PUBLIC_KEY) {
      try {
        initMercadoPago(MP_PUBLIC_KEY);
        setIsMpReady(true);
      } catch (err) {
        console.error('Failed to initialize Mercado Pago:', err);
      }
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      if (!offerId) return;
      try {
        const result = await getProductByOfferId(offerId);
        if (result && result.offer.isActive) {
          setProduct(result.product);
          setOffer(result.offer);
        } else {
          setError('Esta oferta não está mais disponível ou é inválida.');
        }
      } catch (err) {
        console.error(err);
        setError('Ocorreu um erro ao carregar os detalhes da oferta.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [offerId]);

  const initialization = React.useMemo(() => {
    if (!offer) return { amount: 0, payer: { email: '' } };
    return {
      amount: Number(offer.price),
      payer: {
        email: currentUser?.email || '',
      },
    };
  }, [offer, currentUser?.email]);

  const customization = React.useMemo(() => ({
    paymentMethods: {
      ticket: 'all' as const,
      bankTransfer: ['pix'] as const,
      creditCard: 'all' as const,
      debitCard: 'all' as const,
    },
    visual: {
        style: {
            theme: 'dark' as const
        }
    }
  }), []);

  const onSubmit = React.useCallback(async (formData: any) => {
    if (!product || !offer) return;
    try {
      const paymentData = {
        transaction_amount: formData.transaction_amount,
        token: formData.token,
        description: `Compra de ${product.name} - ${offer.name}`,
        installments: formData.installments,
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        payer: {
          email: formData.payer.email,
          identification: formData.payer.identification,
        },
        metadata: {
          courseId: product.id!,
          offerId: offer.id,
          userName: currentUser?.displayName || 'Aluno',
          isStandalone: "true"
        },
      };

      const result = await createMercadoPagoPayment(paymentData);
      
      if (result.status === 'approved') {
        toast.success("Pagamento aprovado com sucesso!");
        // Redirecionar para home ou área do aluno
        setTimeout(() => {
          window.location.href = '/app/home';
        }, 2000);
      } else {
        toast.error(`Pagamento ${result.status_detail}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar o pagamento. Tente novamente.");
    }
  }, [product, offer, currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-red-600 animate-spin mb-4" />
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Carregando seu checkout...</p>
      </div>
    );
  }

  if (error || !product || !offer) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="mb-6 flex justify-center">
             <SystemLogo />
          </div>
          <h2 className="text-xl font-black text-white uppercase mb-2">Ops!</h2>
          <p className="text-zinc-400 mb-6">{error || 'Não foi possível encontrar esta oferta.'}</p>
          <a 
            href="/" 
            className="inline-block bg-red-600 hover:bg-red-700 text-white font-black px-8 py-3 rounded-xl transition-all uppercase text-sm tracking-widest"
          >
            Voltar para o Início
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-red-600/30">
      {/* Header Slim */}
      <header className="py-8 flex justify-center">
        <SystemLogo />
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-20 mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          
          {/* Coluna Esquerda: Resumo do Produto */}
          <div className="space-y-8 sticky top-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-red-600/10 text-red-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-600/20">
                Você está adquirindo
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none">
                {product.name}
              </h1>
              <p className="text-zinc-400 text-lg leading-relaxed max-w-lg">
                Tenha acesso imediato ao conteúdo completo, materiais exclusivos e suporte especializado.
              </p>
            </div>

            {/* Price Highlight */}
            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShieldCheck size={80} className="text-white" />
              </div>
              
              <div>
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{offer.name}</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold text-zinc-400">R$</span>
                  <span className="text-5xl font-black text-white tracking-tighter">
                    {Number(offer.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-400">
                  <ShieldCheck size={18} className="text-green-500" />
                  <span className="text-[11px] font-bold uppercase tracking-tight">Compra 100% Segura</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <CreditCard size={18} className="text-brand-red" />
                  <span className="text-[11px] font-bold uppercase tracking-tight">Acesso Imediato</span>
                </div>
              </div>
            </div>

            {/* Testimonials or Trust Bars could go here */}
            <div className="flex items-center gap-4 p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
               <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800" />
                  ))}
               </div>
               <p className="text-xs text-zinc-500 font-medium">
                  Mais de <span className="text-white font-bold">2.500 alunos</span> já transformaram seus estudos com a Insanus.
               </p>
            </div>
          </div>

          {/* Coluna Direita: Checkout Brick */}
          <div className="bg-white rounded-3xl p-4 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="mb-6 flex items-center justify-between text-zinc-900">
                <div>
                   <h3 className="text-xl font-black uppercase tracking-tight">Dados de Pagamento</h3>
                   <p className="text-sm text-zinc-500 font-medium tracking-tight">Escolha como prefere pagar agora.</p>
                </div>
                <div className="flex gap-2">
                   <QrCode className="text-emerald-500" size={24} />
                   <CreditCard className="text-zinc-400" size={24} />
                </div>
            </div>

            <div className="payment-brick-container">
              {MP_PUBLIC_KEY && offer && isMpReady ? (
                <Payment
                  initialization={initialization}
                  customization={customization}
                  onSubmit={onSubmit}
                  onReady={() => console.log('Payment Brick logic ready')}
                  onError={(error) => {
                    console.error('Mercado Pago SDK Error Details:', JSON.stringify(error, null, 2));
                    toast.error("Erro no carregamento do checkout. Verifique os dados.");
                  }}
                />
              ) : !MP_PUBLIC_KEY ? (
                <div className="p-12 text-center bg-zinc-50 rounded-3xl border border-zinc-100 flex flex-col items-center gap-4">
                   <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center animate-pulse">
                      <ShieldCheck size={32} />
                   </div>
                   <div className="space-y-2">
                      <h4 className="text-zinc-900 font-black uppercase tracking-tight text-lg">Checkout em Manutenção</h4>
                      <p className="text-zinc-500 text-sm max-w-xs mx-auto leading-relaxed">
                         Estamos realizando ajustes técnicos em nossos gateways de pagamento para sua maior segurança. 
                         <span className="block mt-2 font-bold text-zinc-800">Tente atualizar a página em alguns instantes.</span>
                      </p>
                   </div>
                </div>
              ) : !isMpReady || !offer ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Preparando Checkout...</p>
                </div>
              ) : (
                <div className="p-12 text-center bg-zinc-50 rounded-3xl border border-dotted border-zinc-200">
                  <p className="text-zinc-400 text-sm italic">Ocorreu um erro inesperado ao carregar o pagamento.</p>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center justify-center gap-6 grayscale opacity-50">
               <img src="https://logodownload.org/wp-content/uploads/2019/06/mercado-pago-logo-0.png" alt="Mercado Pago" className="h-6" />
               <div className="h-4 w-px bg-zinc-200" />
               <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold uppercase">
                  <ShieldCheck size={14} />
                  Checkout Seguro
               </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="py-12 border-t border-zinc-900 text-center">
         <p className="text-zinc-600 text-xs font-medium uppercase tracking-widest">
            © {new Date().getFullYear()} Insanus Concursos. Todos os direitos reservados.
         </p>
      </footer>

      <style>{`
        /* Ajustes finos para o Brick em fundo branco */
        .payment-brick-container .mp-payment-brick-container {
          background: transparent !important;
          padding: 0 !important;
        }
      `}</style>
    </div>
  );
}
