
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Search, 
  Brain, 
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  ChevronRight,
  Target,
  X,
  ListTodo,
  BookOpen,
  Check,
  Layout
} from 'lucide-react';
import { SimulatedExam, getExams } from '../../../../services/simulatedService';
import { SimulatedAttempt, getAttemptsByUserId } from '../../../../services/simulatedAttemptService';
import { getStudents, Student } from '../../../../services/userService';
import { getEdict, EdictStructure } from '../../../../services/edictService';
import { getAllPlanMetas, Meta } from '../../../../services/metaService';
import { useEditalProgress } from '../../../../hooks/useEditalProgress';
import { collection, getDocs, query, where, documentId, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { StudyCalendar } from '../../../../components/student/calendar/StudyCalendar';
import DisciplineItem from '../../../../components/student/edital/DisciplineItem';
import Loading from '../../../ui/Loading';
import { motion, AnimatePresence } from 'motion/react';

const StudentAvatar = ({ student, size = 32, onExpand }: { student: Student; size?: number; onExpand?: (url: string) => void }) => {
  const initials = student.name
    ? student.name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : '??';

  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600',
    'bg-amber-600', 'bg-rose-600', 'bg-cyan-600',
    'bg-indigo-600', 'bg-orange-600'
  ];
  
  // Deterministic color based on UID
  const charSum = student.uid ? student.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const bgColor = colors[charSum % colors.length];

  return (
    <div 
      className={`rounded-full flex items-center justify-center text-white font-black overflow-hidden border border-white/10 ${bgColor} shrink-0 shadow-inner ${student.photoURL ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400/50 transition-all' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      onClick={(e) => {
        if (student.photoURL && onExpand) {
          e.stopPropagation();
          onExpand(student.photoURL);
        }
      }}
    >
      {student.photoURL ? (
        <img src={student.photoURL} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="tracking-tighter">{initials}</span>
      )}
    </div>
  );
};

const formatStudyTime = (minutes: number = 0) => {
  const totalMinutesRounded = Math.floor(minutes);
  if (totalMinutesRounded < 60) return `${totalMinutesRounded} min`;
  const hours = Math.floor(totalMinutesRounded / 60);
  const remainingMinutes = totalMinutesRounded % 60;
  
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
};

interface PlanAnalyticsTabProps {
  planId: string;
  linkedSimuladoClassId?: string;
}

type ViewState = 'STUDENTS' | 'STUDENT_DASHBOARD' | 'ATTEMPT_DETAIL';
type SubTab = 'SIMULADOS' | 'SCHEDULE' | 'EDITAL';

export const PlanAnalyticsTab: React.FC<PlanAnalyticsTabProps> = ({ planId, linkedSimuladoClassId }) => {
  const [view, setView] = useState<ViewState>('STUDENTS');
  const [subTab, setSubTab] = useState<SubTab>('SIMULADOS');
  const [loading, setLoading] = useState(true);
  
  // Data
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [planExams, setPlanExams] = useState<SimulatedExam[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);
  const [edictStructure, setEdictStructure] = useState<EdictStructure | null>(null);
  const [metaLookup, setMetaLookup] = useState<Record<string, Meta>>({});
  
  // Selection
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentAttempts, setStudentAttempts] = useState<SimulatedAttempt[]>([]);
  const [studentEditalProgress, setStudentEditalProgress] = useState<Set<string>>(new Set());
  const [selectedAttempt, setSelectedAttempt] = useState<SimulatedAttempt | null>(null);

  // 1. Initial Data Fetch (Students of Plan + Exams + Edict Structure)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const promises: Promise<any>[] = [
          getStudents(),
          getEdict(planId),
          getAllPlanMetas(planId)
        ];

        if (linkedSimuladoClassId) {
          promises.push(getExams(linkedSimuladoClassId));
        }

        const [studentsData, edictData, metasData, examsData] = await Promise.all(promises);

        // Filter students who have active access to this plan
        const planStudents = studentsData.filter((s: Student) => 
          s.access?.some(a => a.targetId === planId && a.type === 'plan' && a.isActive)
        );

        const lookup: Record<string, Meta> = {};
        metasData.forEach((m: Meta) => { lookup[m.id!] = m; });

        setAllStudents(planStudents);
        setEdictStructure(edictData);
        setMetaLookup(lookup);
        if (examsData) setPlanExams(examsData);
      } catch (error) {
        console.error("Error fetching initial analytics data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [planId, linkedSimuladoClassId]);

  // 2. Fetch Student Specific Data
  // 2. Handle Escape key for Lightbox
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedPhotoUrl(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleSelectStudent = async (student: Student) => {
    setSelectedStudent(student);
    setView('STUDENT_DASHBOARD');
    setSubTab('SIMULADOS');
    setLoading(true);
    try {
      // 1. Fetch Attempts
      const attemptsPromise = getAttemptsByUserId(student.uid).then(attempts => {
        return attempts.filter(a => a.classId === linkedSimuladoClassId);
      });

      // 3. Fetch Edital Progress
      const editalPromise = (async () => {
        const progressRef = collection(db, 'users', student.uid, 'plans', planId, 'edital_progress');
        const snap = await getDocs(progressRef);
        const completedIds = new Set<string>();
        snap.docs.forEach(d => {
          if (d.data().completed) completedIds.add(d.id);
        });
        return completedIds;
      })();

      const [attempts, edital] = await Promise.all([
        attemptsPromise,
        editalPromise
      ]);

      setStudentAttempts(attempts ?? []);
      setStudentEditalProgress(edital ?? new Set());
    } catch (error) {
      console.error("Error fetching student comprehensive data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAttempt = (attempt: SimulatedAttempt) => {
    setSelectedAttempt(attempt);
    setView('ATTEMPT_DETAIL');
  };

  const menuBack = () => {
    if (view === 'ATTEMPT_DETAIL') setView('STUDENT_DASHBOARD');
    else if (view === 'STUDENT_DASHBOARD') setView('STUDENTS');
  };

  const filteredStudents = useMemo(() => {
    return allStudents.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allStudents, searchQuery]);

  // ==========================================
// NEW: READ-ONLY SUB-COMPONENTS
// ==========================================

const StudentEditalReadOnly = ({ structure, completedIds, metaLookup }: { structure: EdictStructure | null; completedIds: Set<string>; metaLookup: Record<string, Meta> }) => {
  const stats = useEditalProgress(structure, completedIds);
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  
  if (!structure) {
    return (
      <div className="p-20 text-center bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl">
        <BookOpen size={40} className="text-zinc-700 mx-auto mb-4" />
        <h3 className="text-sm font-black text-zinc-600 uppercase tracking-widest">Edital não configurado para este plano.</h3>
      </div>
    );
  }

  const toggleDiscipline = (id: string) => {
    const newSet = new Set(expandedDisciplines);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedDisciplines(newSet);
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Global Progress Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 blur-[100px] pointer-events-none group-hover:bg-yellow-400/10 transition-all duration-700" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
           <div className="text-center md:text-left">
              <div className="flex items-center gap-2 text-[10px] font-black text-yellow-400 uppercase tracking-[0.3em] mb-4 font-mono">
                <Target size={12} />
                <span>Status de Cobertura do Edital</span>
              </div>
              <div className="flex items-center gap-4">
                 <div className="text-7xl font-black text-white tracking-tighter leading-none italic">{stats.globalProgress}%</div>
                 <div className="h-12 w-[1px] bg-zinc-800 hidden md:block" />
                 <div className="text-left">
                    <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">{stats.completedGoals} Metas</div>
                    <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mt-0.5">Concluídas de {stats.totalGoals}</div>
                 </div>
              </div>
           </div>
           
           <div className="flex-1 w-full max-w-xl">
              <div className="h-6 bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden p-1 shadow-inner group/bar relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.globalProgress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-xl relative"
                >
                   <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]" />
                   <div className="absolute inset-0 shadow-[0_0_20px_rgba(250,204,21,0.3)]" />
                </motion.div>
              </div>
              
              <div className="grid grid-cols-2 mt-4 gap-4">
                 <div className="bg-zinc-800/20 p-3 rounded-2xl border border-zinc-800/50 flex flex-col gap-1">
                    <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                      <Clock size={8} /> Projeção de Fim
                    </div>
                    <div className="text-xs font-black text-zinc-400 uppercase">Automática</div>
                 </div>
                 <div className="bg-zinc-800/20 p-3 rounded-2xl border border-zinc-800/50 flex flex-col gap-1">
                    <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                      <BarChart3 size={8} /> Desempenho
                    </div>
                    <div className="text-xs font-black text-zinc-400 uppercase">Monitorado</div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Disciplines MIRROR VIEW */}
      <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] flex items-center gap-3 pl-2">
        <Layout size={18} className="text-yellow-400" />
        Visão Espelhada por Disciplina
      </h3>

      <div className="grid grid-cols-1 gap-4">
        {structure.disciplines.map(discipline => {
          const progress = stats.disciplineStats[discipline.id] || 0;
          return (
            <DisciplineItem 
              key={discipline.id}
              discipline={discipline}
              expandedDisciplines={expandedDisciplines}
              toggleDiscipline={toggleDiscipline}
              progress={progress}
              completedMetaIds={completedIds}
              activeUserMode={false}
              isReadOnly={true}
              metaLookup={metaLookup}
              planId={structure.planId}
              structure={structure}
              variant="circular"
              openNotebook={() => {}} // Read-only
            />
          );
        })}
      </div>
    </div>
  );
};

// Derived Data for Dashboard
  const dashboardData = useMemo(() => {
    if (!selectedStudent) return null;
    
    const realizedIds = new Set(studentAttempts.map(a => a.simulatedId));
    const realized = studentAttempts;
    const pending = planExams.filter(e => !realizedIds.has(e.id!));
    
    const avgScore = realized.length > 0 
      ? realized.reduce((acc, curr) => acc + curr.score, 0) / realized.length 
      : 0;

    return { realized, pending, avgScore };
  }, [selectedStudent, studentAttempts, planExams]);

  if (!linkedSimuladoClassId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800">
        <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 border border-zinc-700">
          <BarChart3 size={32} className="text-zinc-500" />
        </div>
        <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Sem Turma Vinculada</h3>
        <p className="text-zinc-500 max-w-sm text-sm">
          Este plano não possui uma turma de simulados vinculada. Vá na aba &apos;Visual&apos; para vincular uma turma e habilitar as análises pedagógicas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/30 backdrop-blur-md">
        <div className="flex items-center gap-4">
          {view !== 'STUDENTS' && (
            <button 
              onClick={menuBack}
              className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all transform active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-0.5">
              <Brain size={12} />
              <span>
                {view === 'STUDENTS' && "Gestão Estratégica de Turma"}
                {view === 'STUDENT_DASHBOARD' && "Perfil de Evolução do Aluno"}
                {view === 'ATTEMPT_DETAIL' && "Raio-X de Performance"}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
              {view === 'STUDENTS' && "Meus Alunos"}
              {view === 'STUDENT_DASHBOARD' && selectedStudent?.name}
              {view === 'ATTEMPT_DETAIL' && selectedAttempt?.simulatedTitle}
            </h2>
          </div>
        </div>

        {view === 'STUDENTS' && (
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text"
              placeholder="BUSCAR ALUNO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-xs font-bold text-white uppercase tracking-widest focus:border-yellow-400 outline-none transition-all placeholder:text-zinc-600"
            />
          </div>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-800">
        
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center py-20 opacity-50">
            <Loading />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-6 animate-pulse">Sincronizando Base de Dados...</span>
          </div>
        ) : (
          <>
            {/* LEVEL 1: STUDENT LIST - TABLE VIEW */}
            {view === 'STUDENTS' && (
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-zinc-900/50 border-b border-zinc-800">
                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] w-16">Foto</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Estudante</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Tempo de Estudo</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Status</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-20 text-center text-zinc-600 font-bold uppercase tracking-widest">
                            Nenhum aluno encontrado neste plano.
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map(student => (
                          <tr 
                            key={student.uid}
                            className="group hover:bg-zinc-800/40 transition-colors cursor-pointer"
                            onClick={() => handleSelectStudent(student)}
                          >
                            <td className="px-6 py-3">
                              <StudentAvatar student={student} size={36} onExpand={setExpandedPhotoUrl} />
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-white uppercase tracking-tighter group-hover:text-yellow-400 transition-colors">{student.name}</span>
                                <span className="text-[10px] text-zinc-500 lowercase font-medium">{student.email}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span className="text-xs font-mono font-black text-zinc-300">{formatStudyTime(student.lifetimeMinutes || 0)}</span>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black text-emerald-500 uppercase tracking-tighter">
                                ATIVO
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="inline-flex items-center justify-center p-2 rounded-xl bg-zinc-800 text-zinc-500 group-hover:bg-yellow-400 group-hover:text-black transition-all transform active:scale-90">
                                <ChevronRight size={16} />
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* LEVEL 2: STUDENT DASHBOARD */}
            {view === 'STUDENT_DASHBOARD' && dashboardData && (
              <div className="max-w-6xl mx-auto space-y-8 pb-20">
                {/* Student Identity Header */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 backdrop-blur-xl">
                  <StudentAvatar student={selectedStudent!} size={80} onExpand={setExpandedPhotoUrl} />
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-1">{selectedStudent?.name}</h3>
                    <p className="text-sm text-zinc-500 font-medium lowercase mb-4">{selectedStudent?.email}</p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-4">
                       <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                         <Clock size={12} className="text-yellow-400" /> {formatStudyTime(selectedStudent?.lifetimeMinutes || 0)} de estudo
                       </span>
                       <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                         <CheckCircle2 size={12} /> Aluno Ativo
                       </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Tabs Switcher */}
                <div className="flex p-1.5 bg-zinc-950/80 border border-zinc-900 rounded-2xl w-fit mx-auto sm:mx-0">
                  <button 
                    onClick={() => setSubTab('SIMULADOS')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all ${subTab === 'SIMULADOS' ? 'bg-zinc-800 text-yellow-400 border border-zinc-700 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Target size={14} />
                    SIMULADOS
                  </button>
                  <button 
                    onClick={() => setSubTab('SCHEDULE')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all ${subTab === 'SCHEDULE' ? 'bg-zinc-800 text-yellow-400 border border-zinc-700 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Calendar size={14} />
                    CRONOGRAMA
                  </button>
                  <button 
                    onClick={() => setSubTab('EDITAL')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all ${subTab === 'EDITAL' ? 'bg-zinc-800 text-yellow-400 border border-zinc-700 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <ListTodo size={14} />
                    EDITAL VERTICALIZADO
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {subTab === 'SIMULADOS' && (
                    <motion.div 
                      key="simulados"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      {/* Stats Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center gap-2">
                          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full">Simulados Realizados</span>
                          <div className="text-4xl font-black text-white">{dashboardData.realized.length}</div>
                          <div className="text-[10px] text-zinc-600 font-bold uppercase">de {planExams.length} disponíveis</div>
                        </div>
                        <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center gap-2">
                          <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-3 py-1 rounded-full">Simulados Pendentes</span>
                          <div className="text-4xl font-black text-white text-yellow-500">{dashboardData.pending.length}</div>
                          <div className="text-[10px] text-zinc-600 font-bold uppercase">ainda não realizados</div>
                        </div>
                        <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center gap-2">
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">Média Geral</span>
                          <div className="text-4xl font-black text-white">{dashboardData.avgScore.toFixed(1)}</div>
                          <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">pontuação líquida</div>
                        </div>
                      </div>

                      {/* Lists Section */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Realized List */}
                        <div>
                          <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            Histórico de Realizados
                          </h3>
                          <div className="space-y-4">
                            {dashboardData.realized.length === 0 ? (
                              <div className="p-10 border border-dashed border-zinc-800 rounded-3xl text-center text-zinc-600 text-xs font-bold uppercase">
                                Nenhum simulado realizado.
                              </div>
                            ) : (
                              dashboardData.realized.map(attempt => (
                                <div 
                                  key={attempt.id}
                                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-600 transition-all group flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-xl bg-zinc-800 flex flex-col items-center justify-center border border-zinc-700">
                                        <span className="text-[10px] font-black text-zinc-600 uppercase">Score</span>
                                        <span className={`text-sm font-black ${attempt.score > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{attempt.score}</span>
                                     </div>
                                     <div>
                                        <h4 className="text-sm font-black text-white uppercase tracking-tighter">{attempt.simulatedTitle}</h4>
                                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-bold mt-1 uppercase tracking-widest">
                                           <span className="flex items-center gap-1"><Calendar size={10} /> {attempt.completedAt?.toDate ? attempt.completedAt.toDate().toLocaleDateString() : 'Recent'}</span>
                                           <span className="flex items-center gap-1"><Clock size={10} /> Finalizado</span>
                                        </div>
                                     </div>
                                  </div>
                                  <button 
                                    onClick={() => handleSelectAttempt(attempt)}
                                    className="bg-zinc-800 text-white p-3 rounded-xl hover:bg-yellow-400 hover:text-black transition-all transform active:scale-90"
                                  >
                                    <ChevronRight size={20} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Pending List */}
                        <div>
                          <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <AlertCircle size={16} className="text-yellow-500" />
                            Simulados em Aberto
                          </h3>
                          <div className="space-y-4">
                            {dashboardData.pending.length === 0 ? (
                              <div className="p-10 border border-dashed border-zinc-800 rounded-3xl text-center text-zinc-600 text-xs font-bold uppercase">
                                Todos os simulados concluídos!
                              </div>
                            ) : (
                              dashboardData.pending.map(exam => (
                                <div 
                                  key={exam.id}
                                  className="bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-5 flex items-center gap-4 opacity-70 group hover:opacity-100 transition-all"
                                >
                                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700">
                                     <AlertCircle size={20} />
                                  </div>
                                  <div className="flex-1">
                                     <h4 className="text-sm font-black text-zinc-500 uppercase tracking-tighter group-hover:text-white transition-colors">{exam.title}</h4>
                                     <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Aguardando realização do aluno</p>
                                  </div>
                                  <div className="text-[9px] font-black text-zinc-700 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800 uppercase tracking-tighter">Pendente</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {subTab === 'SCHEDULE' && (
                    <motion.div 
                      key="schedule"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {selectedStudent && (
                        <StudyCalendar userId={selectedStudent.uid} isReadOnly={true} />
                      )}
                    </motion.div>
                  )}

                  {subTab === 'EDITAL' && (
                    <motion.div 
                      key="edital"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <StudentEditalReadOnly structure={edictStructure} completedIds={studentEditalProgress} metaLookup={metaLookup} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* LEVEL 3: ATTEMPT DETAIL - RAIO-X */}
            {view === 'ATTEMPT_DETAIL' && selectedAttempt && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-5 duration-500">
                {/* Performance Overview */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-[2.5rem] p-8 relative overflow-hidden backdrop-blur-xl">
                  {/* BG Decoration */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 blur-[100px] pointer-events-none" />
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                     <div className="text-center md:text-left flex flex-col justify-center">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.25em] mb-2">Desempenho Geral</div>
                        <div className="text-6xl font-black text-white tracking-tighter leading-none mb-2">{selectedAttempt.score.toFixed(1)}</div>
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pontos Líquidos</div>
                     </div>
                     
                     <div className="flex flex-col justify-center gap-4 border-l border-zinc-800 pl-8">
                        <div>
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Acertos</div>
                           <div className="text-xl font-bold text-emerald-500">{selectedAttempt.correctCount} / {selectedAttempt.totalQuestions}</div>
                        </div>
                        <div>
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Erros</div>
                           <div className="text-xl font-bold text-red-500">{selectedAttempt.wrongCount}</div>
                        </div>
                     </div>

                     <div className="flex flex-col justify-center gap-4 border-l border-zinc-800 pl-8">
                        <div>
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Tempo Gasto</div>
                           <div className="text-xl font-bold text-white">--:--</div>
                        </div>
                        <div>
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Posição Ranking</div>
                           <div className="text-xl font-bold text-yellow-400"># --</div>
                        </div>
                     </div>

                     <div className="flex flex-col items-center justify-center">
                        <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center p-4 ${selectedAttempt.isApproved ? 'border-emerald-500/20 text-emerald-500' : 'border-red-500/20 text-red-500'}`}>
                           <div className="text-center">
                              <Target size={24} className="mx-auto mb-1" />
                              <div className="text-[10px] font-black uppercase leading-tight font-serif italic">
                                {selectedAttempt.isApproved ? "Aprovado" : "Reprovado"}
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                </div>

                {/* Question Map */}
                {(selectedAttempt as any).autodiagnosis?.analysis ? (
                  <div className="space-y-6">
                    <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] pl-2 border-l-4 border-yellow-400">Mapa Estratégico por Disciplina</h3>
                    <div className="grid grid-cols-1 gap-6">
                      {Object.entries((selectedAttempt as any).autodiagnosis.analysis).map(([subject, data]: [string, any]) => (
                        <div key={subject} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 group hover:border-zinc-700 transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                             <div>
                                <h4 className="text-lg font-black text-white uppercase tracking-tighter">{subject}</h4>
                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Plano de ação baseado em autodiagnóstico</p>
                             </div>
                             <div className="flex gap-2">
                                <div className="text-center bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                                   <div className="text-[8px] font-black text-emerald-600 uppercase">Forte</div>
                                   <div className="text-sm font-black text-emerald-500">{data.strong}</div>
                                </div>
                                <div className="text-center bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-xl">
                                   <div className="text-[8px] font-black text-yellow-600 uppercase">Revisar</div>
                                   <div className="text-sm font-black text-yellow-500">{data.review}</div>
                                </div>
                                <div className="text-center bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-xl">
                                   <div className="text-[8px] font-black text-red-600 uppercase">Fraco</div>
                                   <div className="text-sm font-black text-red-500">{data.weak}</div>
                                </div>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {data.topicsToStudy?.length > 0 && (
                               <div className="bg-black/20 p-4 rounded-2xl border border-zinc-800/50">
                                  <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                     Estudar do Zero (Gaps de Conteúdo)
                                  </div>
                                  <div className="space-y-1.5">
                                    {data.topicsToStudy.map((t: string, i: number) => (
                                      <div key={i} className="text-xs text-zinc-400 font-medium pl-3 border-l border-zinc-800">{t}</div>
                                    ))}
                                  </div>
                               </div>
                             )}
                             {data.topicsToReview?.length > 0 && (
                               <div className="bg-black/20 p-4 rounded-2xl border border-zinc-800/50">
                                  <div className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                                     Revisar Detalhes (Falta de Atenção/Dúvida)
                                  </div>
                                  <div className="space-y-1.5">
                                    {data.topicsToReview.map((t: string, i: number) => (
                                      <div key={i} className="text-xs text-zinc-400 font-medium pl-3 border-l border-zinc-800">{t}</div>
                                    ))}
                                  </div>
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-20 text-center bg-zinc-900 border border-dashed border-zinc-800 rounded-[2.5rem]">
                     <AlertCircle size={40} className="text-zinc-700 mx-auto mb-4" />
                     <h3 className="text-sm font-black text-zinc-600 uppercase tracking-widest">O aluno ainda não preencheu o autodiagnóstico deste simulado.</h3>
                     <p className="text-[10px] text-zinc-700 font-bold uppercase mt-2">Os dados detalhados por assunto só estarão disponíveis após o preenchimento.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* LIGHTBOX MODAL */}
      {expandedPhotoUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setExpandedPhotoUrl(null)}
        >
          <button 
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white hover:bg-zinc-700 transition-all transform active:scale-90 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedPhotoUrl(null);
            }}
          >
            <X size={24} />
          </button>
          
          <div 
            className="relative max-w-4xl max-h-[85vh] group animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={expandedPhotoUrl} 
              alt="Expanded Profile" 
              className="w-full h-full object-contain rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-zinc-800"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
