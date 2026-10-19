import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export const WorkspaceVector: React.FC<{ className?: string }> = ({ className = 'w-full h-auto' }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`relative flex items-center justify-center w-full ${className}`}>
      {/* Background Soft Blue/Cyan Radial Ambient Glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/15 via-cyan-500/20 to-blue-600/15 rounded-full blur-3xl animate-pulse-glow" />

      {/* SVG Container with Animated Flowing Particles, Bubbles, and Triangles */}
      <div
        className="w-full flex items-center justify-center transition-transform duration-500 hover:[transform:rotateX(1.5deg)_rotateY(-1deg)]"
        style={{ perspective: '1200px' }}
      >
        <svg
          viewBox="0 0 1000 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-5xl drop-shadow-2xl select-none"
        >
          <defs>
            {/* Background Landscape Gradients */}
            <linearGradient id="darkWave1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={isDark ? "0.22" : "0.12"} />
              <stop offset="50%" stopColor="#0284c7" stopOpacity={isDark ? "0.16" : "0.08"} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={isDark ? "0.08" : "0.04"} />
            </linearGradient>

            <linearGradient id="darkWave2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={isDark ? "0.25" : "0.15"} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={isDark ? "0.1" : "0.05"} />
            </linearGradient>

            <linearGradient id="deskSurfaceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isDark ? "#0f172a" : "#f1f5f9"} stopOpacity={isDark ? "0.85" : "0.95"} />
              <stop offset="100%" stopColor={isDark ? "#020617" : "#e2e8f0"} stopOpacity={isDark ? "0.95" : "0.98"} />
            </linearGradient>

            <linearGradient id="lampMetal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            <linearGradient id="lampGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
            </linearGradient>

            <linearGradient id="laptopBody" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDark ? "#1e293b" : "#3b82f6"} />
              <stop offset="100%" stopColor={isDark ? "#0f172a" : "#1d4ed8"} />
            </linearGradient>

            <linearGradient id="techBrainLogo" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>

            <filter id="logoGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* RIGHT BACKGROUND ORGANIC DARK WAVY GRAPHICS */}
          <path
            d="M 550 0 C 700 80, 800 180, 1000 60 L 1000 420 L 550 420 Z"
            fill="url(#darkWave1)"
          />
          <path
            d="M 680 0 C 820 120, 920 220, 1000 160 L 1000 420 L 680 420 Z"
            fill="url(#darkWave2)"
          />

          {/* CREATIVE ANIMATED FLOATING BUBBLES & PARTICLE FLOW */}
          {/* Bubbles */}
          <circle cx="150" cy="170" r="10" fill="#06b6d4" fillOpacity="0.4" className="animate-bubble-rise" />
          <circle cx="650" cy="220" r="12" fill="#38bdf8" fillOpacity="0.5" className="animate-bubble-rise" style={{ animationDelay: '1.5s' }} />
          <circle cx="820" cy="140" r="8" fill="#60a5fa" fillOpacity="0.4" className="animate-bubble-rise" style={{ animationDelay: '2.5s' }} />
          <circle cx="480" cy="120" r="6" fill="#0284c7" fillOpacity="0.5" className="animate-bubble-rise" style={{ animationDelay: '3.2s' }} />

          {/* Floating Geometric Triangles with Slow Spin */}
          <g className="animate-triangle-spin" style={{ transformOrigin: '220px 100px' }}>
            <polygon points="220,90 230,110 210,110" fill="#06b6d4" fillOpacity="0.5" />
          </g>
          <g className="animate-triangle-spin" style={{ transformOrigin: '760px 180px', animationDelay: '2s' }}>
            <polygon points="760,170 772,192 748,192" fill="#2563eb" fillOpacity="0.5" />
          </g>
          <g className="animate-triangle-spin" style={{ transformOrigin: '920px 100px', animationDelay: '4s' }}>
            <polygon points="920,90 930,110 910,110" fill="#38bdf8" fillOpacity="0.4" />
          </g>

          {/* LEFT WINDOW FRAME & OUTSIDE SILHOUETTE PLANT */}
          <g id="window-section" opacity="0.3">
            <rect x="40" y="90" width="160" height="240" rx="8" stroke="#0284c7" strokeWidth="3.5" fill="#0f172a" fillOpacity="0.3" />
            <line x1="120" y1="90" x2="120" y2="330" stroke="#0284c7" strokeWidth="2.5" />
            <line x1="40" y1="210" x2="200" y2="210" stroke="#0284c7" strokeWidth="2.5" />

            <g transform="translate(55, 275)">
              <ellipse cx="25" cy="30" rx="12" ry="4" fill="#0ea5e9" opacity="0.4" />
              <path d="M 18 16 L 32 16 L 29 30 L 21 30 Z" fill="#0284c7" />
              <path d="M 25 16 Q 12 0 5 -12 Q 18 2 25 16 Z" fill="#06b6d4" />
              <path d="M 25 16 Q 38 0 45 -12 Q 32 2 25 16 Z" fill="#06b6d4" />
            </g>
          </g>

          {/* DESK SURFACE LINE */}
          <path d="M 0 420 L 1000 420 L 1000 480 L 0 480 Z" fill="url(#deskSurfaceGrad)" />
          <line x1="0" y1="420" x2="1000" y2="420" stroke={isDark ? "#1e293b" : "#94a3b8"} strokeWidth="2" opacity={isDark ? 0.7 : 0.5} />

          {/* DESK LAMP (LEFT) */}
          <g id="desk-lamp">
            <ellipse cx="240" cy="420" rx="35" ry="12" fill="#000000" opacity="0.4" />
            <ellipse cx="240" cy="416" rx="28" ry="8" fill="url(#lampMetal)" />
            <path d="M 240 414 L 208 300" stroke="url(#lampMetal)" strokeWidth="10" strokeLinecap="round" />
            <circle cx="208" cy="300" r="8" fill="#1e3a8a" />
            <path d="M 208 300 L 285 190" stroke="url(#lampMetal)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="285" cy="190" r="7" fill="#1e3a8a" />
            <path d="M 270 195 L 340 225 L 320 160 Z" fill="url(#lampMetal)" />
            <ellipse cx="330" cy="225" rx="12" ry="6" fill="#e0f2fe" />
            <polygon points="325,225 340,230 420,420 220,420" fill="url(#lampGlow)" />
          </g>

          {/* SMALL POTTED PLANT UNDER LAMP */}
          <g id="plant-under-lamp">
            <ellipse cx="310" cy="415" rx="18" ry="6" fill="#000000" fillOpacity="0.2" />
            <path d="M 298 388 L 322 388 L 318 415 L 302 415 Z" fill="#475569" />
            <path d="M 310 388 Q 295 365 290 345 Q 305 360 310 388 Z" fill="#0284c7" fillOpacity="0.85" />
            <path d="M 310 388 Q 325 360 335 340 Q 320 360 310 388 Z" fill="#0369a1" fillOpacity="0.9" />
            <path d="M 310 385 Q 310 355 310 330 Q 318 355 310 385 Z" fill="#06b6d4" />
          </g>

          {/* CENTER LAPTOP WITH COGNIDESK AI LOGO */}
          <g id="laptop-center">
            <ellipse cx="505" cy="425" rx="145" ry="16" fill="#000000" fillOpacity="0.3" />

            <rect x="395" y="215" width="230" height="155" rx="12" fill="url(#laptopBody)" stroke={isDark ? "#475569" : "#60a5fa"} strokeWidth="3" />

            {/* Bright Display Screen */}
            <rect x="403" y="223" width="214" height="139" rx="6" fill={isDark ? "#090d16" : "#ffffff"} />

            {/* Glowing Logo */}
            <g transform="translate(472, 250)" filter="url(#logoGlow)">
              <circle cx="38" cy="38" r="28" fill="#06b6d4" fillOpacity="0.15" className="animate-pulse-glow" />

              <path
                d="M 26 22 C 18 22 14 30 14 38 C 14 48 23 53 30 53 C 33 53 36 51 38 48 C 40 51 43 53 46 53 C 53 53 62 48 62 38 C 62 30 58 22 50 22 C 45 22 40 26 38 29 C 36 26 31 22 26 22 Z"
                fill="url(#techBrainLogo)"
              />

              <circle cx="26" cy="30" r="4" fill="#ffffff" />
              <circle cx="50" cy="30" r="4" fill="#ffffff" />
              <circle cx="22" cy="40" r="3.5" fill="#ffffff" />
              <circle cx="54" cy="40" r="3.5" fill="#ffffff" />
              <circle cx="38" cy="44" r="4" fill="#ffffff" />

              <path d="M 26 30 L 38 44 L 50 30" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 22 40 L 54 40" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            </g>

            <path d="M 375 370 L 645 370 L 630 390 L 390 390 Z" fill={isDark ? "#1e293b" : "#e2e8f0"} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth="2" />
            <rect x="480" y="375" width="50" height="8" rx="2" fill={isDark ? "#475569" : "#94a3b8"} />
          </g>

          {/* COFFEE MUG */}
          <g id="coffee-mug">
            <ellipse cx="704" cy="415" rx="16" ry="6" fill="#000000" fillOpacity="0.2" />
            <rect x="691" y="378" width="26" height="35" rx="5" fill={isDark ? "#1e3a8a" : "#2563eb"} stroke={isDark ? "#1d4ed8" : "#1e40af"} strokeWidth="2" />
            <path d="M 717 384 C 727 384, 727 402, 717 402" stroke={isDark ? "#1d4ed8" : "#1e40af"} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M 698 370 Q 701 360 698 350" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" className="animate-float" />
            <path d="M 706 373 Q 709 363 706 353" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" className="animate-float" style={{ animationDelay: '0.8s' }} />
          </g>

          {/* GREEN POTTED PLANT */}
          <g id="plant-right-green">
            <ellipse cx="810" cy="415" rx="22" ry="7" fill="#000000" fillOpacity="0.2" />
            <path d="M 795 385 L 825 385 L 820 415 L 800 415 Z" fill="#475569" />
            <path d="M 810 385 Q 785 345 770 310 Q 800 335 810 385 Z" fill="#22c55e" />
            <path d="M 810 385 Q 835 340 850 305 Q 825 335 810 385 Z" fill="#16a34a" />
            <path d="M 810 380 Q 810 335 810 290 Q 820 330 810 380 Z" fill="#15803d" />
            <path d="M 810 385 Q 795 360 780 340 Q 800 355 810 385 Z" fill="#4ade80" />
          </g>

          {/* STACK OF 3 COLORFUL BOOKS */}
          <g id="colorful-books">
            <rect x="842" y="400" width="135" height="18" rx="4" fill="#0284c7" stroke="#0369a1" strokeWidth="1.5" />
            <rect x="850" y="404" width="120" height="10" rx="1" fill="#ffffff" opacity="0.9" />

            <rect x="847" y="380" width="128" height="18" rx="4" fill="#2563eb" stroke="#1d4ed8" strokeWidth="1.5" />
            <rect x="855" y="384" width="112" height="10" rx="1" fill="#ffffff" opacity="0.9" />

            <rect x="852" y="360" width="120" height="18" rx="4" fill="#0ea5e9" stroke="#0284c7" strokeWidth="1.5" />
            <rect x="860" y="364" width="104" height="10" rx="1" fill="#ffffff" opacity="0.9" />
          </g>
        </svg>
      </div>
    </div>
  );
};

export default WorkspaceVector;
