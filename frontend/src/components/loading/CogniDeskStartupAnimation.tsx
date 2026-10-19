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

  // Synchronized Startup States (Module 30 Requirement 5)
  const [minDurationPassed, setMinDurationPassed] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing CogniDesk AI Services...');
  const [isDelayed, setIsDelayed] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryAttempts = useRef(0);

  // Check backend health or activate offline in-browser engine
  const checkBackendHealth = useCallback(async () => {
    // If navigator reports offline, immediately activate offline mode
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBackendReady(true);
      setStatusMessage('Offline Mode Active — In-Browser Storage & Engine Ready');
      setHasError(false);
      return true;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        setBackendReady(true);
        setStatusMessage('AI Knowledge Engine Ready');
        setHasError(false);
        return true;
      }
    } catch {
      // Backend not yet ready or polling timed out
    }

    // On web PWA deployments, if backend is unreachable after 4 attempts, proceed into offline mode
    if (retryAttempts.current >= 4 && typeof window !== 'undefined' && !(window as any).cognideskDesktop) {
      setBackendReady(true);
      setStatusMessage('Offline Mode Active — In-Browser Engine Ready');
      setHasError(false);
      return true;
    }

    return false;
  }, []);

  // Main Startup Synchronization Lifecycle
  useEffect(() => {
    // Check reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      const fastTimer = setTimeout(() => {
        setIsFading(true);
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 400);
      }, 800);
      return () => clearTimeout(fastTimer);
    }

    const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview_loader=true');

    // Stage 1: Core Ignite at 1200ms
    const igniteTimer = setTimeout(() => {
      setAnimStage('coreIgnite');
      setStatusMessage('Loading Knowledge Vector Indexes & Models...');
    }, 1200);

    // Stage 2: Fingertip Contact & Fusion at 2400ms
    const contactTimer = setTimeout(() => {
      setAnimStage('contact');
      setStatusMessage('Verifying SQLite Database & Ollama Integration...');
    }, 2400);

    // Stage 3: Minimum 5000ms duration gate
    const minTimer = setTimeout(() => {
      setMinDurationPassed(true);
    }, 5000);

    // Stage 4: Delayed notice if backend takes > 15s
    const delayedTimer = setTimeout(() => {
      if (!backendReady) {
        setIsDelayed(true);
        setStatusMessage('Backend startup is taking longer than usual...');
      }
    }, 15000);

    if (isPreview) {
      return () => {
        clearTimeout(igniteTimer);
        clearTimeout(contactTimer);
        clearTimeout(minTimer);
        clearTimeout(delayedTimer);
      };
    }

    // Health Check Polling Loop (every 600ms)
    let isSubscribed = true;
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      retryAttempts.current += 1;
      const ready = await checkBackendHealth();
      if (ready && isSubscribed) {
        clearInterval(pollInterval);
      } else if (retryAttempts.current > 30 && isSubscribed) {
        setHasError(true);
      }
    }, 600);

    // Initial immediate probe
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
          setStatusMessage('Backend failed to start. Click Retry below.');
        }
      });
    }

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      clearTimeout(igniteTimer);
      clearTimeout(contactTimer);
      clearTimeout(minTimer);
      clearTimeout(delayedTimer);
      if (unsubDesktop) unsubDesktop();
    };
  }, [checkBackendHealth, onComplete, backendReady]);

  // Complete and reveal real application ONLY when BOTH >= 5s AND backend is ready
  useEffect(() => {
    if (minDurationPassed && backendReady && !isFading) {
      const exitTimer = setTimeout(() => {
        setAnimStage('reveal');
        setIsFading(true);
        const finishTimer = setTimeout(() => {
          if (onComplete) onComplete();
        }, 600);
        return () => clearTimeout(finishTimer);
      }, 400);

      return () => clearTimeout(exitTimer);
    }
  }, [minDurationPassed, backendReady, isFading, onComplete]);

  // Manual Retry Handler
  const handleRetry = async () => {
    setHasError(false);
    setIsDelayed(false);
    setStatusMessage('Retrying connection to CogniDesk backend...');
    const desktop = (window as any).cognideskDesktop;
    if (desktop?.restartBackend) {
      await desktop.restartBackend();
    }
    await checkBackendHealth();
  };

  // Continue Anyway
  const handleContinueAnyway = () => {
    setAnimStage('reveal');
    setIsFading(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 500);
  };


  // Three.js AI Energy Core & Contact Shockwave
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.z = 3.6;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(container.clientWidth || 380, container.clientHeight || 380);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Glowing AI Orb Nucleus
    const orbGeom = new THREE.SphereGeometry(0.16, 32, 32);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });
    const orbMesh = new THREE.Mesh(orbGeom, orbMat);
    group.add(orbMesh);

    // Inner electric cyan glow aura
    const innerGlowGeom = new THREE.SphereGeometry(0.26, 24, 24);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const innerGlowMesh = new THREE.Mesh(innerGlowGeom, innerGlowMat);
    group.add(innerGlowMesh);

    // 2. Delicate Thin Counter-Rotating Orbital Rings (Horizontal ellipses framing fingertips)
    const ringGeom1 = new THREE.TorusGeometry(0.55, 0.012, 16, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const ring1 = new THREE.Mesh(ringGeom1, ringMat1);
    ring1.rotation.x = Math.PI / 2.4;
    group.add(ring1);

    const ringGeom2 = new THREE.TorusGeometry(0.85, 0.009, 16, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.7,
    });
    const ring2 = new THREE.Mesh(ringGeom2, ringMat2);
    ring2.rotation.x = Math.PI / 2.6;
    ring2.rotation.y = Math.PI / 10;
    group.add(ring2);

    const ringGeom3 = new THREE.TorusGeometry(1.18, 0.007, 16, 64);
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
    const particleCount = 80;
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
    const waveGeom = new THREE.RingGeometry(0.1, 0.15, 48);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const waveMesh = new THREE.Mesh(waveGeom, waveMat);
    group.add(waveMesh);

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
      if (container.contains(renderer.domElement)) {
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
      className={`fixed inset-0 w-screen h-screen z-[9999] overflow-hidden transition-all duration-700 ease-out select-none pointer-events-none ${
        isFading ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
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
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-gradient-to-r from-cyan-500/10 via-blue-600/15 to-indigo-500/10 blur-[100px] pointer-events-none -z-10"
      />

      {/* Subtle shockwave flash upon contact */}
      <div
        className={`absolute inset-0 bg-cyan-400/8 pointer-events-none transition-opacity duration-500 -z-10 ${
          animStage === 'contact' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 1. Left Side: Robotic Arm gliding in from left - Centered at 50vh */}
      <div
        className="absolute flex items-center justify-end pointer-events-none transition-transform duration-[1200ms] ease-out z-10"
        style={{
          top: '50%',
          right: 'calc(50vw + 55px)',
          transform:
            animStage === 'entering'
              ? 'translateX(-25vw) translateY(-40.36%)'
              : animStage === 'coreIgnite'
              ? 'translateX(-5vw) translateY(-40.36%)'
              : 'translateX(0vw) translateY(-40.36%)',
        }}
      >
        <img
          src={robotHandImg}
          alt=""
          className="h-[58vh] max-h-[560px] min-h-[380px] w-auto object-contain pointer-events-none select-none"
        />
      </div>

      {/* 2. Right Side: Natural Human Arm gliding in from right - Centered at 50vh */}
      <div
        className="absolute flex items-center justify-start pointer-events-none transition-transform duration-[1200ms] ease-out z-10"
        style={{
          top: '50%',
          left: 'calc(50vw + 55px)',
          transform:
            animStage === 'entering'
              ? 'translateX(25vw) translateY(-68.55%)'
              : animStage === 'coreIgnite'
              ? 'translateX(5vw) translateY(-68.55%)'
              : 'translateX(0vw) translateY(-68.55%)',
        }}
      >
        <img
          src={humanHandImg}
          alt=""
          className="h-[77vh] max-h-[740px] min-h-[500px] w-auto object-contain pointer-events-none select-none"
        />
      </div>

      {/* 3. Center Contact Point: Three.js AI Energy Core & Shockwave */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center"
      >
        {/* Three.js Canvas Container */}
        <div
          ref={mountRef}
          className={`relative w-[360px] h-[360px] sm:w-[420px] sm:h-[420px] flex items-center justify-center transition-all duration-500 ${
            animStage === 'entering'
              ? 'opacity-30 scale-60'
              : animStage === 'coreIgnite'
              ? 'opacity-85 scale-90'
              : 'opacity-100 scale-100'
          }`}
        />

        {/* Contact Radial Light Burst */}
        {animStage === 'contact' && (
          <>
            <div
              className="absolute w-44 h-44 rounded-full bg-cyan-400/35 blur-2xl animate-pulse pointer-events-none"
              style={{ animationDuration: '600ms' }}
            />
            <div className="absolute w-14 h-14 rounded-full bg-white blur-sm animate-ping pointer-events-none" />
          </>
        )}
      </div>

      {/* 4. Bottom Status & Connection Feedback Bar (Module 30 Requirement 5) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-cyan-500/25 shadow-lg shadow-cyan-950/40 text-xs sm:text-sm font-medium text-slate-200">
          {backendReady ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-pulse" />
          ) : hasError ? (
            <AlertCircle className="w-4 h-4 text-amber-400 animate-bounce" />
          ) : (
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
          )}
          <span>{statusMessage}</span>
        </div>

        {/* Interactive action buttons if startup is delayed or failed */}
        {(isDelayed || hasError) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 text-xs transition-colors pointer-events-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Backend</span>
            </button>
            <button
              type="button"
              onClick={handleContinueAnyway}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 text-xs transition-colors pointer-events-auto"
            >
              <span>Continue to App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CogniDeskStartupAnimation;
