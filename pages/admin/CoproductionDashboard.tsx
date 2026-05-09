import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  onSnapshot,
  query,
  where,
  doc,
  getDoc
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
  User,
  Wallet,
  ArrowRightCircle,
  Lock
} from 'lucide-react';
import { motion } from 'motion/react';
import { Coproducer } from '../../types/coproducer';

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

interface CoproducerUser {
  uid: string;
  name: string;
  email: string;
  role: string;
}

const CoproductionDashboard: React.FC = () => {
  const { currentUser, userRole } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [coproducerUsers, setCoproducerUsers] = useState<CoproducerUser[]>([]);
  const [managedCoproducers, setManagedCoproducers] = useState<Coproducer[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ available: number; waiting_funds: number } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const isCoprodutorRole = userRole === 'COPRODUTOR';

  const fetchBalance = async (recipientId: string) => {
    setLoadingBalance(true);
    try {
      const response = await fetch(`/api/payments/pagarme/balance?recipientId=${recipientId}`);
      if (!response.ok) {
        throw new Error('Falha ao carregar saldo');
      }
      const data = await response.json();
      if (data.success) {
        setBalance(data.balance);
      } else {
        // Fallback to zero if API returns success: false
        setBalance({ available: 0, waiting_funds: 0 });
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      // Ensure UI shows 0,00 if error occurs
      setBalance({ available: 0, waiting_funds: 0 });
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!userProfile?.pagarmeRecipientId || !balance?.available || balance.available <= 0) return;

    setRequestingPayout(true);
    setPayoutMessage(null);

    try {
      const response = await fetch('/api/payments/pagarme/request-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: userProfile.pagarmeRecipientId,
          amount: balance.available
        })
      });

      const data = await response.json();

      if (data.success) {
        setPayoutMessage({
          type: 'success',
          text: 'Solicitação enviada! O valor cairá em sua conta conforme o prazo bancário.'
        });
        // Refresh balance after payout
        fetchBalance(userProfile.pagarmeRecipientId);
        setTimeout(() => {
          setShowPayoutModal(false);
          setPayoutMessage(null);
        }, 3000);
      } else {
        setPayoutMessage({
          type: 'error',
          text: data.error || 'Erro ao processar o saque.'
        });
      }
    } catch (err) {
      console.error('Error requesting payout:', err);
      setPayoutMessage({ type: 'error', text: 'Erro de conexão com o servidor.' });
    } finally {
      setRequestingPayout(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserProfile(data);
          if (data.pagarmeRecipientId) {
            fetchBalance(data.pagarmeRecipientId);
          }
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
      }
    };

    loadUserData();
    
    setLoading(true);
    
    // 1. Fetch all baseline data
    const fetchBaseData = async () => {
      try {
        const [prodSnap, userSnap, managedSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(query(collection(db, 'users'), where('role', '==', 'coprodutor'))),
          getDocs(collection(db, 'coproducers'))
        ]);

        const allProducts: ProductInfo[] = prodSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Produto sem nome',
          coproduction: doc.data().coproduction || []
        }));
        setProducts(allProducts);

        const users: CoproducerUser[] = userSnap.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        } as CoproducerUser));
        setCoproducerUsers(users);

        const managed: Coproducer[] = managedSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Coproducer));
        setManagedCoproducers(managed);

      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    fetchBaseData();

    // 2. Listen to commissions (Filtered if Coprodutor)
    const commissionsCollection = collection(db, 'coproduction_commissions');
    const commissionsQuery = isCoprodutorRole 
      ? query(commissionsCollection, where('coproducerId', '==', currentUser.uid))
      : commissionsCollection;

    const unsubscribe = onSnapshot(commissionsQuery, 
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
        setError('Falha ao carregar relatório. Verifique suas permissões.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Main Logic: Group gains by Coproducer
  const coproducerGains = useMemo(() => {
    const map = new Map<string, CoproducerGain>();

    // Step 1: Build the pool of target coproducers
    let allCoproducers: Array<{id: string; name: string; email: string; percentage?: number}> = [];

    if (isCoprodutorRole) {
      allCoproducers.push({
        id: currentUser.uid,
        name: userProfile?.name || 'Eu',
        email: userProfile?.email || ''
      });
    } else if (selectedProductId === 'all') {
      // Logic for ALL: Users with role 'coprodutor' OR mentioned in any split
      const seen = new Set();

      // Add users with the role
      coproducerUsers.forEach(u => {
        if (!seen.has(u.uid)) {
          seen.add(u.uid);
          allCoproducers.push({
            id: u.uid,
            name: u.name,
            email: u.email
          });
        }
      });

      // Add managed coproducers from the explicit collection
      managedCoproducers.forEach(m => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          allCoproducers.push({
            id: m.id,
            name: m.name,
            email: m.email
          });
        }
      });

      // Add users mentioned in product splits (might not have the role but are coproducers for a product)
      products.forEach(p => {
        p.coproduction.forEach(cp => {
          const cid = cp.userId || cp.id;
          if (!seen.has(cid)) {
            seen.add(cid);
            allCoproducers.push({
              id: cid,
              name: cp.name,
              email: cp.email
            });
          }
        });
      });
    } else {
      // Logic for SPECIFIC PRODUCT: Only those explicitly in the split of this product
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        allCoproducers = product.coproduction.map(cp => ({
          id: cp.userId || cp.id,
          name: cp.name,
          email: cp.email,
          percentage: cp.percentage
        }));
      }
    }

    // 1. Filtro de Existência: Garante que APENAS usuários com nome válido e ID sejam processados
    const validCoproducers = allCoproducers.filter(cp => cp.name && cp.name.trim() !== "" && cp.id);

    // Initialize map with target coproducers
    validCoproducers.forEach(cp => {
      map.set(cp.id, {
        id: cp.id,
        name: cp.name,
        email: cp.email,
        totalGained: 0,
        percentage: cp.percentage,
        salesCount: 0
      });
    });

    // Step 2: Aggregate commissions
    commissions.forEach(comm => {
      // 2. Verificação de ID nulo: Ignorar comissões sem ID de coprodutor
      if (!comm.coproducerId) return;

      // If filtering by product, ignore other products
      if (selectedProductId !== 'all' && comm.courseId !== selectedProductId) return;

      // Match commission with coproducer
      const gainObj = map.get(comm.coproducerId);
      if (gainObj) {
        gainObj.totalGained += comm.commissionValue;
        gainObj.salesCount += 1;
      }
    });

    // 3. Ordenação: Maior faturamento primeiro
    return Array.from(map.values()).sort((a, b) => b.totalGained - a.totalGained);
  }, [commissions, products, coproducerUsers, managedCoproducers, selectedProductId]);

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
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
            {isCoprodutorRole ? "Minha Coprodução" : "Painel Geral de Coprodução"}
          </h1>
          <p className="text-gray-400 mt-1 font-medium italic">
            {isCoprodutorRole 
              ? "Acompanhe suas vendas, comissões e saldo disponível em tempo real." 
              : "Gestão centralizada de participações e comissões de parceiros."}
          </p>
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

      {/* Wallet / Balance Section */}
      {userProfile?.pagarmeRecipientId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-brand-dark border-2 border-emerald-500/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.1)] group"
          >
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_15px_#10b981] opacity-50"></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Wallet className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">Disponível para Saque</p>
                  <h2 className="text-3xl font-black text-emerald-500 tracking-tighter mt-1">
                    {loadingBalance ? (
                      <span className="inline-block w-32 h-8 bg-brand-white/5 animate-pulse rounded-lg"></span>
                    ) : (
                      `R$ ${((balance?.available || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    )}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setShowPayoutModal(true)}
                disabled={!balance?.available || balance.available <= 0 || loadingBalance || requestingPayout}
                className={`py-3 px-6 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  (!balance?.available || balance.available <= 0 || loadingBalance || requestingPayout)
                    ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-50'
                    : 'bg-emerald-600 text-white shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:bg-emerald-500'
                }`}
              >
                {requestingPayout ? '...' : 'Sacar'}
                <ArrowRightCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[60px] -mr-16 -mt-16"></div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-brand-dark border-2 border-amber-500/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.1)] group"
          >
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_15px_#f59e0b] opacity-50"></div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                <Lock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">A Receber (Lançamentos)</p>
                <h2 className="text-3xl font-black text-amber-500 tracking-tighter mt-1">
                  {loadingBalance ? (
                    <span className="inline-block w-32 h-8 bg-brand-white/5 animate-pulse rounded-lg"></span>
                  ) : (
                    `R$ ${((balance?.waiting_funds || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  )}
                </h2>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[60px] -mr-16 -mt-16"></div>
          </motion.div>
        </div>
      )}

      {/* Payout Confirmation Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-dark/95 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-brand-dark border-2 border-brand-blue/30 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(45,124,255,0.2)]"
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-brand-blue/20 flex items-center justify-center border border-brand-blue/30 shadow-[0_0_20px_rgba(45,124,255,0.2)]">
                <Wallet className="w-10 h-10 text-brand-blue" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Confirmar Saque</h3>
              <p className="text-gray-400 font-medium">
                Deseja transferir <span className="text-white font-bold">R$ {((balance?.available || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> para sua conta bancária cadastrada na Pagar.me?
              </p>

              {payoutMessage && (
                <div className={`w-full p-4 rounded-xl text-sm font-bold uppercase tracking-widest ${
                  payoutMessage.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                }`}>
                  {payoutMessage.text}
                </div>
              )}

              <div className="flex gap-4 w-full mt-4">
                <button
                  onClick={() => {
                    setShowPayoutModal(false);
                    setPayoutMessage(null);
                  }}
                  disabled={requestingPayout}
                  className="flex-1 py-4 rounded-xl bg-brand-white/5 text-gray-400 font-bold uppercase tracking-widest hover:bg-brand-white/10 transition-colors border border-brand-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRequestPayout}
                  disabled={requestingPayout}
                  className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest transition-all ${
                    requestingPayout 
                      ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed' 
                      : 'bg-brand-blue text-white shadow-[0_10px_20px_rgba(45,124,255,0.2)]'
                  }`}
                >
                  {requestingPayout ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    </div>
                  ) : 'Confirmar'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

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
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                {isCoprodutorRole ? "Produtos com Vendas" : "Parceiros Ativos"}
              </p>
              <h2 className="text-3xl font-black text-white mt-0.5">
                {selectedProductId === 'all' ? globalStats.uniqueCoproducers : coproducerGains.length}
              </h2>
            </div>
          </div>
          <div className="pt-4 border-t border-brand-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
              {isCoprodutorRole ? "Total de treinamentos vinculados" : (selectedProductId === 'all' ? "Cadastrados no sistema" : "Neste produto")}
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
                    <div className="flex flex-col items-center gap-3 opacity-40">
                      <Package className="w-12 h-12 text-gray-500" />
                      <p className="text-lg font-black text-gray-400 font-mono uppercase tracking-[0.2em]">
                        Nenhum coprodutor com vendas registradas para este filtro.
                      </p>
                      <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                        Tente selecionar outro produto ou verifique os splits cadastrados.
                      </span>
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
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest italic">Sincronizado com Pagar.me em Tempo Real</span>
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
