import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Upload, ChevronDown, ChevronUp, Search, Video, Plus, Trash2, Copy, Check, Globe } from 'lucide-react';
import { TictoProduct, ProductType, ProductOffer } from '../../../types/product';
import { createProduct, updateProduct, uploadProductCover } from '../../../services/productService';
import { getPlans } from '../../../services/planService';
import { courseService } from '../../../services/courseService';
import { getSimulatedClasses } from '../../../services/simulatedService';
import { classService } from '../../../services/classService';
import { liveEventService } from '../../../services/liveEventService';

interface ProductFormModalProps {
  product: TictoProduct | null;
  onClose: () => void;
  onSave: () => void;
}

export default function ProductFormModal({ product, onClose, onSave }: ProductFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState(product?.name || '');
  const [offers, setOffers] = useState<ProductOffer[]>(product?.offers || []);
  const [tictoId, setTictoId] = useState(product?.tictoId || '');
  const [type, setType] = useState<ProductType>(product?.type || 'COMBO');
  const [accessDays, setAccessDays] = useState(product?.accessDays || 365);
  const [coverUrl, setCoverUrl] = useState(product?.coverUrl || '');
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerms, setSearchTerms] = useState({ plans: '', courses: '', classes: '', simulated: '', liveEvents: '' });
  const [expanded, setExpanded] = useState({ plans: false, courses: false, classes: false, simulated: false, liveEvents: false });

  // Linked Resources State
  const [linkedPlans, setLinkedPlans] = useState<string[]>(product?.linkedResources.plans || []);
  const [linkedCourses, setLinkedCourses] = useState<string[]>(product?.linkedResources.onlineCourses || []);
  const [linkedClasses, setLinkedClasses] = useState<string[]>(product?.linkedResources.presentialClasses || []);
  const [linkedSimulated, setLinkedSimulated] = useState<string[]>(product?.linkedResources.simulated || []);
  const [linkedLiveEvents, setLinkedLiveEvents] = useState<string[]>(product?.linkedResources.liveEvents || product?.liveEventIds || []);

  // Available Resources State
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [availableSimulated, setAvailableSimulated] = useState<any[]>([]);
  const [availableLiveEvents, setAvailableLiveEvents] = useState<any[]>([]);

  useEffect(() => {
    const loadResources = async () => {
      try {
        const [plans, courses, classes, simulated, liveEvents] = await Promise.all([
          getPlans(),
          courseService.getCourses(),
          classService.getClasses(),
          getSimulatedClasses(),
          liveEventService.getLiveEvents()
        ]);
        setAvailablePlans(plans);
        setAvailableCourses(courses);
        setAvailableClasses(classes);
        setAvailableSimulated(simulated);
        setAvailableLiveEvents(liveEvents);
      } catch (err) {
        console.error('Failed to load resources:', err);
        setError('Erro ao carregar recursos disponíveis.');
      }
    };
    loadResources();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !tictoId || !type || !accessDays) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (offers.length === 0) {
      setError('Adicione pelo menos uma oferta ao produto.');
      return;
    }

    if (!offers.some(o => o.isDefault)) {
      setError('Selecione uma oferta como padrão (Default).');
      return;
    }

    setLoading(true);
    setError(null);

    const productData = {
      name,
      offers,
      tictoId,
      type,
      accessDays,
      coverUrl,
      linkedResources: {
        plans: linkedPlans,
        onlineCourses: linkedCourses,
        presentialClasses: linkedClasses,
        simulated: linkedSimulated,
        liveEvents: linkedLiveEvents
      },
      liveEventIds: linkedLiveEvents
    };

    try {
      if (product?.id) {
        await updateProduct(product.id, productData);
      } else {
        await createProduct(productData);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save product:', err);
      setError('Erro ao salvar produto. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const addOffer = () => {
    const newOffer: ProductOffer = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      price: 0,
      isDefault: offers.length === 0,
      isActive: true
    };
    setOffers([...offers, newOffer]);
  };

  const removeOffer = (id: string) => {
    setOffers(offers.filter(o => o.id !== id));
  };

  const updateOffer = (id: string, updates: Partial<ProductOffer>) => {
    setOffers(offers.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const setDefaultOffer = (id: string) => {
    setOffers(offers.map(o => ({ ...o, isDefault: o.id === id })));
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyOfferLink = (offerId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/checkout/${offerId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(offerId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const productTypes: ProductType[] = ['COMBO', 'PLANO', 'TURMA_ONLINE', 'CURSO_ISOLADO', 'SIMULADO', 'EVENTO'];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">
            {product ? 'Editar Produto' : 'Novo Produto Ticto'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form id="product-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Nome Interno do Produto *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Combo Polícia Civil VIP"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  ID do Produto na Ticto (Webhook) *
                </label>
                <input
                  type="text"
                  value={tictoId}
                  onChange={(e) => setTictoId(e.target.value)}
                  placeholder="Ex: 12345"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-red-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Tipo de Produto *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ProductType)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-red-500"
                  required
                >
                  {productTypes.map(t => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Tempo de Acesso (Dias) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={accessDays}
                  onChange={(e) => setAccessDays(parseInt(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-red-500"
                  required
                />
              </div>
            </div>

            {/* Offers Management */}
            <div className="border-t border-zinc-800 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Ofertas e Precificação</h3>
                  <p className="text-sm text-zinc-500">Gerencie diferentes preços e links de checkout para este produto.</p>
                </div>
                <button
                  type="button"
                  onClick={addOffer}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                >
                  <Plus size={16} />
                  Nova Oferta
                </button>
              </div>

              <div className="space-y-3">
                {offers.map((offer) => (
                  <div 
                    key={offer.id} 
                    className={`p-4 bg-zinc-950 border rounded-xl transition-all ${
                      offer.isDefault ? 'border-red-600/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full">
                        <div>
                          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Nome da Oferta</label>
                          <input
                            type="text"
                            value={offer.name}
                            onChange={(e) => updateOffer(offer.id, { name: e.target.value })}
                            placeholder="Ex: Preço Cheio, Black Friday..."
                            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Preço (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={offer.price}
                            onChange={(e) => updateOffer(offer.id, { price: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateOffer(offer.id, { isActive: !offer.isActive })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${
                            offer.isActive 
                              ? 'bg-zinc-800 text-green-500 hover:bg-zinc-700' 
                              : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700'
                          }`}
                          title={offer.isActive ? 'Ativa' : 'Inativa'}
                        >
                          <Globe size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDefaultOffer(offer.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${
                            offer.isDefault 
                              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {offer.isDefault ? <Check size={14} /> : <div className="w-3.5 h-3.5 border-2 border-zinc-600 rounded-full" />}
                          {offer.isDefault ? 'Padrão' : 'Definir Padrão'}
                        </button>

                        {product?.id && (
                          <button
                            type="button"
                            onClick={() => copyOfferLink(offer.id)}
                            className={`p-2 rounded-lg transition ${
                              copiedId === offer.id ? 'bg-green-600/20 text-green-500' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                            }`}
                            title="Copiar Link da Oferta"
                          >
                            {copiedId === offer.id ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => removeOffer(offer.id)}
                          className="p-2 bg-zinc-800 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {offers.length === 0 && (
                  <div className="p-8 text-center bg-zinc-950 border border-dotted border-zinc-800 rounded-2xl">
                    <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">Nenhuma oferta cadastrada.</p>
                    <p className="text-zinc-600 text-[10px] mt-1 font-bold uppercase tracking-tight">Adicione uma oferta para definir o preço do produto.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recursos Vinculados</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Selecione os recursos que o aluno terá acesso ao adquirir este produto.
              </p>

              {/* Upload de Capa */}
              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-bold text-gray-400">Capa do Produto (474x1000)</label>
                <div className="flex items-center gap-4">
                  {coverUrl && <img src={coverUrl} alt="Capa" className="w-16 h-auto rounded border border-gray-700" />}
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold rounded-lg cursor-pointer transition border border-gray-700 w-fit">
                    {isUploading ? 'Enviando...' : <><Upload size={16} /> {coverUrl ? 'Trocar Capa' : 'Enviar Capa'}</>}
                    <input type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setIsUploading(true);
                        try {
                           const url = await uploadProductCover(file);
                           setCoverUrl(url);
                        } catch(err) { alert('Erro no upload'); }
                        setIsUploading(false);
                      }
                    }} />
                  </label>
                </div>
              </div>

              <div className="space-y-6 mt-6">
                {/* Plans */}
                <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden mb-3">
                  <button type="button" onClick={() => setExpanded(prev => ({ ...prev, plans: !prev.plans }))} className="w-full flex items-center justify-between p-3 bg-gray-900 hover:bg-gray-800 transition text-sm font-bold text-gray-300">
                    <span>Planos de Estudo ({linkedPlans.length})</span>
                    {expanded.plans ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expanded.plans && (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                          className="w-full bg-gray-950 border border-gray-800 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-red-500 outline-none appearance-none cursor-pointer"
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !linkedPlans.includes(id)) {
                              setLinkedPlans([...linkedPlans, id]);
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Adicionar plano...</option>
                          {availablePlans
                            .filter(p => !linkedPlans.includes(p.id))
                            .filter(p => (p.title || p.name || '').toLowerCase().includes(searchTerms.plans))
                            .map(plan => (
                              <option key={plan.id} value={plan.id}>
                                {plan.title || plan.name || 'Plano sem nome'}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {linkedPlans.map((id, index) => {
                          const plan = availablePlans.find(p => p.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-gray-950 p-2 rounded border border-gray-800 group">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-600 w-4">{index + 1}.</span>
                                <span className="text-xs text-gray-300 truncate">
                                  {plan?.title || plan?.name || 'Plano removido'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkedPlans(linkedPlans.filter(lId => lId !== id))}
                                className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {linkedPlans.length === 0 && (
                          <p className="text-center py-4 text-zinc-600 text-[10px] uppercase font-bold">Nenhum plano selecionado</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Online Courses */}
                <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden mb-3">
                  <button type="button" onClick={() => setExpanded(prev => ({ ...prev, courses: !prev.courses }))} className="w-full flex items-center justify-between p-3 bg-gray-900 hover:bg-gray-800 transition text-sm font-bold text-gray-300">
                    <span>Cursos Online ({linkedCourses.length})</span>
                    {expanded.courses ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expanded.courses && (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                          className="w-full bg-gray-950 border border-gray-800 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-red-500 outline-none appearance-none cursor-pointer"
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !linkedCourses.includes(id)) {
                              setLinkedCourses([...linkedCourses, id]);
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Adicionar curso...</option>
                          {availableCourses
                            .filter(c => !linkedCourses.includes(c.id))
                            .filter(c => (c.title || c.name || '').toLowerCase().includes(searchTerms.courses))
                            .map(course => (
                              <option key={course.id} value={course.id}>
                                {course.title || course.name || 'Curso sem nome'}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {linkedCourses.map((id, index) => {
                          const course = availableCourses.find(c => c.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-gray-950 p-2 rounded border border-gray-800 group">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-600 w-4">{index + 1}.</span>
                                <span className="text-xs text-gray-300 truncate">
                                  {course?.title || course?.name || 'Curso removido'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkedCourses(linkedCourses.filter(lId => lId !== id))}
                                className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {linkedCourses.length === 0 && (
                          <p className="text-center py-4 text-zinc-600 text-[10px] uppercase font-bold">Nenhum curso selecionado</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Presential Classes */}
                <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden mb-3">
                  <button type="button" onClick={() => setExpanded(prev => ({ ...prev, classes: !prev.classes }))} className="w-full flex items-center justify-between p-3 bg-gray-900 hover:bg-gray-800 transition text-sm font-bold text-gray-300">
                    <span>Turmas Presenciais ({linkedClasses.length})</span>
                    {expanded.classes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expanded.classes && (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                          className="w-full bg-gray-950 border border-gray-800 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-red-500 outline-none appearance-none cursor-pointer"
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !linkedClasses.includes(id)) {
                              setLinkedClasses([...linkedClasses, id]);
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Adicionar turma...</option>
                          {availableClasses
                            .filter(c => !linkedClasses.includes(c.id))
                            .filter(c => (c.title || c.name || '').toLowerCase().includes(searchTerms.classes))
                            .map(cls => (
                              <option key={cls.id} value={cls.id}>
                                {cls.title || cls.name || 'Turma sem nome'}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {linkedClasses.map((id, index) => {
                          const cls = availableClasses.find(c => c.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-gray-950 p-2 rounded border border-gray-800 group">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-600 w-4">{index + 1}.</span>
                                <span className="text-xs text-gray-300 truncate">
                                  {cls?.title || cls?.name || 'Turma removida'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkedClasses(linkedClasses.filter(lId => lId !== id))}
                                className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {linkedClasses.length === 0 && (
                          <p className="text-center py-4 text-zinc-600 text-[10px] uppercase font-bold">Nenhuma turma selecionada</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulated Exams */}
                <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden mb-3">
                  <button type="button" onClick={() => setExpanded(prev => ({ ...prev, simulated: !prev.simulated }))} className="w-full flex items-center justify-between p-3 bg-gray-900 hover:bg-gray-800 transition text-sm font-bold text-gray-300">
                    <span>Turmas de Simulados ({linkedSimulated.length})</span>
                    {expanded.simulated ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expanded.simulated && (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                          className="w-full bg-gray-950 border border-gray-800 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-red-500 outline-none appearance-none cursor-pointer"
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !linkedSimulated.includes(id)) {
                              setLinkedSimulated([...linkedSimulated, id]);
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Adicionar simulado...</option>
                          {availableSimulated
                            .filter(s => !linkedSimulated.includes(s.id))
                            .filter(s => (s.title || s.name || '').toLowerCase().includes(searchTerms.simulated))
                            .map(sim => (
                              <option key={sim.id} value={sim.id}>
                                {sim.title || sim.name || 'Simulado sem nome'}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {linkedSimulated.map((id, index) => {
                          const sim = availableSimulated.find(s => s.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-gray-950 p-2 rounded border border-gray-800 group">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-600 w-4">{index + 1}.</span>
                                <span className="text-xs text-gray-300 truncate">
                                  {sim?.title || sim?.name || 'Simulado removido'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkedSimulated(linkedSimulated.filter(lId => lId !== id))}
                                className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {linkedSimulated.length === 0 && (
                          <p className="text-center py-4 text-zinc-600 text-[10px] uppercase font-bold">Nenhum simulado selecionado</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Events */}
                <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden mb-3">
                  <button type="button" onClick={() => setExpanded(prev => ({ ...prev, liveEvents: !prev.liveEvents }))} className="w-full flex items-center justify-between p-3 bg-gray-900 hover:bg-gray-800 transition text-sm font-bold text-gray-300">
                    <span>Eventos ao Vivo ({linkedLiveEvents.length})</span>
                    {expanded.liveEvents ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {expanded.liveEvents && (
                    <div className="p-3 flex flex-col gap-3 border-t border-gray-800">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                          className="w-full bg-gray-950 border border-gray-800 rounded pl-8 pr-3 py-1.5 text-white text-xs focus:border-red-500 outline-none appearance-none cursor-pointer"
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !linkedLiveEvents.includes(id)) {
                              setLinkedLiveEvents([...linkedLiveEvents, id]);
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Adicionar evento...</option>
                          {availableLiveEvents
                            .filter(e => !linkedLiveEvents.includes(e.id))
                            .filter(e => (e.title || '').toLowerCase().includes(searchTerms.liveEvents))
                            .map(event => (
                              <option key={event.id} value={event.id}>
                                {event.title}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        {linkedLiveEvents.map((id, index) => {
                          const event = availableLiveEvents.find(e => e.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-gray-950 p-2 rounded border border-gray-800 group">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-zinc-600 w-4">{index + 1}.</span>
                                <span className="text-xs text-gray-300 truncate">
                                  {event?.title || 'Evento removido'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinkedLiveEvents(linkedLiveEvents.filter(lId => lId !== id))}
                                className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {linkedLiveEvents.length === 0 && (
                          <p className="text-center py-4 text-zinc-600 text-[10px] uppercase font-bold">Nenhum evento selecionado</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={loading}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {loading ? 'Salvando...' : 'Salvar Produto'}
          </button>
        </div>
      </div>
    </div>
  );
}
