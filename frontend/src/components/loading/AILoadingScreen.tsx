import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import aiCreationHandsImg from '../../assets/ai_creation_hands.jpg';
import { ShieldCheck, HardDrive, Cpu, Sparkles } from 'lucide-react';

export interface AILoadingScreenProps {
  show?: boolean;
  message?: string;
  submessage?: string;
  progress?: number;
  onFinish?: () => void;
  className?: string;
}

export const AILoadingScreen: React.FC<AILoadingScreenProps> = ({
  show = true,
  message = 'Preparing your offline AI workspace...',
  submessage = 'Where Human Intelligence Meets Offline AI',
  progress,
  onFinish,
  className = '',
}) => {
  const sparkRef = useRef<HTMLDivElement>(null);
  // Stages: 'entering' -> 'touch' -> 'opening' -> 'finished'
  const [animStage, setAnimStage] = useState<'entering' | 'touch' | 'opening'>('entering');
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!show) return;

    // Stage 1: Both hands glide in from left and right and meet up at 1100ms
    const touchTimer = setTimeout(() => {
      setAnimStage('touch');
    }, 1100);

    // Stage 2: After meetup & spark, open project at 2400ms
    const openTimer = setTimeout(() => {
      setAnimStage('opening');
      setIsClosing(true);
    }, 2400);

    // Stage 3: Smooth dissolve complete at 2800ms
    const finishTimer = setTimeout(() => {
      if (onFinish) {
        onFinish();
      }
    }, 2850);

    return () => {
      clearTimeout(touchTimer);
      clearTimeout(openTimer);
      clearTimeout(finishTimer);
    };
  }, [show, onFinish]);

  // Three.js WebGL Synaptic Spark & Shockwave
  useEffect(() => {
    const container = sparkRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(320, 320);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // Central Spark Core
    const sparkGeom = new THREE.SphereGeometry(0.16, 24, 24);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });
    const sparkMesh = new THREE.Mesh(sparkGeom, sparkMat);
    group.add(sparkMesh);

    // Expanding Neural Shockwave Rings
    const ringGeom1 = new THREE.TorusGeometry(0.45, 0.016, 16, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const ring1 = new THREE.Mesh(ringGeom1, ringMat1);
    group.add(ring1);

    const ringGeom2 = new THREE.TorusGeometry(0.85, 0.012, 16, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.65,
    });
    const ring2 = new THREE.Mesh(ringGeom2, ringMat2);
    ring2.rotation.x = Math.PI / 3;
    group.add(ring2);

    const ringGeom3 = new THREE.TorusGeometry(1.25, 0.009, 16, 64);
    const ringMat3 = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.45,
    });
    const ring3 = new THREE.Mesh(ringGeom3, ringMat3);
    ring3.rotation.y = -Math.PI / 4;
    group.add(ring3);

    // Spark Particles Burst
    const particleCount = 100;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.1 + Math.random() * 1.1;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.048,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particlePoints = new THREE.Points(particleGeom, particleMat);
    group.add(particlePoints);

    let frameId: number;
    let time = 0;

    const animate = () => {
      time += 0.022;

      // Pulsing Core
      const s = 1 + Math.sin(time * 7) * 0.35;
      sparkMesh.scale.set(s, s, s);

      // Rings expanding
      ring1.rotation.z += 0.025;
      const rScale1 = 1 + (time * 0.8) % 1.4;
      ring1.scale.set(rScale1, rScale1, rScale1);
      ringMat1.opacity = Math.max(0, 1 - (rScale1 - 1) / 1.4);

      ring2.rotation.z -= 0.02;
      ring2.rotation.x += 0.01;

      ring3.rotation.z += 0.015;
      particlePoints.rotation.z += 0.008;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sparkGeom.dispose();
      sparkMat.dispose();
      ringGeom1.dispose();
      ringMat1.dispose();
      ringGeom2.dispose();
      ringMat2.dispose();
      ringGeom3.dispose();
      ringMat3.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] w-screen h-screen overflow-hidden bg-[#060913] text-white flex flex-col items-center justify-between transition-all duration-500 select-none ${
        isClosing ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Full-bleed Deep Space Background */}
      <div className="absolute inset-0 pointer-events-none -z-20 bg-[#060913]">
        <img
          src={aiCreationHandsImg}
          alt="Space background"
          className="w-full h-full object-cover opacity-15 blur-2xl scale-125"
        />
        <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#060913]/70 to-[#060913]" />
      </div>

      {/* Top Header: CogniDesk Branding & Convergence Badge */}
      <header className="relative z-30 pt-8 sm:pt-10 flex flex-col items-center space-y-2 pointer-events-none">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-blue-950/70 border border-blue-800/80 shadow-lg backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '10s' }} />
          <span className="text-[11px] font-bold tracking-widest uppercase text-cyan-300">
            Human + AI Convergence
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-300 bg-clip-text text-transparent">
          CogniDesk
        </h1>
      </header>

      {/* Centerpiece: Full-Screen Hands Meetup Animation */}
      <main className="relative w-full h-[58vh] max-w-7xl flex items-center justify-center my-auto">
        {/* Left Side: Robotic Cyborg Arm glides in from Left */}
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-[1100ms] ease-out pointer-events-none"
          style={{
            clipPath: 'polygon(0% 0%, 50.5% 0%, 50.5% 100%, 0% 100%)',
            transform: animStage === 'entering' ? 'translateX(-110px)' : 'translateX(0px)',
          }}
        >
          <img
            src={aiCreationHandsImg}
            alt="Robotic Hand"
            className="w-full h-full object-cover object-center pointer-events-none"
          />
        </div>

        {/* Right Side: Natural Human Arm glides in from Right */}
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-[1100ms] ease-out pointer-events-none"
          style={{
            clipPath: 'polygon(50.4% 0%, 100% 0%, 100% 100%, 50.4% 100%)',
            transform: animStage === 'entering' ? 'translateX(110px)' : 'translateX(0px)',
          }}
        >
          <img
            src={aiCreationHandsImg}
            alt="Human Hand"
            className="w-full h-full object-cover object-center pointer-events-none"
          />
        </div>

        {/* Fingertip Convergence Point with Three.js WebGL Electric Spark */}
        <div
          className={`absolute left-[50.5%] top-[46%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 transition-all duration-300 ${
            animStage !== 'entering' ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        >
          {/* Three.js Spark & Particle Burst */}
          <div
            ref={sparkRef}
            className="relative w-80 h-80 flex items-center justify-center mix-blend-screen"
          />

          {/* Explosive Lens Flare on Touch */}
          {animStage !== 'entering' && (
            <>
              <div
                className="absolute inset-0 m-auto w-48 h-48 rounded-full bg-cyan-400/45 blur-2xl animate-pulse pointer-events-none"
                style={{ animationDuration: '1s' }}
              />
              <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white blur-md animate-ping pointer-events-none" />
            </>
          )}
        </div>
      </main>

      {/* Bottom Footer: Dynamic Status & Offline Pillars */}
      <footer className="relative z-30 pb-8 sm:pb-12 flex flex-col items-center space-y-3 pointer-events-none text-center max-w-md mx-4">
        {/* Status Message */}
        <div className="space-y-1">
          <p className="text-sm sm:text-base font-semibold tracking-wide text-slate-200">
            {animStage !== 'entering'
              ? 'Human & Artificial Intelligence Converged'
              : message}
          </p>
          <p className="text-xs text-slate-400">
            {animStage === 'opening'
              ? 'Unlocking your private workspace...'
              : submessage}
          </p>
        </div>

        {/* Optional Progress Track */}
        {typeof progress === 'number' && (
          <div className="w-56 mx-auto pt-1">
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Offline Architecture Indicators */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-medium text-slate-400">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800/80 backdrop-blur-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Offline</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800/80 backdrop-blur-sm">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Local Vector Store</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800/80 backdrop-blur-sm">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Zero Cloud Telemetry</span>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default AILoadingScreen;
