import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Filter, 
  Package,
  AlertCircle,
  User
} from 'lucide-react';
import { motion } from 'motion/react';

interface Commission {
  id: string;
  coproducerId: string;
  coproducerName: string;
  orderId: string;
  courseId: string;
  courseName: string;
  commissionValue: number;
  createdAt: string;
}

interface ProductInfo {
  id: string;
  name: string;
  coproduction: Array<{
    id: string;
    userId?: string;
    percentage: number;
    name: string;
    email: string;
  }>;
}

interface CoproducerGain {
  id: string;
  name: string;
  email: string;
  totalGained: number;
  percentage?: number; // Specific to a product if selected
  salesCount: number;
}

const CoproductionDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    
    // 1. Fetch all products to identify coproducers and their configurations
    const fetchProductsData = async () => {
      try {
        const prodSnap = await getDocs(collection(db, 'ticto_products'));
        const allProducts: ProductInfo[] = prodSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Produto sem nome',
          coproduction: doc.data().coproduction || []
        }));
        setProducts(allProducts);
      } catch (err) {
        console.error('Error fetching products:', err);
      }
    };

    fetchProductsData();

    // 2. Listen to all commissions (Admin view)
    const unsubscribe = onSnapshot(collection(db, 'coproduction_commissions'), 
      (snapshot) => {
        const comms: Commission[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Commission));
        setCommissions(comms);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to commissions:', err);
        setError('Falha ao carregar relatório. Verifique suas permissões administrativas.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Main Logic: Group gains by Coproducer
  const coproducerGains = useMemo(() => {
    const map = new Map<string, CoproducerGain>();

    // Determine target coproducers based on filter
    let targetCoproducers: Array<{id: string; name: string; email: string; percentage?: number}> = [];

    if (selectedProductId === 'all') {
      // Find all unique coproducers mentioned in any product
      const seen = new Set();
      products.forEach(p => {
        p.coproduction.forEach(cp => {
          const cid = cp.userId || cp.id;
          if (!seen.has(cid)) {
            seen.add(cid);
            targetCoproducers.push({
              id: cid,
              name: cp.name,
              email: cp.email
            });
          }
        });
      });
    } else {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        targetCoproducers = product.coproduction.map(cp => ({
          id: cp.userId || cp.id,
          name: cp.name,
          email: cp.email,
          percentage: cp.percentage
        }));
      }
    }

    // Initialize map
    targetCoproducers.forEach(cp => {
      map.set(cp.id, {
        id: cp.id,
        name: cp.name,
        email: cp.email,
        totalGained: 0,
        percentage: cp.percentage,
        salesCount: 0
      });
    });

    // Aggregate commissions
    commissions.forEach(comm => {
      // If filtering by product, ignore other products
      if (selectedProductId !== 'all' && comm.courseId !== selectedProductId) return;

      const gainObj = map.get(comm.coproducerId);
      if (gainObj) {
        gainObj.totalGained += comm.commissionValue;
        gainObj.salesCount += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalGained - a.totalGained);
  }, [commissions, products, selectedProductId]);

  const globalStats = useMemo(() => {
    const relevantComms = selectedProductId === 'all' 
      ? commissions 
      : commissions.filter(c => c.courseId === selectedProductId);

    const total = relevantComms.reduce((acc, c) => acc + c.commissionValue, 0);
    const count = relevantComms.length;
    const uniqueCoproducers = new Set(relevantComms.map(c => c.coproducerId)).size;

    return {
      total: total / 100,
      count,
      uniqueCoproducers
    };
  }, [commissions, selectedProductId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12" id="admin-coproduction-dashboard">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight uppercase">Relatório de Coprodução</h1>
          <p className="text-gray-400 mt-1">Gestão centralizada de participações e comissões de parceiros.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 transition-colors group-hover:text-brand-blue" />
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="pl-10 pr-8 py-2 bg-brand-dark/50 border border-brand-white/10 rounded-lg text-white focus:outline-none focus:border-brand-blue transition-all appearance-none cursor-pointer min-w-[250px] font-medium"
            >
              <option value="all">📊 Todos os Produtos</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      ) : null}

      {/* Global Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-dark/40 backdrop-blur-md border border-brand-white/10 p-6 rounded-2xl relative overflow-hidden group"
        >
          <div className="absolute -top-4 -right-4 bg-brand-blue/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-brand-blue/20 transition-all"></div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-brand-blue/20 p-3 rounded-xl border border-brand-blue/30 shadow-lg shadow-brand-blue/20">
              <DollarSign className="w-6 h-6 text-brand-blue" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Total Distribuído</p>
              <h2 className="text-3xl font-black text-white mt-0.5">
                R$ {globalStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h2>
            </div>
          </div>
          <div className="pt-4 border-t border-brand-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Valor Líquido Coprodutores</span>
            <span className="text-brand-blue font-bold text-xs">+12% vs mês ant.</span>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-brand-dark/40 backdrop-blur-md border border-brand-white/10 p-6 rounded-2xl relative overflow-hidden group"
        >
          <div className="absolute -top-4 -right-4 bg-green-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-green-500/20 transition-all"></div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-green-500/20 p-3 rounded-xl border border-green-500/30 shadow-lg shadow-green-500/20">
              <Package className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Volume de Comissões</p>
              <h2 className="text-3xl font-black text-white mt-0.5">
                {globalStats.count}
              </h2>
            </div>
          </div>
          <div className="pt-4 border-t border-brand-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Vendas processadas</span>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-brand-dark/40 backdrop-blur-md border border-brand-white/10 p-6 rounded-2xl relative overflow-hidden group"
        >
          <div className="absolute -top-4 -right-4 bg-purple-500/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-purple-500/20 p-3 rounded-xl border border-purple-500/30 shadow-lg shadow-purple-500/20">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Parceiros Ativos</p>
              <h2 className="text-3xl font-black text-white mt-0.5">
                {selectedProductId === 'all' ? globalStats.uniqueCoproducers : coproducerGains.length}
              </h2>
            </div>
          </div>
          <div className="pt-4 border-t border-brand-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              {selectedProductId === 'all' ? 'Cadastrados no sistema' : 'Neste produto'}
            </span>
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-5 h-5 rounded-full bg-brand-dark border border-brand-white/10 flex items-center justify-center">
                  <User className="w-3 h-3 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Coproducers List Table */}
      <div className="bg-brand-dark/40 backdrop-blur-md border border-brand-white/5 rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-brand-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-black text-white flex items-center gap-3 text-xl tracking-tighter uppercase">
              Lista de Comissionamento
              <span className="text-[10px] bg-brand-blue/20 text-brand-blue px-3 py-1 rounded-full font-bold tracking-widest">
                {coproducerGains.length} PARCEIROS
              </span>
            </h3>
            <p className="text-gray-500 text-xs mt-1 font-medium italic">Valores calculados em tempo real com base no faturamento bruto.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-black/40 text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black">
                <th className="px-8 py-5">Parceiro</th>
                <th className="px-8 py-5">E-mail de Cadastro</th>
                <th className="px-8 py-5 text-center">Configuração Split</th>
                <th className="px-8 py-5 text-center">Qtd. Vendas</th>
                <th className="px-8 py-5 text-right font-bold text-white">Total Ganho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-white/5">
              {coproducerGains.length > 0 ? (
                coproducerGains.map((gain, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={gain.id} 
                    className="hover:bg-brand-white/5 transition-all group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-black border border-brand-white/10 flex items-center justify-center group-hover:border-brand-blue/50 transition-colors">
                          <User className="text-gray-500 group-hover:text-brand-blue" />
                        </div>
                        <div>
                          <p className="text-sm text-white font-black tracking-tight">{gain.name || 'Sem Nome'}</p>
                          <span className="text-[10px] text-gray-500 font-bold uppercase">ID: {gain.id.substring(0, 8)}...</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-xs text-gray-400 font-bold font-mono">
                      {gain.email}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className="bg-brand-blue/10 text-brand-blue text-[11px] px-3 py-1 rounded-md font-black border border-brand-blue/20">
                        {gain.percentage !== undefined ? `${gain.percentage}%` : 'Múltiplos'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center font-bold text-white text-sm">
                      {gain.salesCount}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="text-brand-blue font-black text-lg drop-shadow-[0_0_8px_rgba(45,124,255,0.4)]">
                        R$ {(gain.totalGained / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-30">
                      <Package className="w-12 h-12 text-gray-500" />
                      <p className="text-lg font-black text-gray-500 uppercase tracking-widest">Nenhum dado de coprodução encontrado</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      <footer className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-brand-dark/20 rounded-2xl border border-brand-white/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse shadow-[0_0_10px_#2D7CFF]"></div>
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest italic">Sincronizado com Ticto em Tempo Real</span>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="text-xs font-black text-brand-blue uppercase tracking-widest hover:underline transition-all"
        >
          Forçar Recarregamento de Dados
        </button>
      </footer>
    </div>
  );
};

export default CoproductionDashboard;
