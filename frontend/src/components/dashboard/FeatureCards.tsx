import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  MessageSquare,
  FileText,
  Database,
  Search,
  BookOpen,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export const FeatureCards: React.FC = () => {
  const features = [
    {
      title: 'AI Chat',
      description: 'Chat with documents and get local intelligent answers.',
      path: '/chat',
      icon: MessageSquare,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border-blue-200/70 dark:border-blue-800/40',
    },
    {
      title: 'Documents',
      description: 'Upload, manage, and index your files offline.',
      path: '/documents',
      icon: FileText,
      color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200/70 dark:border-cyan-800/40',
    },
    {
      title: 'Knowledge Base',
      description: 'Vector-indexed store for fast semantic retrieval.',
      path: '/knowledge-base',
      icon: Database,
      color: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/40',
    },
    {
      title: 'Search',
      description: 'Find content with hybrid vector and text search.',
      path: '/search',
      icon: Search,
      color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    },
    {
      title: 'Notes',
      description: 'Create, organize, and export your offline notes.',
      path: '/notes',
      icon: BookOpen,
      color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/40',
    },
    {
      title: 'Flashcards',
      description: 'Generate flashcards and boost your learning retention.',
      path: '/flashcards',
      icon: Sparkles,
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/70 dark:border-amber-800/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
      {features.map((item, idx) => (
        <NavLink
          key={idx}
          to={item.path}
          className="p-4 rounded-2xl bg-white/95 dark:bg-[#131c2e]/90 border border-slate-200/90 dark:border-blue-900/40 hover:border-blue-400/80 dark:hover:border-cyan-500/50 transition-all duration-150 flex flex-col justify-between space-y-3.5 group shadow-xs hover:-translate-y-0.5"
        >
          <div className="space-y-2.5">
            <div
              className={`w-10 h-10 rounded-xl ${item.color} border flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs`}
            >
              <item.icon className="w-5 h-5" />
            </div>

            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">
                {item.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1 line-clamp-2">
                {item.description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-cyan-600 group-hover:text-white transition-all shadow-2xs">
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </NavLink>
      ))}
    </div>
  );
};

export default FeatureCards;
