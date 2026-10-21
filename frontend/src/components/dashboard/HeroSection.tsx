import React, { useState, useRef } from 'react';
import { Paperclip, Send, Sparkles, ChevronDown, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WorkspaceVector from '../../assets/vectors/WorkspaceVector';
import KnowledgeOrb3D from '../3d/KnowledgeOrb3D';

export const HeroSection: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('Qwen 2.5 7B');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !attachedFile) return;

    let targetUrl = `/chat?prompt=${encodeURIComponent(prompt.trim())}`;
    if (attachedFile) {
      targetUrl += `&fileName=${encodeURIComponent(attachedFile.name)}`;
    }
    navigate(targetUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const handlePaperclipClick = () => {
    fileInputRef.current?.click();
  };

  const models = ['Qwen 2.5 7B', 'Llama 3 8B', 'Mistral 7B', 'DeepSeek R1 8B'];

  return (
    <section className="relative flex flex-col items-center justify-center text-center space-y-4 pt-2 pb-2 px-2 w-full max-w-5xl mx-auto">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.csv,.md,image/*"
      />

      {/* 3D Knowledge Core Interactive Header */}
      <div className="flex flex-col items-center justify-center space-y-2 max-w-2xl mx-auto z-10">
        {/* Clean 3D Interactive WebGL Orb - Pure & Unobstructed */}
        <div className="relative group cursor-pointer" title="Interactive 3D CogniDesk Core (Drag to rotate)">
          <div className="hidden sm:block">
            <KnowledgeOrb3D size={115} />
          </div>
          <div className="block sm:hidden">
            <KnowledgeOrb3D size={80} />
          </div>
        </div>

        {/* Welcome Title with Electric Cobalt / Cyan Gradient */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white px-2">
          Welcome to{' '}
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">
            CogniDesk
          </span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm md:text-base font-normal max-w-md sm:max-w-xl px-2">
          Your offline AI workspace for private knowledge & document intelligence.
        </p>
      </div>

      {/* Vector Illustration - Positioned before the input box as requested */}
      <div className="w-full max-w-lg mx-auto relative z-10 flex items-center justify-center pt-1 opacity-95 px-4">
        <WorkspaceVector className="w-full h-auto max-h-[110px] sm:max-h-[160px] md:max-h-[190px]" />
      </div>

      {/* Central AI Prompt Input Card — Positioned AFTER the vector illustration with crisp slate contrast (zero cream) */}
      <div className="w-full max-w-2xl md:max-w-3xl mx-auto relative z-20">
        <form
          onSubmit={handleSend}
          className="bg-white/95 dark:bg-[#131c2e] border border-slate-300/90 dark:border-blue-900/50 rounded-2xl p-4 shadow-[0_10px_35px_rgba(37,99,235,0.08)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)] focus-within:border-blue-500/70 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all space-y-2.5 text-left backdrop-blur-xl"
        >
          {/* Attached File Preview Badge */}
          {attachedFile && (
            <div className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-cyan-300 text-xs font-medium max-w-xs animate-pop-in">
              <div className="flex items-center space-x-2 truncate">
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                <span className="truncate">{attachedFile.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="p-0.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Ask anything or start a conversation..."
            rows={2}
            className="w-full bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none text-sm leading-relaxed font-normal"
          />

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
            {/* Model Selector Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center space-x-1 xs:space-x-1.5 px-2 xs:px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer shadow-2xs min-h-[38px]"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                <span className="truncate max-w-[95px] xs:max-w-[130px] sm:max-w-none">AI Assistant ({selectedModel})</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-52 bg-white dark:bg-[#151926] border border-blue-200/80 dark:border-blue-900/50 rounded-2xl shadow-xl z-30 py-1 space-y-0.5 animate-pop-in">
                  {models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m);
                        setIsModelDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <button
                type="button"
                onClick={handlePaperclipClick}
                className="p-2 rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
                title="Attach Document to Chat"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={!prompt.trim() && !attachedFile}
                className="p-2 sm:px-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center hover:scale-105 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};

export default HeroSection;
