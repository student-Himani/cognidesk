import React from 'react';
import { FileText, Database, Cpu, HardDrive, FolderKanban } from 'lucide-react';

export const StatCards: React.FC = () => {
  const stats = [
    {
      title: 'Documents',
      value: '1,248',
      subtitle: '+32 this week',
      subtitleColor: 'text-emerald-600 dark:text-emerald-400',
      icon: FileText,
      iconBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 border-blue-200/70 dark:border-blue-800/40',
    },
    {
      title: 'Knowledge Base',
      value: '18.6k',
      subtitle: 'Indexed chunks',
      subtitleColor: 'text-cyan-600 dark:text-cyan-400',
      icon: Database,
      iconBg: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200/70 dark:border-cyan-800/40',
    },
    {
      title: 'AI Model',
      value: 'qwen2.5:3b',
      subtitle: 'Running locally',
      subtitleColor: 'text-emerald-600 dark:text-emerald-400',
      icon: Cpu,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/40',
    },
    {
      title: 'Storage',
      value: '128.4 GB',
      subtitle: 'of 512 GB used',
      subtitleColor: 'text-slate-400',
      icon: HardDrive,
      iconBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200/70 dark:border-sky-800/40',
      progress: '25%',
    },
    {
      title: 'Workspaces',
      value: '4',
      subtitle: 'Offline Isolated',
      subtitleColor: 'text-blue-600 dark:text-cyan-400',
      icon: FolderKanban,
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {stats.map((stat, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl bg-white/95 dark:bg-[#131c2e]/90 border border-slate-200/90 dark:border-blue-900/40 hover:border-blue-400/80 dark:hover:border-cyan-500/50 backdrop-blur-xl transition-all flex flex-col justify-between space-y-3 group shadow-xs hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className={`p-2 rounded-xl border ${stat.iconBg} group-hover:scale-105 transition-transform shadow-2xs`}>
              <stat.icon className="w-4.5 h-4.5" />
            </div>
            {stat.progress && (
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-600 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-cyan-300">
                {stat.progress}
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">{stat.title}</span>
            <div className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
              {stat.value}
            </div>
            <span className={`text-[11px] font-medium block mt-1 ${stat.subtitleColor}`}>
              {stat.subtitle}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatCards;
