
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2 } from 'lucide-react';
import { TipTapEditor } from '../../ui/TipTapEditor';

interface NotebookEditorModalProps {
  initialData: string;
  title: string;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}

export const NotebookEditorModal: React.FC<NotebookEditorModalProps> = ({
  initialData,
  title,
  onSave,
  onClose,
  readOnly = false
}) => {
  const [content, setContent] = useState(initialData || '');
  const [isSaving, setIsSaving] = useState(false);

  // Sync initialData if it changes from outside
  useEffect(() => {
    setContent(initialData || '');
  }, [initialData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(content);
      // We don't auto-close here because the parent might want to stay open (NOTEBOOK behavior in LinkedGoalItem)
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#121214]">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">{title}</h2>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-0.5">Editor de Caderno Personalizado</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-all outline-none"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col bg-[#09090b]">
           <TipTapEditor 
             content={content} 
             onChange={setContent}
             placeholder="Digite suas anotações aqui..."
           />
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="p-4 bg-[#121214] border-t border-white/5 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-red-600/20 font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Caderno'}
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
};
