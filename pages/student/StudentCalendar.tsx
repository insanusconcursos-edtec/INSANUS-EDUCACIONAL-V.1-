
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Layout, Loader2, PauseCircle, Grid, X, PlayCircle, ChevronDown, Trophy, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getRangeSchedule, ScheduledEvent, generateSchedule, fetchFullPlanData } from '../../services/scheduleService';
import { getStudentConfig, getStudentCompletedMetas } from '../../services/studentService';
import toast from 'react-hot-toast';
import { PlanHeroBanner } from '../../components/student/PlanHeroBanner';

// Type Config for Visuals (Fallback)
const TYPE_CONFIG: Record<string, { label: string; color: string; }> = {
  lesson: { label: 'AULA', color: '#3b82f6' },       // Blue-500
  material: { label: 'PDF', color: '#f97316' },        // Orange-500
  questions: { label: 'QUESTÕES', color: '#10b981' }, // Emerald-500
  law: { label: 'LEI SECA', color: '#eab308' },            // Yellow-500
  review: { label: 'FLASHCARD', color: '#a855f7' },     // Purple-500 (Default standard review color)
  summary: { label: 'RESUMO', color: '#ec4899' },      // Pink-500
  simulado: { label: 'SIMULADO', color: '#EAB308' } // Yellow-500
};

// === COMPONENTE DE CARD INTERATIVO ===
const CalendarEventCard: React.FC<{ event: ScheduledEvent }> = ({ event }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // --- SPECIAL RENDER FOR SIMULADO (BLACK & GOLD) ---
  if (event.type === 'simulado') {
      return (
        <div className="p-3 mb-2 rounded-lg border border-yellow-600/50 bg-gradient-to-br from-gray-900 to-black shadow-lg relative overflow-hidden group hover:border-yellow-500 transition-all cursor-pointer">
            {/* Efeito Dourado Lateral */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
            
            <div className="flex justify-between items-start relative z-10 pl-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-wider bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20 inline-flex items-center gap-1">
                            <Trophy size={8} /> SIMULADO
                        </span>
                        {event.cycleName && (
                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider bg-zinc-800 text-zinc-500 border border-zinc-700">
                                {event.cycleName}
                            </span>
                        )}
                    </div>
                    <h4 className="text-white font-bold text-xs leading-tight line-clamp-2 uppercase tracking-tight">
                        {event.title}
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium flex items-center gap-1">
                        ⏱ {Math.floor(event.duration / 60)}h Prova
                    </p>
                </div>
            </div>
        </div>
      );
  }

  const defaultConfig = TYPE_CONFIG[event.type] || TYPE_CONFIG.lesson;
  const activeColor = event.color || defaultConfig.color;
  
  const isLesson = event.type === 'lesson';
  const isSpacedReview = event.isSpacedReview || (event.type === 'review' && !!event.originalEventId);
  
  const videos = event.videos || [];
  const videoCount = videos.length;
  
  const partInfo = event.part || (event.observation?.match(/Parte (\d+)/i)?.[1]);

  let reviewIndex = null;
  let reviewDays = null;
  
  if (isSpacedReview && event.reviewLabel) {
      const parts = event.reviewLabel.match(/REV\. (\d+) - (\d+) DIAS/);
      if (parts) {
          reviewIndex = parts[1];
          reviewDays = parts[2];
      }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const getReferenceBorderClass = (originType?: string) => {
    switch (originType) {
      case 'lesson': return 'border-l-blue-500';
      case 'questions': return 'border-l-orange-500';
      case 'law': return 'border-l-yellow-500';
      case 'material': return 'border-l-yellow-400';
      case 'summary': return 'border-l-purple-500';
      default: return null; 
    }
  };

  let containerClasses = "relative rounded-lg p-2.5 transition-all cursor-pointer flex flex-col gap-1 border-l-4 overflow-hidden ";
  const inlineStyles: React.CSSProperties = {};

  if (isSpacedReview) {
      containerClasses += "bg-cyan-950/40 border-y border-r border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(34,211,238,0.25)] hover:bg-cyan-950/60 hover:border-cyan-400/60 ";
      const borderClass = getReferenceBorderClass(event.originalType);
      
      if (event.referenceColor) {
          inlineStyles.borderLeftColor = event.referenceColor; 
      } else if (borderClass) {
          containerClasses += borderClass + " "; 
      } else {
          inlineStyles.borderLeftColor = "#22d3ee"; 
      }
  } else {
      containerClasses += "bg-zinc-900 border-y border-r border-zinc-800 hover:shadow-lg hover:border-zinc-700 ";
      inlineStyles.borderLeftColor = activeColor;
  }

  if (event.status === 'completed') {
      containerClasses += " opacity-50 grayscale hover:grayscale-0";
  } else {
      containerClasses += " opacity-100";
  }

  return (
    <div 
        className={containerClasses}
        style={inlineStyles}
        onClick={isLesson && videoCount > 0 ? handleToggle : undefined}
    >
        <div className="flex justify-between items-start">
            <div className="flex items-center gap-1 flex-wrap">
                <span 
                    className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider border ${
                        isSpacedReview 
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                            : 'text-white border-transparent'
                    }`}
                    style={!isSpacedReview ? { backgroundColor: activeColor } : {}}
                >
                    {isSpacedReview ? 'FLASHCARD ESPAÇADO' : defaultConfig.label}
                </span>
                
                {partInfo && (
                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider bg-white/10 text-white border border-white/20">
                        PT {partInfo}
                    </span>
                )}

                {event.cycleName && (
                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wider bg-zinc-800 text-zinc-500 border border-zinc-700">
                        {event.cycleName}
                    </span>
                )}

                {isSpacedReview && reviewIndex && (
                    <>
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider bg-cyan-950 text-cyan-400 border border-cyan-800 shadow-sm">
                            REV. {reviewIndex}
                        </span>
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider bg-black/40 text-cyan-500/70 border border-cyan-900/30">
                            {reviewDays} DIAS
                        </span>
                    </>
                )}
                
                {isSpacedReview && !reviewIndex && event.reviewLabel && (
                     <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {event.reviewLabel}
                    </span>
                )}

                {isLesson && videoCount > 0 && (
                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                       <PlayCircle size={8} /> {videoCount}
                    </span>
                )}
            </div>
            
            <span className={`text-[9px] font-mono font-bold whitespace-nowrap ml-1 flex items-center gap-1 ${isSpacedReview ? 'text-cyan-200/70' : 'text-zinc-500'}`}>
                {event.duration}m
            </span>
        </div>

        <div className="flex justify-between items-start mt-1">
             <div className="flex flex-col min-w-0">
                <h4 className={`text-[10px] font-bold uppercase leading-tight line-clamp-2 ${event.status === 'completed' ? 'text-zinc-500 line-through' : isSpacedReview ? 'text-cyan-50' : 'text-zinc-300'}`}>
                    {event.title}
                </h4>
                <p className={`text-[9px] mt-0.5 truncate uppercase ${isSpacedReview ? 'text-cyan-400/60' : 'text-zinc-600'}`}>
                    {event.disciplineName || event.discipline || 'Geral'}
                </p>
             </div>

             {isLesson && videoCount > 0 && (
                 <div className={`text-zinc-500 transform transition-transform duration-200 mt-1 ml-1 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={12} />
                 </div>
             )}
        </div>

        {isExpanded && isLesson && videoCount > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-800/50 animate-in slide-in-from-top-1 duration-200">
                <ul className="space-y-1">
                    {videos.map((vid, idx) => (
                        <li key={idx} className="flex items-center justify-between text-[9px] text-zinc-400 bg-zinc-950/30 p-1.5 rounded px-2 hover:bg-zinc-800/50 transition-colors">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="text-zinc-600 font-mono">{idx + 1}.</span>
                                <span className="truncate max-w-[120px] font-medium">{vid.title || `Aula ${idx + 1}`}</span>
                            </div>
                            <span className="opacity-50 font-mono ml-2 shrink-0">{vid.duration}m</span>
                        </li>
                    ))}
                </ul>
            </div>
        )}
    </div>
  );
};

const StudentCalendar: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  
  const [scheduleData, setScheduleData] = useState<Record<string, ScheduledEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const [selectedDayData, setSelectedDayData] = useState<{ date: Date; goals: ScheduledEvent[] } | null>(null);
  const [fullPlanData, setFullPlanData] = useState<any>(null);

  // Rolling Window State
  const [lastScheduledDate, setLastScheduledDate] = useState<string | null>(null);
  const [isPlanCompleted, setIsPlanCompleted] = useState(false);
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();
    
    const days = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const d = new Date(year, month, -i);
        days.push(d);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        days.push(d);
    }
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
        const d = new Date(year, month + 1, i);
        days.push(d);
    }
    return days;
  }, [currentDate]);

  useEffect(() => {
    if (!currentUser) return;

    const fetchCalendarData = async () => {
      setLoading(true);
      try {
        const config = await getStudentConfig(currentUser.uid);
        if (config?.isPlanPaused) {
            setIsPaused(true);
            setLoading(false);
            return;
        }
        setIsPaused(false);

        let start: Date, end: Date;
        if (viewMode === 'week') {
            start = weekDays[0];
            end = weekDays[6];
        } else {
            start = monthDays[0];
            end = monthDays[monthDays.length - 1];
        }

        const data = await getRangeSchedule(currentUser.uid, start, end);
        const activePlanId = config?.currentPlanId;
        setCurrentPlanId(activePlanId);
        setLastScheduledDate(config?.lastScheduledDate);

        // Check plan completion
        if (activePlanId) {
            const fullPlan = await fetchFullPlanData(activePlanId);
            setFullPlanData(fullPlan);
            const completedIdsSet = await getStudentCompletedMetas(currentUser.uid, activePlanId);
            
            let totalMetas = 0;
            fullPlan.disciplines?.forEach((disc: any) => {
                disc.topics?.forEach((topic: any) => {
                    totalMetas += (topic.metas?.length || 0);
                });
            });
            setIsPlanCompleted(totalMetas > 0 && completedIdsSet.size >= totalMetas);
        }
        
        // Sort each day's items to prioritize Spaced Reviews AND filter by activePlanId
        const sortedData: Record<string, ScheduledEvent[]> = {};
        
        // Get all dates in chronological order to process transitions correctly
        const allDates = Object.keys(data).sort();
        
        let lastTopicId: string | null = null;
        let lastCycleId: string | null = null;
        let hasPreviousItem = false;

        allDates.forEach(dateKey => {
            const rawItems = data[dateKey];
            
            // Filter by activePlanId to avoid overlapping tasks from different plans
            const filteredItems = activePlanId 
                ? rawItems.filter(item => item.planId === activePlanId)
                : rawItems;

            const spacedReviews = filteredItems.filter(item => item.isSpacedReview || (item.type === 'review' && !!item.originalEventId));
            const normalTasks = filteredItems.filter(item => !(item.isSpacedReview || (item.type === 'review' && !!item.originalEventId)));
            const dayItems = [...spacedReviews, ...normalTasks];

            // Add flags with cross-day context
            const itemsWithFlags = dayItems.map((item) => {
                const isAbsoluteStartOfCycle = item.disciplineOrder === 0 && item.subjectOrder === 0 && item.taskOrder === 0;
                const isNewTopic = !hasPreviousItem || item.topicId !== lastTopicId;
                const isNewCycle = (hasPreviousItem && item.cycleId !== lastCycleId) || isAbsoluteStartOfCycle;

                lastTopicId = item.topicId || null;
                lastCycleId = item.cycleId || null;
                hasPreviousItem = true;

                return {
                    ...item,
                    isNewTopic,
                    isNewCycle
                };
            });

            sortedData[dateKey] = itemsWithFlags;
        });

        setScheduleData(sortedData);
      } catch (error) {
        console.error("Erro ao buscar cronograma:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendarData();
  }, [currentUser, viewMode, currentDate, weekDays, monthDays]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
        newDate.setDate(currentDate.getDate() - 7);
    } else {
        newDate.setMonth(currentDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
        newDate.setDate(currentDate.getDate() + 7);
    } else {
        newDate.setMonth(currentDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date: Date) => {
    const dateKey = getISODate(date);
    const goals = scheduleData[dateKey] || [];
    setSelectedDayData({ date, goals });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const handleGenerateNextWeeks = async () => {
      if (!currentUser || !currentPlanId) return;
      setIsGeneratingNext(true);
      try {
          await generateSchedule(currentUser.uid, currentPlanId);
          toast.success("Próximas semanas geradas com sucesso!");
          // Trigger re-fetch
          setCurrentDate(new Date(currentDate)); 
      } catch (error) {
          console.error("Erro ao gerar próximas semanas:", error);
          toast.error("Erro ao gerar próximas semanas.");
      } finally {
          setIsGeneratingNext(false);
      }
  };

  const getDayName = (date: Date) => date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const getDayNumber = (date: Date) => date.getDate().toString().padStart(2, '0');
  const getMonthLabel = (date: Date) => date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  
  const getISODate = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
  };

  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Loader2 size={40} className="animate-spin text-brand-red" />
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Carregando calendário...</p>
        </div>
    );
  }

  if (isPaused) {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-zinc-900/20 rounded-2xl border border-zinc-800 border-dashed animate-in fade-in">
        <div className="bg-yellow-500/10 p-6 rounded-full mb-6 border border-yellow-500/20 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
           <PauseCircle className="w-16 h-16 text-yellow-500" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">PLANO PAUSADO!</h2>
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest mb-6">SEM METAS AGENDADAS</p>
        <button 
            onClick={() => navigate('/app/config')}
            className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-yellow-900/20"
        >
            Vá para Configurações
        </button>
      </div>
    );
  }

  return (
    // Height constrained to viewport minus header/margins to force internal scrolling
    <div className="relative w-full min-h-screen bg-zinc-950 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {fullPlanData && (
        <PlanHeroBanner currentTab="calendar" planData={fullPlanData} />
      )}

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-4 md:px-8 pt-8 md:pt-12 flex-1 flex flex-col mb-10 -mt-10 md:-mt-20">
        {/* HEADER SECTION */}
        <div className="flex-none flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none flex items-center gap-3">
            <CalendarIcon size={28} className="text-zinc-600" />
            Calendário
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-brand-red uppercase tracking-widest">
                {viewMode === 'week' ? 'Visualização Semanal' : 'Visualização Mensal'}
            </span>
            <span className="text-zinc-600 text-xs font-mono uppercase border-l border-zinc-800 pl-2">
                {getMonthLabel(currentDate)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800/50">
            <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800">
                <button 
                    onClick={() => setViewMode('week')}
                    className={`px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'week' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Layout size={12} />
                    Semanal
                </button>
                <button 
                    onClick={() => setViewMode('month')}
                    className={`px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'month' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    <Grid size={12} />
                    Mensal
                </button>
            </div>

            <div className="w-px h-6 bg-zinc-800"></div>

            <div className="flex items-center gap-1">
                <button onClick={handlePrev} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                </button>
                <button onClick={handleToday} className="px-3 py-1.5 hover:bg-zinc-800 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white uppercase transition-colors">
                    Hoje
                </button>
                <button onClick={handleNext} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
      </div>

      {/* CTA ROLLING WINDOW */}
      {lastScheduledDate && !isPlanCompleted && new Date(lastScheduledDate) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
        <div className="mb-4 bg-gradient-to-r from-brand-red/20 to-transparent border border-brand-red/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-red/20 text-brand-red rounded-full">
                    <Trophy size={20} />
                </div>
                <div>
                    <h3 className="text-white font-black text-sm uppercase tracking-tighter">Ciclo Concluído!</h3>
                    <p className="text-zinc-400 text-[10px] uppercase tracking-widest">Gere as próximas semanas para continuar.</p>
                </div>
            </div>
            <button 
                onClick={handleGenerateNextWeeks}
                disabled={isGeneratingNext}
                className="w-full md:w-auto px-4 py-2 bg-brand-red hover:bg-red-600 text-white font-black text-[10px] rounded-lg uppercase tracking-wider transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {isGeneratingNext ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Gerando...</>
                ) : (
                    <><RefreshCw className="w-3 h-3" /> Gerar Próximas Semanas</>
                )}
            </button>
        </div>
      )}

      {/* CALENDAR BODY */}
      <div className="flex-1 min-h-[600px] lg:min-h-[800px] border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950 flex flex-col shadow-xl">
        
        {viewMode === 'week' && (
            <div className="grid grid-flow-col auto-cols-[85vw] sm:auto-cols-[45vw] lg:auto-cols-fr landscape:auto-cols-[40vw] md:landscape:auto-cols-fr overflow-x-auto snap-x snap-mandatory pb-4 hide-scrollbar flex-1 min-h-0">
                {weekDays.map((day, index) => {
                    const active = isToday(day);
                    const dateKey = getISODate(day);
                    const dayEvents = scheduleData[dateKey] || [];

                    return (
                        <div 
                            key={index} 
                            className="flex flex-col border-r border-zinc-800/50 last:border-r-0 snap-center lg:snap-none min-w-[280px] lg:min-w-0 h-full"
                        >
                            {/* Header Part */}
                            <div className={`py-4 flex flex-col items-center justify-center border-b border-zinc-800 flex-none relative ${active ? 'bg-gradient-to-b from-brand-red/10 to-transparent' : 'bg-zinc-900/30'}`}>
                                {active && <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand-red shadow-[0_0_10px_red]"></div>}
                                <span className={`text-[9px] font-black uppercase tracking-widest mb-1 ${active ? 'text-brand-red' : 'text-zinc-500'}`}>
                                    {getDayName(day)}
                                </span>
                                <span className={`text-2xl font-black ${active ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'text-zinc-400'}`}>
                                    {getDayNumber(day)}
                                </span>
                            </div>

                            {/* Content Part */}
                            <div className={`flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent ${active ? 'bg-zinc-900/10' : 'hover:bg-zinc-900/20'}`}>
                                {dayEvents.length > 0 ? (
                                    dayEvents.map((event) => {
                                        const isNewCycle = event.isNewCycle;
                                        const isNewTopic = event.isNewTopic;

                                        return (
                                            <React.Fragment key={event.id}>
                                                {isNewCycle && (
                                                    <div className="w-full flex flex-col items-center my-4 opacity-90 px-1" title="Mudança de Ciclo">
                                                        <div className="w-full h-px border-t border-solid border-white/40 mb-1"></div>
                                                        <span className="text-[10px] text-white/80 font-bold text-center uppercase tracking-widest">
                                                            {event.cycleName ? `INÍCIO: ${event.cycleName}` : "NOVO CICLO"}
                                                        </span>
                                                        <div className="w-full h-px border-t border-solid border-white/40 mt-1"></div>
                                                    </div>
                                                )}
                                                {isNewTopic && event.topicName && (
                                                    <div className="w-full flex flex-col items-center gap-1 my-4 px-1">
                                                        <div className="flex items-center w-full gap-2">
                                                            <div className="h-px border-t border-dashed border-red-500/30 flex-1"></div>
                                                            <span className="text-[7px] font-black text-red-500 uppercase tracking-[0.2em]">Novo Tópico</span>
                                                            <div className="h-px border-t border-dashed border-red-500/30 flex-1"></div>
                                                        </div>
                                                        <div className="flex flex-col items-center text-center">
                                                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider leading-tight">
                                                                {event.disciplineName || event.discipline || 'Geral'}
                                                            </span>
                                                            <span className="text-[9px] font-black text-zinc-200 uppercase tracking-tight leading-tight mt-0.5 break-words max-w-full">
                                                                {event.topicName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex-shrink-0">
                                                    <CalendarEventCard event={event} />
                                                </div>
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity min-h-[100px]">
                                        <span className="text-[9px] font-bold text-zinc-800 uppercase">Livre</span>
                                    </div>
                                )}

                                {dateKey === lastScheduledDate && (
                                    <div className="mt-6 flex flex-col items-center w-full px-2 opacity-90 animate-in fade-in zoom-in-95 duration-500">
                                        <div className="w-full h-px border-t border-dashed border-brand-red mb-3"></div>
                                        <span className="text-[10px] text-brand-red font-orbitron font-bold text-center uppercase tracking-widest">
                                            FIM DA FASE ATUAL
                                        </span>
                                        <span className="text-[9px] text-zinc-500 text-center mt-1 uppercase">
                                            Conclua as metas para liberar a próxima fase
                                        </span>
                                        <div className="w-full h-px border-t border-dashed border-brand-red mt-3"></div>
                                    </div>
                                )}

                                <div className="h-12 w-full flex-none" />
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        {viewMode === 'month' && (
            <>
                <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/50 flex-none">
                    {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => (
                        <div key={d} className="py-2 text-center text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            {d}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 grid-rows-6 flex-1 bg-zinc-950 min-h-0 overflow-hidden">
                    {monthDays.map((day, index) => {
                        const dateKey = getISODate(day);
                        const dayEvents = scheduleData[dateKey] || [];
                        const active = isToday(day);
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const completedCount = dayEvents.filter(e => e.status === 'completed').length;
                        const totalCount = dayEvents.length;

                        return (
                            <div 
                                key={index}
                                onClick={() => handleDayClick(day)}
                                className={`
                                    border-r border-b border-zinc-800/50 relative p-2 transition-colors cursor-pointer flex flex-col gap-1
                                    ${!isCurrentMonth ? 'bg-zinc-950/80 opacity-40' : 'hover:bg-zinc-900/40'}
                                    ${active ? 'bg-zinc-900/30 ring-1 ring-inset ring-brand-red/30' : ''}
                                `}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={`text-xs font-bold ${active ? 'text-brand-red' : (isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600')}`}>
                                        {day.getDate()}
                                    </span>
                                    {totalCount > 0 && (
                                        <span className="text-[9px] font-mono text-zinc-500">
                                            {completedCount}/{totalCount}
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 flex flex-col gap-1 overflow-hidden mt-1">
                                    {dayEvents.length > 0 && (() => {
                                        let showMonthDivider = false;
                                        if (index > 0) {
                                            const prevDayKey = getISODate(monthDays[index - 1]);
                                            const prevDayEvents = scheduleData[prevDayKey] || [];
                                            if (prevDayEvents.length > 0) {
                                                const lastOfPrev = prevDayEvents[prevDayEvents.length - 1];
                                                showMonthDivider = dayEvents[0].topicId !== lastOfPrev.topicId;
                                            }
                                        }
                                        
                                        if (showMonthDivider && dayEvents[0].topicName) {
                                            return (
                                                <div className="flex flex-col mb-1 border-b border-red-500/20 pb-1">
                                                    <span className="text-[6px] font-black text-red-500/70 uppercase tracking-tighter">Novo Tópico</span>
                                                    <span className="text-[7px] font-bold text-zinc-500 uppercase truncate">
                                                        {dayEvents[0].disciplineName || dayEvents[0].discipline || 'Geral'}
                                                    </span>
                                                    <span className="text-[7px] font-black text-zinc-300 uppercase leading-none break-words">
                                                        {dayEvents[0].topicName}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    {dayEvents.slice(0, 3).map(event => {
                                        // Visual diferenciado para simulado no mês (ponto amarelo)
                                        if (event.type === 'simulado') {
                                            return (
                                                <div 
                                                    key={event.id}
                                                    className="h-1.5 w-full rounded-full bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]"
                                                    style={{ opacity: event.status === 'completed' ? 0.3 : 1 }}
                                                />
                                            );
                                        }
                                        const defaultConfig = TYPE_CONFIG[event.type] || TYPE_CONFIG.lesson;
                                        const activeColor = event.color || defaultConfig.color;
                                        return (
                                            <div 
                                                key={event.id}
                                                className="h-1.5 w-full rounded-full"
                                                style={{ backgroundColor: activeColor, opacity: event.status === 'completed' ? 0.3 : 1 }}
                                            ></div>
                                        );
                                    })}
                                    {dayEvents.length > 3 && (
                                        <div className="text-[9px] text-zinc-600 font-bold text-center">
                                            +{dayEvents.length - 3} mais
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        )}
      </div>
      {selectedDayData && createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => setSelectedDayData(null)}
        >
            <div 
                className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                    <div>
                        <h3 className="text-lg font-black text-white capitalize tracking-tight leading-none">
                            {selectedDayData.date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', weekday: 'long' })}
                        </h3>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">
                            {selectedDayData.goals.length} metas agendadas
                        </p>
                    </div>
                    <button onClick={() => setSelectedDayData(null)} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3 custom-scrollbar flex-1 bg-zinc-950/30">
                    {selectedDayData.goals.length === 0 ? (
                        <div className="text-center py-8 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                            <span className="text-[10px] uppercase font-bold">Nenhuma meta para este dia.</span>
                        </div>
                    ) : (
                        selectedDayData.goals.map((goal) => (
                            <CalendarEventCard key={goal.id} event={goal} />
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );
};

export default StudentCalendar;