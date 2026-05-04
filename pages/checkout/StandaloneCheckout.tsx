import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import { getProductByOfferId } from '../../services/productService';
import { TictoProduct, ProductOffer } from '../../types/product';
import { SystemLogo } from '../../components/common/SystemLogo';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { createMercadoPagoPayment } from '../../services/paymentService';
import { Loader2, ShieldCheck, CreditCard, QrCode } from 'lucide-react';

const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY;

export default function StandaloneCheckout() {
  const { offerId } = useParams<{ offerId: string }>();
  const [searchParams] = useSearchParams();
  const refId = searchParams.get('ref');
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<TictoProduct | null>(null);
  const [offer, setOffer] = useState<ProductOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMpReady, setIsMpReady] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  
  // Buyer Data Steps
  const [currentStep, setCurrentStep] = useState(1);
  const [buyerData, setBuyerData] = useState({
    name: '',
    email: currentUser?.email || '',
    emailConfirm: currentUser?.email || '',
    cpf: '',
    phone: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
    if (currentUser?.email) {
      setBuyerData(prev => ({
        ...prev,
        email: currentUser.email || '',
        emailConfirm: currentUser.email || ''
      }));
    }
  }, [currentUser]);

  const validateStep1 = () => {
    const errors: Record<string, string> = {};
    if (!buyerData.name.trim()) errors.name = 'Nome completo é obrigatório';
    if (!buyerData.email.trim()) errors.email = 'E-mail é obrigatório';
    if (buyerData.email !== buyerData.emailConfirm) errors.emailConfirm = 'Os e-mails não coincidem';
    
    const cleanCpf = buyerData.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) errors.cpf = 'CPF inválido (11 dígitos)';
    
    const cleanPhone = buyerData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) errors.phone = 'WhatsApp inválido';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      toast.error("Por favor, preencha todos os campos corretamente.");
    }
  };

  const maskCpf = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

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
        email: buyerData.email || currentUser?.email || '',
      },
    };
  }, [offer, currentUser?.email, buyerData.email]);

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
      // Extração ultra-robusta do payment_method_id para garantir que nunca vá nulo
      const capturedPaymentMethodId = formData.payment_method_id || 
                                     formData.formData?.payment_method_id ||
                                     formData.paymentMethodId || 
                                     (formData.payment_type_id === 'bank_transfer' ? 'pix' : null) ||
                                     (formData.paymentType === 'bank_transfer' ? 'pix' : null) ||
                                     (formData.selectedPaymentMethod === 'bank_transfer' ? 'pix' : null);

      const paymentData = {
        ...formData, // Preserva campos gerados pelo Brick
        productId: product.id, // Passa o ID do produto para cálculo de split no backend
        payment_method_id: capturedPaymentMethodId, // GARANTE O VALOR EXTRAÍDO
        transaction_amount: Number(offer.price), // FORÇA O PREÇO NO PAYLOAD
        description: `Compra de ${product.name} - ${offer.name}`,
        affiliateId: refId || null, // Injeção direta para o backend processar split
        payer: {
          ...formData?.payer,
          email: buyerData.email, // Use validated email from our form
          identification: {
            type: 'CPF',
            number: buyerData.cpf.replace(/\D/g, '')
          }
        },
        metadata: {
          courseId: product.id!,
          offerId: offer.id,
          userName: buyerData.name,
          userEmail: buyerData.email,
          userPhone: buyerData.phone,
          userCpf: buyerData.cpf.replace(/\D/g, ''),
          isStandalone: "true",
          refId: refId || '' // Tracking do vendedor/afiliado
        },
      };

      const result = await createMercadoPagoPayment(paymentData);
      
      if (result.status === 'approved') {
        toast.success("Pagamento aprovado com sucesso!");
        setTimeout(() => {
          window.location.href = '/app/home';
        }, 2000);
      } else if (result.status === 'pending' && capturedPaymentMethodId === 'pix') {
        const qrCode = result.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = result.point_of_interaction?.transaction_data?.qr_code_base64;
        
        if (qrCode && qrCodeBase64) {
          setPixData({ qrCode, qrCodeBase64 });
          toast.success("PIX gerado! Pague agora para liberar o acesso.");
        } else {
          console.error("PIX details missing in response:", result);
          toast.error("PIX gerado, mas não conseguimos carregar o QR Code. Verifique o seu e-mail.");
        }
      } else {
        toast.error(`Status do Pagamento: ${result.status_detail || result.status || 'Em processamento'}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao processar o pagamento. Tente novamente.");
    }
  }, [product, offer, buyerData, currentUser]);

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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          
          {/* LADO ESQUERDO: Formulário Multi-etapas (Dark Mode) */}
          <div className="bg-[#121212] border border-zinc-800 rounded-3xl p-6 md:p-10 shadow-2xl order-2 lg:order-1">
            <div className="mb-10 flex items-center justify-between border-b border-zinc-800 pb-8">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all ${currentStep === 1 ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                    {currentStep === 1 ? '01' : <ShieldCheck size={20} />}
                  </div>
                  <div className="h-px w-8 bg-zinc-800" />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all ${currentStep === 2 ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                    02
                  </div>
                </div>
                <div className="text-right">
                   <h3 className="text-xl font-black uppercase tracking-tight leading-none mb-1 text-white">
                     {currentStep === 1 ? 'Dados Pessoais' : 'Pagamento'}
                   </h3>
                   <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Passo {currentStep} de 2</p>
                </div>
            </div>

            {currentStep === 1 ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Nome Completo</label>
                    <input 
                      type="text"
                      className={`w-full bg-zinc-950 border ${formErrors.name ? 'border-red-500' : 'border-zinc-800'} rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700`}
                      placeholder="Como no seu documento"
                      value={buyerData.name}
                      onChange={(e) => setBuyerData({...buyerData, name: e.target.value})}
                    />
                    {formErrors.name && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.name}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Seu melhor E-mail</label>
                      <input 
                        type="email"
                        className={`w-full bg-zinc-950 border ${formErrors.email ? 'border-red-500' : 'border-zinc-800'} rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700`}
                        placeholder="exemplo@email.com"
                        value={buyerData.email}
                        onChange={(e) => setBuyerData({...buyerData, email: e.target.value})}
                      />
                      {formErrors.email && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Confirme seu E-mail</label>
                      <input 
                        type="email"
                        className={`w-full bg-zinc-950 border ${formErrors.emailConfirm ? 'border-red-500' : 'border-zinc-800'} rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700`}
                        placeholder="Repita o e-mail"
                        value={buyerData.emailConfirm}
                        onChange={(e) => setBuyerData({...buyerData, emailConfirm: e.target.value})}
                      />
                      {formErrors.emailConfirm && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.emailConfirm}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">CPF</label>
                      <input 
                        type="text"
                        className={`w-full bg-zinc-950 border ${formErrors.cpf ? 'border-red-500' : 'border-zinc-800'} rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700`}
                        placeholder="000.000.000-00"
                        value={buyerData.cpf}
                        onChange={(e) => setBuyerData({...buyerData, cpf: maskCpf(e.target.value)})}
                      />
                      {formErrors.cpf && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.cpf}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">WhatsApp</label>
                      <input 
                        type="text"
                        className={`w-full bg-zinc-950 border ${formErrors.phone ? 'border-red-500' : 'border-zinc-800'} rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700`}
                        placeholder="(00) 00000-0000"
                        value={buyerData.phone}
                        onChange={(e) => setBuyerData({...buyerData, phone: maskPhone(e.target.value)})}
                      />
                      {formErrors.phone && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.phone}</p>}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleNextStep}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-2 group uppercase tracking-widest text-sm shadow-lg shadow-red-600/10 active:scale-[0.98]"
                >
                  Continuar para Pagamento
                </button>
                
                <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500 font-bold uppercase py-2">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  Seus dados estão protegidos e criptografados
                </div>
              </div>
            ) : pixData ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-emerald-500/20">
                    <QrCode size={14} /> PIX Gerado com Sucesso
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Escaneie o QR Code para pagar</h3>
                  <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                    Seu acesso será liberado instantaneamente após a confirmação do pagamento.
                  </p>
                </div>

                <div className="bg-zinc-950 p-6 rounded-3xl border-2 border-zinc-900 flex flex-col items-center gap-6">
                  <div className="bg-white p-4 rounded-2xl shadow-sm">
                     <img 
                       src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`} 
                       alt="QR Code PIX" 
                       className="w-48 h-48 md:w-56 md:h-56"
                     />
                  </div>

                  <div className="w-full space-y-3">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center block">Ou copie o código abaixo</label>
                    <div className="relative group">
                      <input 
                        readOnly 
                        value={pixData.qrCode}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 pr-24 text-zinc-400 text-xs font-mono overflow-hidden text-ellipsis focus:outline-none"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(pixData.qrCode);
                          toast.success("Código PIX copiado!");
                        }}
                        className="absolute right-2 top-2 bottom-2 bg-zinc-800 hover:bg-red-600 text-white text-[10px] font-black px-4 rounded-lg transition-all uppercase tracking-widest"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-red-600/10 p-4 rounded-2xl border border-red-600/20 flex items-start gap-3">
                  <div className="bg-red-600/10 p-2 rounded-full text-red-500">
                    <ShieldCheck size={16} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-red-500 text-[11px] font-black uppercase tracking-tight">Aviso Importante</p>
                    <p className="text-red-300/70 text-[10px] leading-snug">
                      Não feche esta página até concluir o pagamento. Após pagar, você será redirecionado automaticamente.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setPixData(null);
                    setCurrentStep(2);
                  }}
                  className="w-full text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all py-2"
                >
                  Tentar outro método de pagamento
                </button>
              </div>
            ) : (
              <div className="payment-brick-container">
                <button 
                  onClick={() => setCurrentStep(1)}
                  className="mb-6 text-[11px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 hover:underline underline-offset-4 decoration-2"
                >
                  ← Alterar dados pessoais
                </button>
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
                  <div className="p-8 text-center bg-red-600/10 rounded-3xl border border-red-600/20 flex flex-col items-center gap-4">
                     <div className="w-16 h-16 bg-red-600/10 text-red-500 rounded-full flex items-center justify-center">
                        <ShieldCheck size={32} />
                     </div>
                     <div className="space-y-2">
                        <h4 className="text-red-500 font-black uppercase tracking-tight text-lg">Erro de Integração</h4>
                        <p className="text-red-400 text-sm leading-relaxed">
                           A chave pública do Mercado Pago (VITE_MP_PUBLIC_KEY) não foi detectada no ambiente. 
                           <span className="block mt-2 font-bold">Verifique o painel Secrets.</span>
                        </p>
                     </div>
                  </div>
                ) : !isMpReady || !offer ? (
                  <div className="p-12 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Preparando Checkout...</p>
                  </div>
                ) : (
                  <div className="p-12 text-center bg-zinc-950 rounded-3xl border border-dashed border-zinc-800">
                    <p className="text-zinc-500 text-sm italic">Ocorreu um erro inesperado ao carregar o pagamento.</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-10 pt-8 border-t border-zinc-800 flex items-center justify-center gap-6 opacity-30 grayscale hover:opacity-100 transition-opacity">
               <img src="https://logodownload.org/wp-content/uploads/2019/06/mercado-pago-logo-0.png" alt="Mercado Pago" className="h-4 brightness-0 invert" />
               <div className="h-3 w-px bg-zinc-800" />
               <div className="flex items-center gap-1 text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                  <ShieldCheck size={12} />
                  Checkout Seguro
               </div>
            </div>
          </div>

          {/* LADO DIREITO: Resumo do Pedido (Coluna Ordenada) */}
          <div className="space-y-6 lg:sticky lg:top-8 order-1 lg:order-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
              
              {/* Capa Vertical */}
              <div className="relative group overflow-hidden rounded-2xl border border-zinc-800 shadow-xl bg-zinc-950">
                <img 
                  src={product.coverUrl || 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop'} 
                  alt={product.name}
                  className="w-full max-w-[200px] aspect-[474/1000] object-cover mx-auto transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
              </div>

              <div className="space-y-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 bg-red-600/10 text-red-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-600/20 mb-2">
                  Resumo do Pedido
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight uppercase leading-none">
                  {product.name}
                </h2>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                  {offer.name}
                </p>
              </div>

              {/* Price Area */}
              <div className="pt-6 border-t border-zinc-800">
                {offer.originalPrice && offer.originalPrice > offer.price ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Preço original</span>
                      <span className="text-zinc-500 line-through text-sm font-bold">
                        R$ {Number(offer.originalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-500 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/10">
                        Desconto (-{Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100)}%)
                      </span>
                      <span className="text-emerald-500 text-sm font-bold">
                        - R$ {Number(offer.originalPrice - offer.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                      <span className="text-white text-lg font-black uppercase tracking-tighter">Total</span>
                      <div className="text-right">
                        <span className="text-3xl font-black text-white tracking-tighter shadow-sm">
                          R$ {Number(offer.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                          Acesso imediato após confirmação
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-white text-lg font-black uppercase tracking-tighter">Total</span>
                    <span className="text-3xl font-black text-white tracking-tighter">
                      R$ {Number(offer.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-1 gap-3 pt-6">
                <div className="flex items-center gap-3 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest block leading-none">Compra 100% Segura</span>
                    <span className="text-[9px] text-zinc-500 font-bold">Privacidade e segurança garantida</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                  <div className="w-8 h-8 rounded-full bg-red-600/10 flex items-center justify-center text-red-500">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-white uppercase tracking-widest block leading-none">Acesso Imediato</span>
                    <span className="text-[9px] text-zinc-500 font-bold">Receba agora os dados de acesso</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Alunos trust bar */}
            <div className="flex items-center gap-4 p-5 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
               <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800" />
                  ))}
               </div>
               <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-tight">
                  <span className="text-white">+2.500 alunos</span> ativos na plataforma
               </p>
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
        /* Ajustes finos para o Brick em fundo escuro */
        .payment-brick-container .mp-payment-brick-container {
          background: transparent !important;
          padding: 0 !important;
        }
        
        /* Forçando estilos do Brick para Dark Mode se necessário */
        .payment-brick-container {
          --mp-theme-color: #dc2626;
        }
      `}</style>
    </div>
  );
}
