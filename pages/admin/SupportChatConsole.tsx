import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MessageSquare, Send, CheckCircle2, 
  PlayCircle, Loader2, MoreVertical, CheckCheck,
  Paperclip, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supportService } from '../../services/supportService';
import { uploadSupportImage } from '../../services/storageService';
import { SupportTicket, TicketMessage, ProductType } from '../../types/support';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupportChatConsoleProps {
  productType: ProductType;
  productId: string;
  productName: string;
}

export const SupportChatConsole: React.FC<SupportChatConsoleProps> = ({ 
  productType, 
  productId, 
  productName 
}) => {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'open' | 'in_progress' | 'resolved'>('open');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to tickets for this product
  useEffect(() => {
    const unsubscribe = supportService.subscribeToProductTickets(productType, productId, (data) => {
      setTickets(data);
      // Update selected ticket if it exists in the data
      if (selectedTicket) {
        const updated = data.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    });
    return () => unsubscribe();
  }, [productType, productId]);

  // Subscribe to messages when a ticket is selected
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    const unsubscribe = supportService.subscribeToMessages(selectedTicket.id, (data) => {
      setMessages(data);
      // Mark as read when messages are loaded/updated and we're in the chat
      supportService.resetUnread(selectedTicket.id, true);
    });
    return () => unsubscribe();
  }, [selectedTicket?.id]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredTickets = tickets.filter(t => t.status === activeTab);

  const formatCollaboratorName = (fullName: string) => {
    if (!fullName) return 'Equipe';
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1]}`;
    }
    return parts[0];
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || !selectedTicket || !currentUser || isSending || isUploading) return;

    setIsSending(true);
    let imageUrl = '';

    try {
      if (selectedImage) {
        setIsUploading(true);
        imageUrl = await uploadSupportImage(selectedTicket.id, selectedImage);
        setIsUploading(false);
      }

      const senderRole = userProfile?.roles?.includes('admin') ? 'admin' : 'collaborator';
      
      let senderName = '';
      if (senderRole === 'admin') {
        senderName = 'ADM - INSANUS EDUCACIONAL';
      } else {
        const formattedName = formatCollaboratorName(userProfile?.name || 'Equipe');
        senderName = `${formattedName} (SUPORTE)`;
      }

      await supportService.sendMessage(selectedTicket.id, {
        senderId: currentUser.uid,
        senderRole,
        senderName,
        text: newMessage,
        imageUrl,
      }, true);
      
      setNewMessage('');
      setSelectedImage(null);
      setImagePreview(null);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 5MB');
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartService = async () => {
    if (!selectedTicket) return;
    await supportService.updateStatus(selectedTicket.id, 'in_progress');
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket || !window.confirm('Deseja concluir este atendimento?')) return;
    await supportService.updateStatus(selectedTicket.id, 'resolved');
    setSelectedTicket(null);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-250px)]">
      {/* Sidebar: Tickets List */}
      <div className="w-[400px] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shrink-0">
        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-zinc-800">
          {(['open', 'in_progress', 'resolved'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 ${
                activeTab === tab 
                  ? 'text-orange-500 border-orange-500 bg-orange-500/5' 
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {tab === 'open' ? 'Abertos' : tab === 'in_progress' ? 'Em Curso' : 'Finais'}
            </button>
          ))}
        </div>

        {/* Search & List */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Buscar aluno ou mensagem..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-all font-medium"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className={`w-full p-4 flex gap-4 text-left border-b border-zinc-800/50 transition-all hover:bg-zinc-800/20 ${
                selectedTicket?.id === ticket.id ? 'bg-zinc-800/40 border-l-4 border-l-orange-500' : ''
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center font-bold text-zinc-400 overflow-hidden text-sm uppercase">
                  {ticket.userProfile.photoUrl ? (
                    <img src={ticket.userProfile.photoUrl} alt={ticket.userProfile.name} className="w-full h-full object-cover" />
                  ) : (
                    ticket.userProfile.name[0]
                  )}
                </div>
                {ticket.unreadCountAdmin > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[10px] font-black text-white">
                    {ticket.unreadCountAdmin}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <h4 className="text-white font-bold text-sm truncate uppercase">{ticket.userProfile.name}</h4>
                  <span className="text-[10px] text-zinc-600 font-medium shrink-0">
                    {format(ticket.updatedAt, 'HH:mm', { locale: ptBR })}
                  </span>
                </div>
                <p className="text-zinc-500 text-xs truncate leading-snug">
                  {ticket.lastMessageSnippet}
                </p>
              </div>
            </button>
          ))}

          {filteredTickets.length === 0 && (
            <div className="p-12 text-center text-zinc-600 text-xs font-medium uppercase tracking-widest leading-relaxed">
              Sem chamados nesta categoria.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative">
        <AnimatePresence mode="wait">
          {selectedTicket ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full"
            >
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full border border-zinc-700 overflow-hidden flex items-center justify-center bg-zinc-800">
                    {selectedTicket.userProfile.photoUrl ? (
                      <img src={selectedTicket.userProfile.photoUrl} alt={selectedTicket.userProfile.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-zinc-500 text-sm font-bold uppercase">{selectedTicket.userProfile.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-white font-bold uppercase tracking-tight text-sm">{selectedTicket.userProfile.name}</h3>
                    <div className="flex items-center gap-2">
                       <span className="text-zinc-600 text-[10px] uppercase font-bold">{selectedTicket.userProfile.email}</span>
                       <span className="w-1 h-1 rounded-full bg-zinc-700" />
                       <span className="text-zinc-500 text-[10px] uppercase font-bold">{selectedTicket.productName}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {selectedTicket.status === 'open' ? (
                     <button 
                        onClick={handleStartService}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-2"
                     >
                       <PlayCircle size={14} /> Iniciar Atendimento
                     </button>
                  ) : selectedTicket.status === 'in_progress' ? (
                    <button 
                       onClick={handleResolveTicket}
                       className="px-4 py-2 bg-green-600/10 border border-green-500/20 text-green-500 text-[10px] font-black uppercase rounded-lg hover:bg-green-600/20 transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 size={14} /> Concluir Chamado
                    </button>
                  ) : (
                    <div className="px-3 py-1 bg-green-500/20 text-green-500 text-[10px] font-black uppercase rounded border border-green-500/30">
                      Resolvido
                    </div>
                  )}
                  <button className="p-2 text-zinc-600 hover:text-white transition-colors">
                    <MoreVertical size={20} />
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-fixed">
                <div className="flex justify-center mb-4">
                  <span className="px-4 py-1.5 bg-zinc-800/50 rounded-full text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                    Início do Atendimento em {format(selectedTicket.createdAt, "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>

                {messages.map((msg, index) => {
                  const isEquipe = msg.senderRole === 'admin' || msg.senderRole === 'collaborator';
                  const isPrevSameAuthor = index > 0 && messages[index-1].senderId === msg.senderId;

                  return (
                    <div 
                      key={msg.id}
                      className={`flex flex-col ${isEquipe ? 'items-end' : 'items-start'} ${isPrevSameAuthor ? '-mt-4' : ''}`}
                    >
                      {!isPrevSameAuthor && (
                        <div className={`flex items-center gap-2 mb-2 ${isEquipe ? 'flex-row-reverse' : ''}`}>
                          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-tight">
                            {msg.senderRole === 'student' ? msg.senderName.toUpperCase() : msg.senderName}
                          </span>
                        </div>
                      )}
                      
                      <div className={`max-w-[80%] group flex gap-2 items-end ${isEquipe ? 'flex-row-reverse' : ''}`}>
                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          isEquipe 
                            ? 'bg-orange-600 text-white rounded-tr-none' 
                            : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
                        }`}>
                          {msg.imageUrl && (
                            <div className="mb-2">
                              <img 
                                src={msg.imageUrl} 
                                alt="Anexo" 
                                className="max-w-[250px] md:max-w-sm rounded-lg cursor-pointer hover:opacity-90 transition-opacity border border-white/10"
                                onClick={() => window.open(msg.imageUrl, '_blank')}
                              />
                            </div>
                          )}
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                          <div className={`flex items-center gap-1 mt-1.5 ${isEquipe ? 'justify-end' : ''}`}>
                            <span className={`text-[9px] font-medium ${isEquipe ? 'text-white/60' : 'text-zinc-500'}`}>
                              {format(msg.createdAt, 'HH:mm')}
                            </span>
                            {isEquipe && <CheckCheck size={12} className="text-white/40" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Footer */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                {selectedTicket.status === 'open' ? (
                  <div className="flex flex-col items-center justify-center py-4 px-8 text-center bg-zinc-900 border border-dashed border-zinc-800 rounded-xl">
                    <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed mb-4">
                      O atendimento ainda não foi iniciado.<br/>Clique no botão acima para interagir.
                    </p>
                  </div>
                ) : selectedTicket.status === 'resolved' ? (
                  <div className="flex flex-col items-center justify-center py-4 px-8 text-center bg-green-500/5 border border-green-500/10 rounded-xl">
                    <p className="text-green-500 text-[11px] font-black uppercase tracking-widest">
                      Este atendimento foi concluído.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {imagePreview && (
                      <div className="flex px-4 py-2 border-b border-zinc-800 animate-in fade-in slide-in-from-bottom-2">
                        <div className="relative group">
                          <img src={imagePreview} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-zinc-700" />
                          <button 
                            type="button"
                            onClick={removeSelectedImage}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                          >
                            <X size={12} />
                          </button>
                          {isUploading && (
                            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                              <Loader2 size={16} className="animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <form onSubmit={handleSendMessage} className="flex gap-3">
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                      />
                      <div className="flex-1 relative">
                        <textarea 
                            rows={1}
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                              }
                            }}
                            placeholder="Escreva sua resposta..."
                            className="w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition-all resize-none custom-scrollbar pr-12 min-h-[56px] max-h-32"
                        />
                        <div className="absolute right-3 bottom-0 top-0 flex items-center gap-2">
                           <button 
                             type="button"
                             onClick={() => fileInputRef.current?.click()}
                             className="p-2 text-zinc-500 hover:text-white transition-colors"
                           >
                             <Paperclip size={20} />
                           </button>
                        </div>
                      </div>
                      <button 
                        type="submit"
                        disabled={(!newMessage.trim() && !selectedImage) || isSending || isUploading}
                        className="px-6 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl font-black uppercase text-[10px] transition-all flex items-center gap-2 shadow-lg shadow-orange-900/20"
                      >
                        {(isSending || isUploading) ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        Enviar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-zinc-800/50 flex items-center justify-center border border-zinc-800 mb-6 text-zinc-700 rotate-12 transition-transform hover:rotate-0 hover:scale-110">
                <MessageSquare size={48} />
              </div>
              <h3 className="text-zinc-400 font-black text-xs uppercase tracking-widest mb-1 truncate max-w-full px-4">
                {productName}
              </h3>
              <p className="text-zinc-600 text-[11px] font-bold uppercase tracking-widest max-w-[280px] leading-relaxed">
                Selecione um atendimento na lista ao lado para visualizar o histórico e responder ao aluno.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
