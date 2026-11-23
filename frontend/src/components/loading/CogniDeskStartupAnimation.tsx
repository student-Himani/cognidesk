import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RotateCcw, ArrowRight, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import robotHandImg from '../../assets/robot_hand_transparent.png';
import humanHandImg from '../../assets/human_hand_transparent.png';
import { getApiBaseUrl } from '../../services/apiClient';

export interface CogniDeskStartupAnimationProps {
  onComplete?: () => void;
}

export const CogniDeskStartupAnimation: React.FC<CogniDeskStartupAnimationProps> = ({
  onComplete,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  // Stages: 'entering' -> 'coreIgnite' -> 'contact' -> 'reveal'
  const [animStage, setAnimStage] = useState<'entering' | 'coreIgnite' | 'contact' | 'reveal'>('entering');
  const [isFading, setIsFading] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);

  // Synchronized Startup States
  const [backendReady, setBackendReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing CogniDesk AI Services...');
  const [hasError, setHasError] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const completedRef = useRef(false);

  const isDesktop = typeof window !== 'undefined' && Boolean((window as any).cognideskDesktop);

  // Finish and enter workspace safely
  const handleProceed = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setAnimStage('reveal');
    setIsFading(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 450);
  }, [onComplete]);

  // Fast non-blocking backend probe
  const checkBackendHealth = useCallback(async () => {
    // If navigator reports offline, immediately activate offline mode
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBackendReady(true);
      setStatusMessage('Offline Mode Active — In-Browser Storage Ready');
      return true;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1600);

      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        setBackendReady(true);
        setStatusMessage(isDesktop ? 'Local AI Knowledge Engine Ready' : 'Hosted AI Knowledge Engine Ready');
        return true;
      }
    } catch {
      // Backend not yet ready or polling timed out
    }

    // On mobile / web PWA deployments, never block on backend health; default to in-browser storage
    if (!isDesktop) {
      setBackendReady(true);
      setStatusMessage('In-Browser Workspace & Local Storage Ready');
      return true;
    }

    return false;
  }, [isDesktop]);

  // Main Startup Synchronization Lifecycle
  useEffect(() => {
    // Check reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      const fastTimer = setTimeout(() => {
        handleProceed();
      }, 500);
      return () => clearTimeout(fastTimer);
    }

    const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview_loader=true');

    // Stage 1: Core Ignite at 300ms
    const igniteTimer = setTimeout(() => {
      setAnimStage('coreIgnite');
      setStatusMessage(
        isDesktop
          ? 'Loading Knowledge Vector Indexes & Models...'
          : 'Verifying IndexedDB Storage & Vector Indexes...'
      );
    }, 300);

    // Allow user to tap/skip immediately
    const skipTimer = setTimeout(() => {
      setCanSkip(true);
    }, 300);

    // Stage 2: Fingertip Contact & Fusion at 600ms
    const contactTimer = setTimeout(() => {
      setAnimStage('contact');
      setStatusMessage(
        isDesktop
          ? 'Verifying SQLite Database & Local Engine...'
          : 'Connecting to Cloud AI & Local Workspace...'
      );
    }, 600);

    // Stage 3: Smooth automatic completion for Web & Mobile at 1400ms
    const completionTimer = setTimeout(() => {
      if (!isPreview) {
        handleProceed();
      }
    }, isDesktop ? 2200 : 1400);

    // Stage 4: Absolute safety fallback (max 2500ms)
    const safetyTimer = setTimeout(() => {
      if (!isPreview) {
        handleProceed();
      }
    }, isDesktop ? 3000 : 2500);

    if (isPreview) {
      return () => {
        clearTimeout(igniteTimer);
        clearTimeout(skipTimer);
        clearTimeout(contactTimer);
        clearTimeout(completionTimer);
        clearTimeout(safetyTimer);
      };
    }

    // Non-blocking background health check
    checkBackendHealth();

    // Listen to native Electron backend manager status if available
    const desktop = (window as any).cognideskDesktop;
    let unsubDesktop: (() => void) | undefined;
    if (desktop?.onBackendStatus) {
      unsubDesktop = desktop.onBackendStatus((status: any) => {
        if (status?.status === 'running') {
          setBackendReady(true);
          setStatusMessage('AI Knowledge Engine Ready');
        } else if (status?.status === 'failed') {
          setHasError(true);
          setStatusMessage('Local backend unavailable. Click continue for offline mode.');
        }
      });
    }

    return () => {
      clearTimeout(igniteTimer);
      clearTimeout(skipTimer);
      clearTimeout(contactTimer);
      clearTimeout(completionTimer);
      clearTimeout(safetyTimer);
      if (unsubDesktop) unsubDesktop();
    };
  }, [checkBackendHealth, handleProceed, isDesktop]);

  // Three.js AI Energy Core & Contact Shockwave with Error Safety & Responsive Resize
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;

    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
      camera.position.z = 3.6;

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      const width = container.clientWidth || 320;
      const height = container.clientHeight || 320;
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
    } catch (err) {
      console.warn('[StartupAnimation] WebGL initialization failed, using CSS glow fallback:', err);
      setWebGlSupported(false);
      return;
    }

    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Glowing AI Orb Nucleus
    const orbGeom = new THREE.SphereGeometry(0.16, 24, 24);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });
    const orbMesh = new THREE.Mesh(orbGeom, orbMat);
    group.add(orbMesh);

    // Inner electric cyan glow aura
    const innerGlowGeom = new THREE.SphereGeometry(0.26, 20, 20);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const innerGlowMesh = new THREE.Mesh(innerGlowGeom, innerGlowMat);
    group.add(innerGlowMesh);

    // 2. Delicate Thin Counter-Rotating Orbital Rings
    const ringGeom1 = new THREE.TorusGeometry(0.55, 0.012, 16, 48);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const ring1 = new THREE.Mesh(ringGeom1, ringMat1);
    ring1.rotation.x = Math.PI / 2.4;
    group.add(ring1);

    const ringGeom2 = new THREE.TorusGeometry(0.85, 0.009, 16, 48);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.7,
    });
    const ring2 = new THREE.Mesh(ringGeom2, ringMat2);
    ring2.rotation.x = Math.PI / 2.6;
    ring2.rotation.y = Math.PI / 10;
    group.add(ring2);

    const ringGeom3 = new THREE.TorusGeometry(1.18, 0.007, 16, 48);
    const ringMat3 = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.5,
    });
    const ring3 = new THREE.Mesh(ringGeom3, ringMat3);
    ring3.rotation.x = Math.PI / 2.2;
    ring3.rotation.y = -Math.PI / 12;
    group.add(ring3);

    // 3. Ambient Synaptic Particle Constellation
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.12 + Math.random() * 1.05;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.04,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    group.add(particles);

    // 4. Contact Shockwave Wave Mesh
    const waveGeom = new THREE.RingGeometry(0.1, 0.15, 36);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const waveMesh = new THREE.Mesh(waveGeom, waveMat);
    group.add(waveMesh);

    // Responsive Canvas Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0 && renderer) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    // Animation Loop
    let frameId: number;
    let time = 0;
    let contactTime = 0;

    const animate = () => {
      time += 0.02;

      // Floating core pulse
      const s = 1 + Math.sin(time * 5) * 0.22;
      orbMesh.scale.set(s, s, s);
      innerGlowMesh.scale.set(s * 1.05, s * 1.05, s * 1.05);

      // Rings rotation
      ring1.rotation.z += 0.025;
      ring2.rotation.z -= 0.02;
      ring2.rotation.x += 0.01;
      ring3.rotation.z += 0.015;

      particles.rotation.z += 0.008;

      // Contact shockwave expands
      if (animStage === 'contact' || animStage === 'reveal') {
        contactTime += 0.04;
        const waveScale = 1 + contactTime * 4.2;
        waveMesh.scale.set(waveScale, waveScale, waveScale);
        waveMat.opacity = Math.max(0, 0.9 - contactTime * 0.9);
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      orbGeom.dispose();
      orbMat.dispose();
      innerGlowGeom.dispose();
      innerGlowMat.dispose();
      ringGeom1.dispose();
      ringMat1.dispose();
      ringGeom2.dispose();
      ringMat2.dispose();
      ringGeom3.dispose();
      ringMat3.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      waveGeom.dispose();
      waveMat.dispose();
      renderer.dispose();
    };
  }, [animStage]);

  return (
    <div
      onClick={() => canSkip && handleProceed()}
      className={`fixed inset-0 w-screen h-screen z-[9999] overflow-hidden transition-all duration-700 ease-out select-none cursor-pointer ${
        isFading ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100 pointer-events-auto'
      }`}
      style={{
        backgroundColor: '#0a0e17',
        backgroundImage: `
          radial-gradient(at 15% 15%, rgba(37, 99, 235, 0.15) 0px, transparent 50%),
          radial-gradient(at 85% 20%, rgba(6, 182, 212, 0.10) 0px, transparent 45%),
          radial-gradient(at 50% 85%, rgba(30, 58, 138, 0.18) 0px, transparent 60%)
        `,
      }}
      aria-hidden="true"
    >
      {/* Ambient center energy glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] md:w-[700px] h-[340px] sm:h-[400px] md:h-[500px] rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-600/15 to-indigo-500/10 blur-[60px] sm:blur-[100px] pointer-events-none -z-10"
      />

      {/* Subtle shockwave flash upon contact */}
      <div
        className={`absolute inset-0 bg-cyan-400/8 pointer-events-none transition-opacity duration-500 -z-10 ${
          animStage === 'contact' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 1. Left Side: Robotic Arm gliding in from left - Perfectly meets at 50vw center */}
      <div
        className="absolute flex items-center justify-end pointer-events-none transition-transform duration-[1100ms] ease-out z-10"
        style={{
          top: '50%',
          right: 'calc(50vw - 2px)',
          transform:
            animStage === 'entering'
              ? 'translateX(-22vw) translateY(-40.42%)'
              : animStage === 'coreIgnite'
              ? 'translateX(-6vw) translateY(-40.42%)'
              : 'translateX(0vw) translateY(-40.42%)',
        }}
      >
        <img
          src={robotHandImg}
          alt="CogniDesk AI robotic arm"
          className="h-[28vh] sm:h-[40vh] md:h-[56vh] max-h-[220px] sm:max-h-[360px] md:max-h-[540px] min-h-[140px] w-auto object-contain pointer-events-none select-none drop-shadow-[0_0_20px_rgba(6,182,212,0.35)]"
        />
      </div>

      {/* 2. Right Side: Natural Human Arm gliding in from right - Perfectly meets at 50vw center */}
      <div
        className="absolute flex items-center justify-start pointer-events-none transition-transform duration-[1100ms] ease-out z-10"
        style={{
          top: '50%',
          left: 'calc(50vw - 2px)',
          transform:
            animStage === 'entering'
              ? 'translateX(22vw) translateY(-68.64%)'
              : animStage === 'coreIgnite'
              ? 'translateX(6vw) translateY(-68.64%)'
              : 'translateX(0vw) translateY(-68.64%)',
        }}
      >
        <img
          src={humanHandImg}
          alt="CogniDesk human intelligence arm"
          className="h-[37vh] sm:h-[53vh] md:h-[74vh] max-h-[290px] sm:max-h-[470px] md:max-h-[710px] min-h-[185px] w-auto object-contain pointer-events-none select-none drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]"
        />
      </div>

      {/* 3. Center Contact Point: Three.js AI Energy Core & Shockwave */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center">
        {/* Three.js Canvas Container */}
        {webGlSupported ? (
          <div
            ref={mountRef}
            className={`relative w-[220px] h-[220px] sm:w-[320px] sm:h-[320px] md:w-[420px] md:h-[420px] flex items-center justify-center transition-all duration-500 ${
              animStage === 'entering'
                ? 'opacity-30 scale-75'
                : animStage === 'coreIgnite'
                ? 'opacity-85 scale-90'
                : 'opacity-100 scale-100'
            }`}
          />
        ) : (
          /* Pure CSS Glowing Core Fallback if WebGL fails on mobile */
          <div className="relative w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white shadow-[0_0_30px_#38bdf8] animate-ping" />
            <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 animate-spin" />
            <div
              className="absolute inset-2 rounded-full border border-blue-500/60 animate-spin"
              style={{ animationDirection: 'reverse' }}
            />
          </div>
        )}

        {/* Contact Radial Light Burst at touching fingertips */}
        {(animStage === 'contact' || animStage === 'reveal') && (
          <>
            <div
              className="absolute w-32 sm:w-48 h-32 sm:h-48 rounded-full bg-cyan-400/40 blur-xl sm:blur-2xl animate-pulse pointer-events-none"
              style={{ animationDuration: '500ms' }}
            />
            <div className="absolute w-10 sm:w-16 h-10 sm:h-16 rounded-full bg-white blur-xs sm:blur-sm animate-ping pointer-events-none" />
          </>
        )}
      </div>

      {/* 4. Bottom Status & Touch Controls with Safe-Area Insets */}
      <div className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2.5 max-w-[92vw] px-2 text-center pointer-events-auto">
        {/* Status Pill Badge */}
        <div className="flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-slate-900/85 backdrop-blur-md border border-cyan-500/30 shadow-lg shadow-cyan-950/40 text-xs sm:text-sm font-medium text-slate-200 max-w-full">
          {backendReady ? (
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0 animate-pulse" />
          ) : hasError ? (
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0 animate-spin" />
          )}
          <span className="truncate max-w-[70vw] sm:max-w-none">{statusMessage}</span>
        </div>

        {/* Interactive action buttons / Skip recovery */}
        {canSkip && (
          <div className="flex items-center gap-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleProceed}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-md shadow-cyan-950/50 cursor-pointer min-h-[34px]"
            >
              <span>Enter Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {hasError && (
              <button
                type="button"
                onClick={() => checkBackendHealth()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs transition-colors cursor-pointer min-h-[34px]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry Connection</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CogniDeskStartupAnimation;
