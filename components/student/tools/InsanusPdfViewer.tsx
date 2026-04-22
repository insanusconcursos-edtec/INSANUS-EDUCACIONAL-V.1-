import React, { useState } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import { ChevronLeft, ChevronRight, Minus, Plus, Loader2, AlertCircle } from 'lucide-react';

// Import CSS for annotations and text layers
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface InsanusPdfViewerProps {
    url: string;
}

export const InsanusPdfViewer: React.FC<InsanusPdfViewerProps> = ({ url }) => {
    const [numPages, setNumPages] = useState<number>();
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setPageNumber(1);
    }

    return (
        <div className="flex flex-col w-full h-full bg-[#18181b] overflow-hidden">
            {/* Topbar do PDF com Controles */}
            <div className="flex justify-between items-center bg-[#121214] px-4 py-2 shrink-0 border-b border-white/10 text-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setPageNumber(p => Math.max(p - 1, 1))} 
                            disabled={pageNumber <= 1} 
                            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-[10px] font-black uppercase text-zinc-500 min-w-[80px] text-center tracking-widest">
                            Pág {pageNumber} <span className="text-zinc-700 mx-1">/</span> {numPages || '--'}
                        </span>
                        <button 
                            onClick={() => setPageNumber(p => Math.min(p + 1, numPages || 1))} 
                            disabled={pageNumber >= (numPages || 1)} 
                            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} 
                            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all"
                        >
                            <Minus size={16} />
                        </button>
                        <span className="text-[10px] font-black uppercase text-zinc-500 w-12 text-center tracking-widest">
                            {Math.round(scale * 100)}%
                        </span>
                        <button 
                            onClick={() => setScale(s => Math.min(s + 0.2, 2.5))} 
                            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Área de Renderização do Canvas (Scrollable) */}
            <div className="flex-1 overflow-auto bg-[#09090b] p-4 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
                <Document
                    file={url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                        <div className="flex flex-col items-center justify-center mt-20 gap-3">
                            <Loader2 className="animate-spin text-red-600" size={32} />
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Renderizando material...</span>
                        </div>
                    }
                    error={
                        <div className="flex flex-col items-center justify-center mt-20 gap-4 text-center p-6 bg-red-500/5 rounded-2xl border border-red-500/10 mx-auto max-w-sm">
                            <AlertCircle className="text-red-500" size={32} />
                            <div>
                                <p className="text-sm font-bold text-red-500 mb-1">Erro ao carregar o PDF</p>
                                <p className="text-[10px] text-zinc-500 font-medium">Isso pode ocorrer devido a restrições de segurança ou falha na conexão. Verifique o acesso ao Firebase Storage.</p>
                            </div>
                            <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-5 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all"
                            >
                                Abrir em nova aba
                            </a>
                        </div>
                    }
                >
                    <div className="w-max min-w-full flex justify-center">
                        <Page 
                            pageNumber={pageNumber} 
                            scale={scale} 
                            renderTextLayer={true} 
                            renderAnnotationLayer={false}
                            className="shadow-2xl border border-white/5"
                        />
                    </div>
                </Document>
            </div>
        </div>
    );
};
