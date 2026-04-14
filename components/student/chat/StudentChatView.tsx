import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, User, MessageSquare, Loader2, CheckCheck, Headphones, ArrowLeft, Smile, Paperclip
} from 'lucide-react';
import { getOrCreateCall, subscribeToMessages, sendMessage } from '../../../services/chatService';
import { getMentorById } from '../../../services/mentorService';
import { Mentor, Message } from '../../../types/chat';
import { useAuth } from '../../../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StudentChatViewProps {
  planId: string;
  linkedMentorIds: string[];
}

const StudentChatView: React.FC<StudentChatViewProps> = ({ planId, linkedMentorIds }) => {
  const { currentUser } = useAuth();
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch linked mentors
  useEffect(() => {
    const fetchMentors = async () => {
      setLoading(true);
      try {
        const mentorPromises = linkedMentorIds.map(id => getMentorById(id));
        const results = await Promise.all(mentorPromises);
        setMentors(results.filter((m): m is Mentor => m !== null));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (linkedMentorIds.length > 0) {
      fetchMentors();
    } else {
      setLoading(false);
    }
  }, [linkedMentorIds]);

  // Handle mentor selection and call creation
  const handleSelectMentor = async (mentor: Mentor) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const id = await getOrCreateCall(
        planId,
        currentUser.uid,
        currentUser.name || 'Aluno',
        mentor.id,
        mentor.name,
        currentUser.photoUrl,
        mentor.photoUrl
      );
      setCallId(id);
      setSelectedMentor(mentor);
    } catch (error) {
      console.error(error);
      alert("Erro ao abrir conversa.");
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to messages
  useEffect(() => {
    if (!callId) return;

    const unsubscribe = subscribeToMessages(callId, (updatedMessages) => {
      setMessages(updatedMessages);
    });
    return () => unsubscribe();
  }, [callId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callId || !currentUser || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(callId, currentUser.uid, 'student', newMessage.trim());
      setNewMessage('');
    } catch (error) {
      console.error(error);
      alert("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'HH:mm', { locale: ptBR });
  };

  if (loading && !selectedMentor) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-brand-red" size={32} />
        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Carregando mentores...</p>
      </div>
    );
  }

  if (!selectedMentor) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Headphones size={32} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Central de Dúvidas</h2>
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest mt-2">Escolha um mentor para iniciar seu atendimento</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {mentors.map(mentor => (
            <div 
              key={mentor.id}
              onClick={() => handleSelectMentor(mentor)}
              className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex items-center gap-6 cursor-pointer hover:border-brand-red hover:bg-zinc-800 transition-all group shadow-lg"
            >
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-brand-red/50 transition-colors">
                <img src={mentor.photoUrl} alt={mentor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-white uppercase tracking-tight group-hover:text-brand-red transition-colors">{mentor.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Disponível agora</span>
                </div>
                <button className="mt-4 text-[10px] font-black text-white bg-zinc-800 px-4 py-2 rounded-lg uppercase tracking-widest group-hover:bg-brand-red transition-all">
                  Iniciar Chat
                </button>
              </div>
            </div>
          ))}
          {mentors.length === 0 && (
            <div className="col-span-full text-center py-20 border-2 border-dashed border-zinc-800 rounded-3xl">
              <p className="text-zinc-500 text-xs font-bold uppercase">Nenhum mentor vinculado a este plano.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-250px)] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      {/* Chat Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSelectedMentor(null)}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden">
            <img src={selectedMentor.photoUrl} alt={selectedMentor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight">{selectedMentor.name}</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Mentor Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        {messages.map((msg, idx) => {
          const isMe = msg.senderRole === 'student';
          return (
            <div 
              key={msg.id || idx}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
            >
              <div className={`max-w-[80%] rounded-2xl p-3 shadow-lg ${
                isMe 
                  ? 'bg-brand-red text-white rounded-tr-none' 
                  : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700'
              }`}>
                <p className="text-xs font-medium leading-relaxed">{msg.text}</p>
                <div className={`flex items-center justify-end gap-1 mt-1 opacity-60`}>
                  <span className="text-[9px] font-mono">{formatTime(msg.timestamp)}</span>
                  {isMe && <CheckCheck size={12} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3">
          <button type="button" className="text-zinc-500 hover:text-white transition-colors"><Smile size={20} /></button>
          <button type="button" className="text-zinc-500 hover:text-white transition-colors"><Paperclip size={20} /></button>
          <div className="flex-1 relative">
            <input 
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Descreva sua dúvida aqui..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-xs text-white placeholder-zinc-700 focus:border-brand-red focus:outline-none"
            />
          </div>
          <button 
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="w-12 h-12 bg-brand-red hover:bg-red-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20 transition-all disabled:opacity-50 disabled:scale-95"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StudentChatView;
