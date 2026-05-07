import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getProductByOfferId } from '../../services/productService';
import { TictoProduct, ProductOffer } from '../../types/product';
import { SystemLogo } from '../../components/common/SystemLogo';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { createPagarmePayment } from '../../services/paymentService';
import { Loader2, ShieldCheck, CreditCard, QrCode, Lock } from 'lucide-react';

export default function StandaloneCheckout() {
  const { offerId } = useParams<{ offerId: string }>();
  const [searchParams] = useSearchParams();
  const refId = searchParams.get('ref');
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<TictoProduct | null>(null);
  const [offer, setOffer] = useState<ProductOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'pix' | 'ticket'>('credit_card');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Credit Card States
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardMonth, setCardMonth] = useState('');
  const [cardYear, setCardYear] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  
  // Buyer Data Steps
  const [currentStep, setCurrentStep] = useState(1);
  const [buyerData, setBuyerData] = useState({
    name: '',
    email: currentUser?.email || '',
    emailConfirm: currentUser?.email || '',
    cpf: currentUser?.cpf || '',
    phone: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentUser?.email) {
      setBuyerData(prev => ({
        ...prev,
        email: currentUser.email || '',
        emailConfirm: currentUser.email || '',
        cpf: currentUser.cpf || '',
        name: currentUser.displayName || ''
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

  const handlePayment = async () => {
    if (!product || !offer) return;

    if (paymentMethod === 'credit_card') {
      if (!cardNumber || !cardHolder || !cardMonth || !cardYear || !cardCVV) {
        toast.error('Por favor, preencha todos os campos do cartão.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      const paymentData = {
        transaction_amount: Number(offer.price),
        description: `Compra de ${product.name} - ${offer.name}`,
        payment_method: paymentMethod,
        affiliateId: refId || null,
        // Card data if credit_card
        ...(paymentMethod === 'credit_card' && {
          card_number: cardNumber.replace(/\s/g, ''),
          card_holder_name: cardHolder,
          card_expiration_month: cardMonth,
          card_expiration_year: cardYear.length === 2 ? `20${cardYear}` : cardYear,
          card_cvv: cardCVV,
          installments: 1,
        }),
        payer: {
          email: buyerData.email,
          document: buyerData.cpf.replace(/\D/g, ''),
          name: buyerData.name
        },
        metadata: {
          courseId: product.id!,
          offerId: offer.id,
          userName: buyerData.name,
          userEmail: buyerData.email,
          userPhone: buyerData.phone,
          userCpf: buyerData.cpf.replace(/\D/g, ''),
          isStandalone: "true",
          refId: refId || ''
        },
      };

      await createPagarmePayment(paymentData);
      
      toast.success("Solicitação recebida! Integração Pagar.me em andamento.");
      setTimeout(() => {
        window.location.href = '/app/home';
      }, 2000);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

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
          
          {/* LADO ESQUERDO: Formulário Multi-etapas */}
          <div className="bg-[#121212] border border-zinc-800 rounded-3xl p-6 md:p-10 shadow-2xl order-2 lg:order-1">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-8">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all ${currentStep === 1 ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                    {currentStep === 1 ? '01' : <ShieldCheck size={16} />}
                  </div>
                  <div className="h-px w-4 bg-zinc-800" />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all ${currentStep === 2 ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                    02
                  </div>
                </div>
                <div className="text-right">
                   <h3 className="text-lg font-black uppercase tracking-tight leading-none mb-1 text-white">
                     {currentStep === 1 ? 'Dados Pessoais' : 'Pagamento'}
                   </h3>
                   <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Passo {currentStep} de 2</p>
                </div>
            </div>

            {currentStep === 1 ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5 pt-6">
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
              </div>
            ) : (
              <div className="space-y-6 pt-6">
                <button 
                  onClick={() => setCurrentStep(1)}
                  className="mb-2 text-[11px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 hover:underline underline-offset-4 decoration-2"
                >
                  ← Alterar dados pessoais
                </button>

                {/* Method Selector */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setPaymentMethod('credit_card')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${paymentMethod === 'credit_card' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                  >
                    <CreditCard size={20} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Cartão</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('pix')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${paymentMethod === 'pix' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                  >
                    <QrCode size={20} />
                    <span className="text-[9px] font-black uppercase tracking-widest">PIX</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('ticket')}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${paymentMethod === 'ticket' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                  >
                    <ShieldCheck size={20} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Boleto</span>
                  </button>
                </div>

                {paymentMethod === 'credit_card' ? (
                  <div className="space-y-4 pt-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Número do Cartão</label>
                      <div className="relative">
                        <input 
                          type="text"
                          value={cardNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19);
                            setCardNumber(val);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700"
                          placeholder="0000 0000 0000 0000"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-700">
                          <CreditCard size={18} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Nome do Titular</label>
                      <input 
                        type="text"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all placeholder:text-zinc-700 uppercase"
                        placeholder="NOME COMO NO CARTÃO"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Mês (MM)</label>
                        <input 
                          type="text"
                          value={cardMonth}
                          onChange={(e) => setCardMonth(e.target.value.replace(/\D/g, '').substring(0, 2))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all text-center"
                          placeholder="MM"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">Ano (AA)</label>
                        <input 
                          type="text"
                          value={cardYear}
                          onChange={(e) => setCardYear(e.target.value.replace(/\D/g, '').substring(0, 4))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all text-center"
                          placeholder="AA"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest ml-1">CVV</label>
                        <div className="relative">
                          <input 
                            type="text"
                            value={cardCVV}
                            onChange={(e) => setCardCVV(e.target.value.replace(/\D/g, '').substring(0, 4))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-white font-semibold focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all text-center"
                            placeholder="000"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-700">
                            <Lock size={16} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handlePayment}
                      disabled={isProcessing}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-2 group uppercase tracking-widest text-sm shadow-lg shadow-red-600/20 active:scale-[0.98] mt-4"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={18} />
                          <span>Pagar {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price)}</span>
                        </>
                      )}
                    </button>
                    <p className="text-[9px] text-zinc-500 text-center uppercase font-bold tracking-widest mt-2">
                       Pagamento processado com segurança via Pagar.me
                    </p>
                  </div>
                ) : (
                  <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl text-center space-y-4 mt-4">
                    <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center text-red-500 mx-auto">
                      <ShieldCheck size={32} />
                    </div>
                    <div>
                      <h4 className="text-white font-black uppercase tracking-tighter">
                        {paymentMethod === 'pix' ? 'Pagamento via PIX' : 'Pagamento via Boleto'}
                      </h4>
                      <p className="text-zinc-500 text-xs mt-2">
                        {paymentMethod === 'pix' 
                          ? 'Gere o código copia e cola para pagar agora.' 
                          : 'O boleto será enviado para o seu e-mail após a geração.'}
                      </p>
                    </div>
                    <button 
                      onClick={handlePayment}
                      disabled={isProcessing}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-sm disabled:opacity-50"
                    >
                      {isProcessing ? 'Processando...' : `Gerar ${paymentMethod === 'pix' ? 'PIX' : 'Boleto'}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LADO DIREITO: Resumo do Pedido */}
          <aside className="space-y-6 order-1 lg:order-2">
             <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl sticky top-8">
                <div className="aspect-video relative group overflow-hidden">
                   <img src={product.coverUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                   <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
                   <div className="absolute bottom-4 left-4 right-4">
                      <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest mb-2 inline-block shadow-lg shadow-red-600/20">Produto Selecionado</span>
                      <h2 className="text-lg font-black text-white leading-tight uppercase tracking-tighter">{product.name}</h2>
                   </div>
                </div>

                <div className="p-6 space-y-6">
                   <div className="space-y-3">
                      <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                         <span>Oferta Selecionada</span>
                         <span className="text-white">{offer.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                         <span>Valor Original</span>
                         <span className="line-through decoration-red-600 decoration-2">
                           {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price * 1.5)}
                         </span>
                      </div>
                      <div className="h-px bg-zinc-800/50" />
                      <div className="flex justify-between items-end">
                        <div className="space-y-1">
                           <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Total com Desconto</p>
                           <p className="text-3xl font-black text-white tracking-tighter">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price)}
                           </p>
                        </div>
                      </div>
                   </div>

                   <div className="pt-6 border-t border-zinc-800 space-y-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center text-zinc-500">
                           <ShieldCheck size={16} />
                         </div>
                         <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">Compra 100% Protegida</p>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center text-zinc-500">
                           <CreditCard size={16} />
                         </div>
                         <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">Liberação Imediata</p>
                      </div>
                   </div>
                </div>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
