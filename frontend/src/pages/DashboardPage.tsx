import React from 'react';
import HeroSection from '../components/dashboard/HeroSection';
import StatCards from '../components/dashboard/StatCards';
import FeatureCards from '../components/dashboard/FeatureCards';

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-6">
      {/* Hero Header with Vector Illustration & Input Box */}
      <HeroSection />

      {/* 5 Top Workspace Metrics */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
          Workspace Overview
        </h2>
        <StatCards />
      </div>

      {/* 6 Interactive Feature Cards Grid */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
          Core Modules
        </h2>
        <FeatureCards />
      </div>

      {/* Footer info bar */}
      <div className="text-center pt-4 border-t border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 space-x-2">
        <span>CogniDesk v1.0.0</span>
        <span>•</span>
        <span>100% Offline AI Hub</span>
        <span>•</span>
        <span>Local Privacy First</span>
      </div>
    </div>
  );
};

export default DashboardPage;
