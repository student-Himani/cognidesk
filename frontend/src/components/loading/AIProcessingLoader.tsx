import React from 'react';
import AICreationTouch3D from '../3d/AICreationTouch3D';
import FuturisticAICore3D from '../3d/FuturisticAICore3D';
import { Sparkles } from 'lucide-react';

export interface AIProcessingLoaderProps {
  title?: string;
  subtitle?: string;
  stage?: string;
  progress?: number;
  size?: number;
  className?: string;
  compact?: boolean;
  useCreationTouch?: boolean;
}

export const AIProcessingLoader: React.FC<AIProcessingLoaderProps> = ({
  title = 'Processing Local Intelligence...',
  subtitle = 'Extracting and structuring offline data',
  stage,
  progress,
  size,
  className = '',
  compact = false,
  useCreationTouch = true,
}) => {
  const effectiveSize = size ?? (compact ? 55 : 80);

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center rounded-3xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shadow-sm transition-all ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Visual Presentation */}
      {useCreationTouch && !compact ? (
        <div className="relative w-56 sm:w-64 aspect-[16/9] mb-4 rounded-2xl overflow-hidden shadow-md border border-blue-500/20 dark:border-cyan-500/30">
          <AICreationTouch3D className="w-full h-full" compact={true} interactiveParallax={false} />
        </div>
      ) : (
        <div className="relative flex items-center justify-center mb-3">
          <div
            className="absolute rounded-full border border-blue-400/20 dark:border-cyan-400/20 animate-spin pointer-events-none"
            style={{
              width: effectiveSize + 24,
              height: effectiveSize + 24,
              animationDuration: '20s',
            }}
          />
          <FuturisticAICore3D
            size={effectiveSize}
            showRings={true}
            showParticles={effectiveSize >= 65}
            interactiveParallax={false}
            speedMultiplier={0.9}
          />
        </div>
      )}

      {/* Stage Badge */}
      {stage && (
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 mb-2 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-cyan-300">
          <Sparkles className="w-3 h-3 text-cyan-500" />
          <span>{stage}</span>
        </div>
      )}

      {/* Title & Subtitle */}
      <div className="space-y-1 max-w-sm">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h4>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {/* Optional Progress Bar */}
      {typeof progress === 'number' && (
        <div className="w-48 mt-3 space-y-1">
          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIProcessingLoader;
