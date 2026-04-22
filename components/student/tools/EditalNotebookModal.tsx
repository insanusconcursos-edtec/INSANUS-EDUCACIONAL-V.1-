
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Plus, FileText, Trash2, Save, 
  Loader2, AlertCircle, BookOpen, AlertTriangle, StickyNote,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { notebookService, EditalNote, NoteType } from '../../../services/notebookService';
import { TipTapEditor } from '../../ui/TipTapEditor';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import { InsanusPdfViewer } from './InsanusPdfViewer';
import toast from 'react-hot-toast';

interface NotebookEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  editalNodeId: string;
  type: NoteType;
  topicTitle: string;
  materials?: any[];
}

export const EditalNotebookModal: React.FC<NotebookEditorModalProps> = ({
  isOpen,
  onClose,
  planId,
  editalNodeId,
  type,
  topicTitle,
  materials = []
}) => {
  const { currentUser } = useAuth();
  
  // Data State
  const [notes, setNotes] = useState<EditalNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<EditalNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // UI State
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'materials'>('notes');
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  // Deletion State
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load notes on mount/open
  useEffect(() => {
    if (isOpen && currentUser) {
      loadNotes();
    }
  }, [isOpen, currentUser, editalNodeId, type]);

  const loadNotes = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const data = await notebookService.getNotes(currentUser.uid, planId, editalNodeId, type);
      setNotes(data);
      if (data.length > 0) {
        handleSelectNote(data[0]);
      } else {
        handleNewNote();
      }
    } catch (error) {
      console.error("Erro ao carregar cadernos:", error);
      toast.error("Erro ao carregar anotações");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNote = (note: EditalNote) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setTitle('');
    setContent('');
  };

  const handleSave = async () => {
    if (!currentUser) return;
    if (!title.trim()) {
      toast.error("Insira um título para a anotação");
      return;
    }

    setIsSaving(true);
    try {
      if (selectedNote?.id) {
        // Update
        await notebookService.updateNote(selectedNote.id, { 
          title: title.trim(), 
          content 
        });
        toast.success("Anotação atualizada");
      } else {
        // Create
        const newNoteId = await notebookService.saveNote({
          userId: currentUser.uid,
          planId,
          editalNodeId,
          type,
          title: title.trim(),
          content
        });
        toast.success("Nova anotação salva");
        // Update local state is better by reloading
      }
      await loadNotes();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar anotação");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!noteToDelete) return;
    setIsDeleting(true);
    try {
      await notebookService.deleteNote(noteToDelete);
      toast.success("Anotação excluída");
      setNoteToDelete(null);
      await loadNotes();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const isErrorNotebook = type === 'error';

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-[#09090b] flex flex-col md:flex-row overflow-hidden animate-in fade-in duration-300">
      
      <div className="relative w-full h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 transition-all">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/10 bg-[#121214] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isErrorNotebook ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}`}>
              {isErrorNotebook ? <AlertTriangle size={24} /> : <BookOpen size={24} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight leading-tight">
                {isErrorNotebook ? 'Caderno de Erros' : 'Caderno de Anotações'}
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-0.5">
                Tópico: {topicTitle}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* Main Content (Split Layout) */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* Sidebar Toggle (Open) - Only visible when sidebar is closed */}
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="absolute left-4 top-4 z-40 p-2 bg-[#121214] border border-white/10 rounded-lg text-zinc-400 hover:text-white shadow-xl transition-all animate-in fade-in slide-in-from-left-4 duration-300"
              title="Abrir Menu"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}

          {/* Sidebar (List) */}
          <div className={`relative flex flex-col h-full bg-[#0c0c0e] border-r border-white/10 transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
            isSidebarOpen 
              ? 'w-full md:w-[280px] lg:w-[320px] opacity-100' 
              : 'w-0 opacity-0 border-r-0'
          } ${activePdfUrl && !isSidebarOpen ? 'hidden md:flex' : 'flex'}`}>
            
            {/* Inner Fixed-Width Container to prevent layout break during animation */}
            <div className="w-full md:w-[280px] lg:w-[320px] h-full flex flex-col shrink-0">
              {/* TABS HEADER */}
              <div className="flex items-center border-b border-white/10 bg-[#0f0f11]">
                <div className="flex-1 flex">
                  <button 
                    onClick={() => setSidebarTab('notes')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'notes' ? 'text-white border-b-2 border-red-600' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    Anotações
                  </button>
                  <button 
                    onClick={() => setSidebarTab('materials')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'materials' ? 'text-white border-b-2 border-red-600' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    Materiais ({materials.length})
                  </button>
                </div>
                
                {/* Close Sidebar Button */}
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-3 text-zinc-600 hover:text-white transition-colors"
                  title="Esconder Menu"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>

              {sidebarTab === 'notes' ? (
              <>
                <div className="p-4 border-b border-white/5">
                  <button 
                    onClick={handleNewNote}
                    className="w-full py-2.5 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    <Plus size={16} />
                    Nova Anotação
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <Loader2 className="animate-spin text-zinc-600" size={20} />
                      <span className="text-[10px] text-zinc-600 font-bold uppercase">Carregando...</span>
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-[10px] text-zinc-600 font-bold uppercase">Nenhuma anotação vinculada.</p>
                    </div>
                  ) : (
                    notes.map(note => (
                      <div 
                        key={note.id}
                        onClick={() => handleSelectNote(note)}
                        className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          selectedNote?.id === note.id 
                            ? 'bg-white/10 border-white/20' 
                            : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                        }`}
                      >
                        <FileText size={16} className={selectedNote?.id === note.id ? 'text-white' : 'text-zinc-600'} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${selectedNote?.id === note.id ? 'text-white' : 'text-zinc-500'}`}>
                            {note.title}
                          </p>
                          <p className="text-[9px] text-zinc-600 mt-0.5">
                            {note.updatedAt?.toDate?.() ? new Date(note.updatedAt.toDate()).toLocaleDateString() : 'Agora'}
                          </p>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setNoteToDelete(note.id!);
                          }}
                          className="p-1.5 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
                {materials.length === 0 ? (
                    <div className="text-center py-10 px-4">
                        <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-3">
                            <AlertCircle size={20} className="text-zinc-700" />
                        </div>
                        <p className="text-[10px] text-zinc-600 font-bold uppercase leading-tight">Nenhum material PDF vinculado a este tópico.</p>
                    </div>
                ) : (
                    materials.map((mat, idx) => (
                        <div 
                            key={idx}
                            onClick={() => setActivePdfUrl(mat.url)}
                            className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                activePdfUrl === mat.url 
                                  ? 'bg-red-500/10 border-red-500/30' 
                                  : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                            }`}
                        >
                            <div className="p-1.5 bg-zinc-900 rounded border border-white/5">
                                <BookOpen size={14} className={activePdfUrl === mat.url ? 'text-red-500' : 'text-zinc-500'} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${activePdfUrl === mat.url ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {mat.name}
                                </p>
                                <p className="text-[9px] text-zinc-600 font-mono truncate">
                                    {mat.goalContext || 'PDF DOCUMENT'}
                                </p>
                            </div>
                        </div>
                    ))
                )}
              </div>
            )}
          </div>
        </div>

          {/* Editor Area / PDF View Area */}
          <div className="flex-1 flex overflow-hidden bg-[#09090b] transition-all duration-300">
             
             {/* PDF Viewer Column (Desktop Side-by-Side) */}
             {activePdfUrl && (
                <div className={`flex-1 flex flex-col border-r border-white/5 bg-[#121214] animate-in slide-in-from-left duration-300 shrink-0 ${activePdfUrl ? 'w-full md:w-1/2' : 'w-0 overflow-hidden'}`}>
                    <div className="flex items-center justify-between p-3 border-b border-white/10 bg-black/40">
                         <div className="flex items-center gap-2">
                             <FileText size={14} className="text-red-500" />
                             <span className="text-[10px] font-black uppercase text-zinc-400">Visualizador de Material</span>
                         </div>
                         <button 
                            onClick={() => setActivePdfUrl(null)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-all flex items-center gap-1.5 text-[9px] font-bold uppercase"
                         >
                            <X size={14} />
                            Fechar
                         </button>
                    </div>
                    <div className="flex-1 bg-zinc-900 relative overflow-hidden">
                        <InsanusPdfViewer url={activePdfUrl} />
                    </div>
                </div>
             )}

             {/* Editor Column */}
             <div className={`flex-1 flex flex-col relative transition-all ${activePdfUrl ? 'w-full md:w-1/2 hidden md:flex' : 'w-full flex'}`}>
                {/* Title Input */}
                <div className="p-6 pb-2 shrink-0">
                    <input 
                      type="text" 
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Título da sua anotação..."
                      className="w-full bg-transparent border-none text-2xl font-black text-white focus:outline-none placeholder:text-zinc-800 tracking-tight"
                    />
                </div>

                {/* Editor */}
                <div className="flex-1 p-6 pt-2 overflow-hidden flex flex-col">
                    <TipTapEditor 
                      content={content} 
                      onChange={setContent}
                      placeholder="Comece a escrever aqui..."
                    />
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-[#121214] border-t border-white/5 flex justify-end shrink-0">
                    <button 
                      onClick={handleSave}
                      disabled={isSaving || !title.trim()}
                      className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white rounded-xl shadow-lg shadow-red-600/20 font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Salvar Anotação
                    </button>
                </div>
             </div>

             {/* Mobile Float Switch Button */}
             {activePdfUrl && (
                <button 
                    onClick={() => setActivePdfUrl(null)}
                    className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] bg-zinc-950 border border-white/10 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl text-white animate-in slide-in-from-bottom-8 duration-300"
                >
                    <StickyNote size={18} className="text-red-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Voltar para Anotação</span>
                </button>
             )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal 
        isOpen={!!noteToDelete}
        onClose={() => setNoteToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Anotação?"
        message="Esta ação é permanente e não pode ser desfeita. Deseja continuar?"
        isLoading={isDeleting}
        confirmText="Sim, Excluir"
        variant="danger"
      />

    </div>,
    document.body
  );
};
