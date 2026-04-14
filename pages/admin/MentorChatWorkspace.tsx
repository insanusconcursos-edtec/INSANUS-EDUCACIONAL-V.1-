import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Send, User, MessageSquare, Loader2, CheckCheck, Clock, Phone, Video, MoreVertical, Paperclip, Smile
} from 'lucide-react';
import { subscribeToCalls, subscribeToMessages, sendMessage, markAsRead } from '../../services/chatService';
import { Call, Message } from '../../types/chat';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MentorChatWorkspaceProps {
  planId?: string;
}

const MentorChatWorkspace: React.FC<MentorChatWorkspaceProps> = ({ planId }) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to all calls (for admin/mentor workspace)
  useEffect(() => {
    const unsubscribe = subscribeToCalls('', (updatedCalls) => {
      setCalls(updatedCalls);
      setLoading(false);
    }, planId);
    return () => unsubscribe();
  }, [planId]);

  // Subscribe to messages when a call is selected
  useEffect(() => {
    if (!selectedCall) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(selectedCall.id, (updatedMessages) => {
      setMessages(updatedMessages);
      markAsRead(selectedCall.id);
    });
    return () => unsubscribe();
  }, [selectedCall]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCall || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(selectedCall.id, selectedCall.mentorId, 'mentor', newMessage.trim());
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

  return (
    <div className="h-full flex bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
      
      {/* Sidebar - Call List */}
      <div className="w-80 border-right border-zinc-800 flex flex-col bg-zinc-900/30">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-4">Central de Dúvidas</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-zinc-600" />
            <input 
              placeholder="Buscar conversa..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-700 focus:border-brand-red focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-brand-red" />
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-10 px-4">
              <MessageSquare size={32} className="mx-auto text-zinc-800 mb-2" />
              <p className="text-zinc-600 text-[10px] font-bold uppercase">Nenhuma conversa ativa</p>
            </div>
          ) : (
            calls.map(call => (
              <div 
                key={call.id}
                onClick={() => setSelectedCall(call)}
                className={`p-4 flex items-center gap-3 cursor-pointer transition-all border-b border-zinc-800/50 hover:bg-zinc-800/30 ${
                  selectedCall?.id === call.id ? 'bg-zinc-800/50 border-l-4 border-l-brand-red' : ''
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden">
                    {call.studentPhotoUrl ? (
                      <img src={call.studentPhotoUrl} alt={call.studentName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black">
                        {call.studentName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  {call.unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-brand-red text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg">
                      {call.unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-xs font-black text-white uppercase truncate">{call.studentName}</h3>
                    <span className="text-[9px] text-zinc-600 font-mono">{formatTime(call.lastMessageTime)}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate font-medium">
                    {call.lastMessage || 'Inicie uma conversa...'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 relative">
        {selectedCall ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden">
                  {selectedCall.studentPhotoUrl ? (
                    <img src={selectedCall.studentPhotoUrl} alt={selectedCall.studentName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-black text-xs">
                      {selectedCall.studentName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">{selectedCall.studentName}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-zinc-500">
                <button className="hover:text-white transition-colors"><Phone size={18} /></button>
                <button className="hover:text-white transition-colors"><Video size={18} /></button>
                <button className="hover:text-white transition-colors"><Search size={18} /></button>
                <button className="hover:text-white transition-colors"><MoreVertical size={18} /></button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
              {messages.map((msg, idx) => {
                const isMentor = msg.senderRole === 'mentor';
                return (
                  <div 
                    key={msg.id || idx}
                    className={`flex ${isMentor ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                  >
                    <div className={`max-w-[70%] rounded-2xl p-3 shadow-lg ${
                      isMentor 
                        ? 'bg-brand-red text-white rounded-tr-none' 
                        : 'bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700'
                    }`}>
                      <p className="text-xs font-medium leading-relaxed">{msg.text}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 opacity-60`}>
                        <span className="text-[9px] font-mono">{formatTime(msg.timestamp)}</span>
                        {isMentor && <CheckCheck size={12} />}
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
                    placeholder="Digite sua resposta..."
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 shadow-inner">
              <MessageSquare size={40} className="text-zinc-700" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Selecione uma conversa</h2>
            <p className="text-zinc-500 text-xs max-w-xs font-medium">
              Escolha um aluno na lista ao lado para iniciar o atendimento em tempo real.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MentorChatWorkspace;
