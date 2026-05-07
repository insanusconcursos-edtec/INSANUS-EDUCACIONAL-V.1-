
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, CreditCard, Lock, QrCode, Copy, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'pix'>('credit_card');
  const [pixData, setPixData] = useState<{ qr_code: string; qr_code_url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes in seconds
  const [installments, setInstallments] = useState(1);
  const [cardData, setCardData] = useState({
    number: '',
    holderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Masking logic
    let maskedValue = value;
    if (name === 'number') {
      maskedValue = value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19);
    } else if (name === 'expiryMonth' || name === 'expiryYear' || name === 'cvv') {
      maskedValue = value.replace(/\D/g, '');
      if (name === 'expiryMonth') maskedValue = maskedValue.substring(0, 2);
      if (name === 'expiryYear') maskedValue = maskedValue.substring(0, 4);
      if (name === 'cvv') maskedValue = maskedValue.substring(0, 4);
    } else if (name === 'holderName') {
      maskedValue = value.toUpperCase();
    }

    setCardData(prev => ({ ...prev, [name]: maskedValue }));
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (pixData && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [pixData, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentOffer = offerId 
    ? product.offers?.find(o => o.id === offerId) 
    : product.offers?.find(o => o.isDefault);

  const price = currentOffer?.price || product.price || 0;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardData.number || !cardData.holderName || !cardData.expiryMonth || !cardData.expiryYear || !cardData.cvv) {
      toast.error('Por favor, preencha todos os campos do cartão.');
      return;
    }

    setLoading(true);
    try {
      const paymentData = {
        transaction_amount: price,
        description: `Compra de ${product.name}${currentOffer ? ` - ${currentOffer.name}` : ''}`,
        payment_method: paymentMethod,
        ...(paymentMethod === 'credit_card' && {
          card_number: cardData.number.replace(/\s/g, ''),
          card_holder_name: cardData.holderName,
          card_expiration_month: cardData.expiryMonth,
          card_expiration_year: cardData.expiryYear.length === 2 ? `20${cardData.expiryYear}` : cardData.expiryYear,
          card_cvv: cardData.cvv,
          installments: installments,
        }),
        payer: {
          name: currentUser?.displayName || cardData.holderName || (currentUser as any)?.name || 'Estudante',
          email: currentUser?.email || 'aluno@exemplo.com',
          document: currentUser?.cpf || '00000000000',
        },
        metadata: {
          courseId: product.id!,
          offerId: currentOffer?.id || 'default',
          userName: currentUser?.displayName || cardData.holderName || (currentUser as any)?.name || 'Estudante',
          userPhone: (currentUser as any)?.phone || '11999999999',
          userCpf: currentUser?.cpf || '',
        },
      };

      const result = await createPagarmePayment(paymentData);
      
      if (result.success) {
        if (paymentMethod === 'pix' && result.pix) {
          setPixData(result.pix);
          toast.success('PIX gerado com sucesso!');
        } else {
          toast.success('Pedido processado com sucesso!');
          onSuccess();
          onClose();
        }
      } else {
        toast.error(result.message || 'Erro ao processar o pagamento.');
      }
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
                   {currentOffer?.originalPrice && currentOffer.originalPrice > 0 && (
                     <p className="text-[10px] text-zinc-500 line-through decoration-red-600 mb-1">
                        De {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentOffer.originalPrice)}
                     </p>
                   )}
                   <p className="text-2xl font-black text-white tracking-tighter">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                   </p>
                </div>
             </div>

             <div className="md:col-span-2">
                <AnimatePresence mode="wait">
                  {pixData ? (
                    <motion.div
                      key="pix-screen"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex flex-col items-center gap-6 p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                        <div className="bg-white p-2 rounded-xl">
                          <img src={pixData.qr_code_url} alt="QR Code PIX" className="w-40 h-40" />
                        </div>
                        
                        <div className="flex items-center justify-center gap-2 text-red-500 bg-red-500/10 py-2 px-4 rounded-full border border-red-500/20 w-fit">
                          <Loader2 size={12} className="animate-spin" />
                          <p className="text-[9px] font-black uppercase tracking-widest leading-none">
                            Expira em: <span className="text-xs ml-1">{formatTime(timeLeft)}</span>
                          </p>
                        </div>

                        <div className="w-full space-y-3">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Pix Copia e Cola</label>
                          <div className="relative">
                            <input 
                              type="text" 
                              readOnly 
                              value={pixData.qr_code}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-[10px] text-zinc-400 font-mono focus:outline-none"
                            />
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(pixData.qr_code);
                                setCopied(true);
                                toast.success("Código PIX copiado!");
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                            >
                              {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 w-5 h-5 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center shrink-0">
                            <CheckCircle2 size={12} />
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-200">Liberação Imediata:</strong> O curso será liberado em sua conta assim que o PIX for confirmado.
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          onSuccess();
                          onClose();
                        }}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-xs"
                      >
                        Já paguei, ver meus cursos
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="payment-form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-6"
                    >
                      {/* Method Selector */}
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('credit_card')}
                          className={`flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${paymentMethod === 'credit_card' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                        >
                          <CreditCard size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Cartão</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('pix')}
                          className={`flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${paymentMethod === 'pix' ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                        >
                          <QrCode size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest">PIX</span>
                        </button>
                      </div>

                      <form onSubmit={handlePayment} className="space-y-4">
                        {paymentMethod === 'credit_card' ? (
                          <div className="space-y-4">
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
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Mês (MM)</label>
                                  <input
                                    type="text"
                                    name="expiryMonth"
                                    value={cardData.expiryMonth}
                                    onChange={handleInputChange}
                                    placeholder="MM"
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors text-center"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Ano (AA)</label>
                                  <input
                                    type="text"
                                    name="expiryYear"
                                    value={cardData.expiryYear}
                                    onChange={handleInputChange}
                                    placeholder="AA"
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors text-center"
                                    required
                                  />
                                </div>
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

                            <div>
                              <label className="text-[10px] font-black text-zinc-500 uppercase mb-1 block tracking-widest">Parcelas</label>
                              <select 
                                value={installments}
                                onChange={(e) => setInstallments(Number(e.target.value))}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-600 transition-colors appearance-none cursor-pointer"
                              >
                                {[...Array(12)].map((_, i) => {
                                  const count = i + 1;
                                  const value = price / count;
                                  return (
                                    <option key={count} value={count}>
                                      {count}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="py-10 text-center space-y-4">
                            <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center text-red-500 mx-auto">
                              <QrCode size={32} />
                            </div>
                            <div>
                              <h4 className="text-white font-black uppercase tracking-tighter">Confirmar Pagamento PIX</h4>
                              <p className="text-zinc-500 text-xs mt-2">Um QR Code será gerado para pagamento imediato.</p>
                            </div>
                          </div>
                        )}

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
                              {paymentMethod === 'credit_card' ? <ShieldCheck size={18} /> : <QrCode size={18} />}
                              <span>{paymentMethod === 'credit_card' ? 'Finalizar Pagamento' : 'Gerar QR Code PIX'}</span>
                            </>
                          )}
                        </button>
                        
                        <p className="text-[9px] text-zinc-600 text-center uppercase font-bold tracking-widest">
                          Pagamento processado de forma segura via Pagar.me
                        </p>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
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
