import React, { useEffect, useState } from 'react';
import { ShoppingCart, Copy, Check, Search, Tag, ExternalLink, Filter } from 'lucide-react';
import { getProducts } from '../../services/productService';
import { TictoProduct } from '../../types/product';
import { useAuth } from '../../contexts/AuthContext';

const SalesPage: React.FC = () => {
    const [products, setProducts] = useState<TictoProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const { currentUser } = useAuth();

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const allProducts = await getProducts();
                // Filter products that have at least one offer with affiliation enabled
                const affiliatedProducts = allProducts.filter(p => 
                    p.offers?.some(o => o.isAffiliationEnabled && o.isActive)
                );
                setProducts(affiliatedProducts);
            } catch (error) {
                console.error("Erro ao carregar catálogo de vendas:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const copyLink = (offerId: string) => {
        const origin = window.location.origin;
        const refLink = `${origin}/checkout/${offerId}?ref=${currentUser?.uid}`;
        navigator.clipboard.writeText(refLink);
        setCopiedId(offerId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">Catálogo de Vendas</h2>
                    <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest pt-1">Capture seus links de afiliado para vender produtos.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                        <input 
                            type="text" 
                            placeholder="BUSCAR PRODUTOS..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-700 focus:border-brand-red focus:outline-none w-64 uppercase font-bold"
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-red"></div>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="text-center py-24 bg-zinc-950 border border-dashed border-zinc-800 rounded-3xl">
                    <p className="text-zinc-600 font-black uppercase tracking-widest text-xs">Nenhum produto disponível para filiação no momento.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredProducts.map((product) => (
                        <div key={product.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col group hover:border-zinc-700 transition-all shadow-sm hover:shadow-2xl">
                            {/* Product Header */}
                            <div className="relative h-32 bg-zinc-900">
                                {product.coverUrl ? (
                                    <img src={product.coverUrl} alt={product.name} className="w-full h-full object-cover opacity-40 grayscale group-hover:grayscale-0 transition-all duration-500" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-800">
                                        <ShoppingCart size={40} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <span className="text-[10px] font-black text-brand-red uppercase tracking-widest bg-brand-red/10 px-2 py-0.5 rounded border border-brand-red/20 mb-1 inline-block">
                                        {product.type}
                                    </span>
                                    <h3 className="text-lg font-black text-white uppercase tracking-tight line-clamp-1">{product.name}</h3>
                                </div>
                            </div>

                            {/* Offers Content - Only show affiliated offers */}
                            <div className="p-5 flex-1 flex flex-col gap-4">
                                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-900 pb-2">
                                    <span>Ofertas Disponíveis</span>
                                    <span className="text-zinc-600 font-black">Split Variável</span>
                                </div>

                                <div className="space-y-3">
                                    {product.offers?.filter(o => o.isActive && o.isAffiliationEnabled).map(offer => (
                                        <div key={offer.id} className="bg-white/5 border border-white/5 rounded-xl p-3 flex items-center justify-between group/offer hover:bg-white/10 transition-all">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Tag size={12} className="text-zinc-600" />
                                                    <p className="text-xs font-bold text-zinc-300 uppercase leading-none">{offer.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-sm font-black text-white">R$ {offer.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1 rounded">+{offer.affiliateCommission}%</span>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => copyLink(offer.id)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    copiedId === offer.id 
                                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                                                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                                                }`}
                                            >
                                                {copiedId === offer.id ? (
                                                    <>
                                                        <Check size={14} /> COPIADO
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={14} /> LINK
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 bg-zinc-900/50 border-t border-zinc-900 flex items-center justify-between">
                                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                                    {product.accessDays} DIAS DE ACESSO
                                </span>
                                <div className="flex items-center gap-1 text-[9px] font-black text-zinc-500 hover:text-white transition-colors cursor-help">
                                    <ExternalLink size={10} />
                                    INFO ADICIONAL
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SalesPage;
