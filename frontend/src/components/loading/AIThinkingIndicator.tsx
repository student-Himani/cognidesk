import React from 'react';
import FuturisticAICore3D from '../3d/FuturisticAICore3D';

export interface AIThinkingIndicatorProps {
  label?: string;
  sublabel?: string;
  className?: string;
}

export const AIThinkingIndicator: React.FC<AIThinkingIndicatorProps> = ({
  label = 'CogniDesk AI is thinking...',
  sublabel,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-[#111827]/95 border border-blue-200/80 dark:border-blue-900/50 shadow-sm animate-fade-in ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Micro 3D AI Core */}
      <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
        <FuturisticAICore3D
          size={36}
          showRings={true}
          showParticles={false}
          interactiveParallax={false}
          speedMultiplier={1.2}
          glowIntensity={1.2}
        />
      </div>

      {/* Thinking Status & Neural Frequency Bars */}
      <div className="flex flex-col space-y-0.5">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
            {label}
          </span>
          {/* Animated Neural Pulse Dots */}
          <div className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {sublabel && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};

export default AIThinkingIndicator;
