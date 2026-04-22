
import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Type, Highlighter, List, Minus, Undo, Redo
} from 'lucide-react';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export const TipTapEditor: React.FC<TipTapEditorProps> = ({ content, onChange, placeholder }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none min-h-[300px] max-w-none text-gray-200 p-4',
      },
    },
  });

  if (!editor) {
    return null;
  }

  // Helper sync from props (e.g. when selecting a new note)
  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="w-full border border-white/10 rounded-xl overflow-hidden bg-[#09090b] flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-[#121214] border-b border-white/10 shrink-0">
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          icon={<Bold size={16} />}
          title="Negrito"
        />
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          icon={<Italic size={16} />}
          title="Itálico"
        />
        <MenuButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          icon={<UnderlineIcon size={16} />}
          title="Sublinhado"
        />
        <MenuButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          icon={<Strikethrough size={16} />}
          title="Riscado"
        />

        <div className="w-px h-6 bg-white/10 mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          icon={<AlignLeft size={16} />}
          title="Alinhamento Esquerda"
        />
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          icon={<AlignCenter size={16} />}
          title="Alinhamento Centro"
        />
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          icon={<AlignRight size={16} />}
          title="Alinhamento Direita"
        />
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          icon={<AlignJustify size={16} />}
          title="Alinhamento Justificado"
        />

        <div className="w-px h-6 bg-white/10 mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={<List size={16} />}
          title="Lista de Marcadores"
        />
        <MenuButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={<Minus size={16} />}
          title="Linha Horizontal"
        />

        <div className="w-px h-6 bg-white/10 mx-1" />

        <div className="relative group p-1 flex items-center">
          <input
            type="color"
            onInput={event => {
              const target = event.target as HTMLInputElement;
              editor.chain().focus().setColor(target.value).run();
            }}
            value={editor.getAttributes('textStyle').color || '#ffffff'}
            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer opacity-0 absolute inset-0 z-10"
            title="Cor do Texto"
          />
          <Type size={16} className="text-gray-400 group-hover:text-white" />
        </div>

        <div className="relative group p-1 flex items-center">
          <input
            type="color"
            onInput={event => {
              const target = event.target as HTMLInputElement;
              editor.chain().focus().setHighlight({ color: target.value }).run();
            }}
            value={editor.getAttributes('highlight').color || '#ffff00'}
            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer opacity-0 absolute inset-0 z-10"
            title="Cor de Fundo (Highlight)"
          />
          <Highlighter size={16} className="text-gray-400 group-hover:text-white" />
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          icon={<Undo size={16} />}
          title="Desfazer"
        />
        <MenuButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          icon={<Redo size={16} />}
          title="Refazer"
        />
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror {
           min-height: 200px;
        }
      `}</style>
    </div>
  );
};

const MenuButton = ({ 
  onClick, 
  active = false, 
  disabled = false, 
  icon, 
  title 
}: { 
  onClick: () => void; 
  active?: boolean; 
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded-lg transition-all ${
      active 
        ? 'bg-red-500/20 text-red-500 border border-red-500/30' 
        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
    } disabled:opacity-30 disabled:cursor-not-allowed`}
  >
    {icon}
  </button>
);
