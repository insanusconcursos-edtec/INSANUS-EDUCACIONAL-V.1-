import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Layers, 
  FileCheck, 
  AlertCircle, 
  PlayCircle, 
  BarChart2, 
  Lock,
  Search,
  ArrowRight
} from 'lucide-react';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { 
  getExams, 
  SimulatedClass, 
  SimulatedExam 
} from '../../../services/simulatedService';
import { SimulatedAttempt } from '../../../services/simulatedAttemptService';
import Loading from '../../ui/Loading';

interface SimuladosTabContentProps {
  planId: string;
  simuladosVinculados?: string[];
}

export const SimuladosTabContent: React.FC<SimuladosTabContentProps> = ({ planId, simuladosVinculados }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [linkedClasses, setLinkedClasses] = useState<SimulatedClass[]>([]);
  const [examsMap, setExamsMap] = useState<Record<string, SimulatedExam[]>>({});
  const [attemptsMap, setAttemptsMap] = useState<Record<string, SimulatedAttempt>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser || !planId) return;
      setLoading(true);
      setError(null);

      try {
        let classIds = simuladosVinculados || [];

        // Se não vier por props, tenta buscar do banco para garantir
        if (classIds.length === 0) {
          const planDoc = await getDoc(doc(db, 'plans', planId));
          if (planDoc.exists()) {
            const planData = planDoc.data();
            classIds = planData.simuladosVinculados || (planData.linkedSimuladoClassId ? [planData.linkedSimuladoClassId] : []);
          }
        }

        if (classIds.length === 0) {
          setLinkedClasses([]);
          setLoading(false);
          return;
        }

        // Busca as Turmas Vinculadas
        const classesData: SimulatedClass[] = [];
        const examsDataMap: Record<string, SimulatedExam[]> = {};

        for (const classId of classIds) {
          const classRef = doc(db, 'simulatedClasses', classId);
          const classSnap = await getDoc(classRef);
          
          if (classSnap.exists()) {
            const cls = { id: classSnap.id, ...classSnap.data() } as SimulatedClass;
            classesData.push(cls);

            // Busca Simulados desta Turma
            const exams = await getExams(classId);
            examsDataMap[classId] = exams.filter(e => e.status === 'published');
          }
        }

        setLinkedClasses(classesData);
        setExamsMap(examsDataMap);

        // Busca Tentativas do Usuário para estes simulados
        const qAttempts = query(
          collection(db, 'simulated_attempts'),
          where('userId', '==', currentUser.uid)
        );
        const snapAttempts = await getDocs(qAttempts);
        const attMap: Record<string, SimulatedAttempt> = {};
        snapAttempts.docs.forEach(d => {
          const att = { id: d.id, ...d.data() } as SimulatedAttempt;
          // Guardamos apenas a tentativa mais recente ou aprovada? 
          // Simplificando: guardamos a última encontrada por ID de simulado
          attMap[att.simulatedId] = att;
        });
        setAttemptsMap(attMap);

      } catch (err) {
        console.error("Erro ao carregar simulados vinculados:", err);
        setError("Não foi possível carregar os simulados vinculados.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, planId, simuladosVinculados]);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/20 border-2 border-dashed border-zinc-800 rounded-3xl">
        <AlertCircle size={40} className="text-zinc-500 mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">{error}</p>
      </div>
    );
  }

  if (linkedClasses.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/20 border-2 border-dashed border-zinc-800 rounded-3xl animate-in fade-in duration-500">
        <div className="mb-4 p-4 rounded-full bg-zinc-900 border border-zinc-800">
          <GraduationCap size={32} className="text-zinc-500" />
        </div>
        <h3 className="text-lg font-black uppercase text-zinc-400 tracking-tight">Nenhum simulado vinculado</h3>
        <p className="text-xs font-medium text-zinc-500 max-w-xs text-center mt-1">
          Nenhum simulado vinculado a este plano no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {linkedClasses.map(cls => (
        <div key={cls.id} className="space-y-6">
          {/* Header da Turma */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <GraduationCap className="w-5 h-5 text-[var(--plan-theme)]" />
                </div>
                {cls.title}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{cls.organization}</span>
              </div>
            </div>
            
            <a 
              href={`/app/simulated`} 
              className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              Ver Todas as Turmas <ArrowRight size={14} />
            </a>
          </div>

          {/* Lista de Simulados */}
          <div className="grid grid-cols-1 gap-4">
            {examsMap[cls.id!]?.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-zinc-800 rounded-2xl">
                <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest text-center">Nenhum simulado publicado nesta turma.</p>
              </div>
            ) : (
              examsMap[cls.id!]?.map(exam => {
                const attempt = attemptsMap[exam.id!];
                const isDone = !!attempt;
                
                const now = new Date();
                const publishDate = exam.publishDate ? new Date(exam.publishDate) : null;
                const isBlocked = publishDate && publishDate > now;

                return (
                  <div 
                    key={exam.id} 
                    className={`bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-zinc-700 transition-all ${isBlocked ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${isDone ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : isBlocked ? 'bg-zinc-800 text-zinc-600 border border-zinc-700' : 'bg-zinc-800 text-zinc-400'}`}>
                        {isDone ? <FileCheck size={24} /> : isBlocked ? <Lock size={24} /> : <PlayCircle size={24} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`text-lg font-black uppercase tracking-tight ${isBlocked ? 'text-zinc-500' : 'text-white'}`}>{exam.title}</h3>
                          {isBlocked && (
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[9px] font-bold uppercase border border-zinc-700 flex items-center gap-1">
                              <Lock size={10} /> BLOQUEADO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-500 uppercase mt-1">
                          <span className="flex items-center gap-1"><Layers size={12} /> {exam.questionCount} Questões</span>
                          {exam.hasPenalty && <span className="flex items-center gap-1 text-red-500"><AlertCircle size={12} /> Penalidade Ativa</span>}
                          {isBlocked && publishDate && (
                            <span className="flex items-center gap-1 text-purple-400">
                               Liberação em: {publishDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isDone ? (
                        <a 
                          href={`/app/simulated`}
                          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <BarChart2 size={14} /> Ver Resultado
                        </a>
                      ) : isBlocked ? (
                        <button 
                          disabled
                          className="px-6 py-3 bg-zinc-800 text-zinc-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-not-allowed border border-zinc-700"
                        >
                          <Lock size={14} /> Bloqueado
                        </button>
                      ) : (
                        <a 
                          href={`/app/simulated`}
                          className="px-6 py-3 bg-brand-red hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-red-900/20"
                        >
                          <PlayCircle size={14} /> Realizar Simulado
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
