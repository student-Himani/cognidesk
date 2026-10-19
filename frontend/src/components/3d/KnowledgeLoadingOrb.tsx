import React from 'react';
import FuturisticAICore3D from './FuturisticAICore3D';

interface KnowledgeLoadingOrbProps {
  size?: number;
  text?: string;
  className?: string;
}

export const KnowledgeLoadingOrb: React.FC<KnowledgeLoadingOrbProps> = ({
  size = 64,
  text,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center space-y-3 pointer-events-none select-none ${className}`}>
      <FuturisticAICore3D
        size={size}
        showRings={size >= 50}
        showParticles={size >= 60}
        interactiveParallax={size >= 70}
      />
      {text && (
        <p className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300 animate-pulse tracking-wide text-center max-w-xs">
          {text}
        </p>
      )}
    </div>
  );
};

export default KnowledgeLoadingOrb;
