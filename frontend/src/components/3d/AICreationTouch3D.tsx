import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import aiCreationHandsImg from '../../assets/ai_creation_hands.jpg';

export interface AICreationTouch3DProps {
  onMeetupComplete?: () => void;
  className?: string;
  compact?: boolean;
  interactiveParallax?: boolean;
  showSpark?: boolean;
}

export const AICreationTouch3D: React.FC<AICreationTouch3DProps> = ({
  onMeetupComplete,
  className = '',
  compact = false,
  interactiveParallax = true,
  showSpark = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<'approaching' | 'contact' | 'opening'>('approaching');
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!interactiveParallax) return;
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const y = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      setTilt({ x: x * 5, y: -y * 5 });
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [interactiveParallax]);

  useEffect(() => {
    const contactTimer = setTimeout(() => {
      setStage('contact');
    }, 1100);

    const openTimer = setTimeout(() => {
      setStage('opening');
      if (onMeetupComplete) {
        onMeetupComplete();
      }
    }, 2400);

    return () => {
      clearTimeout(contactTimer);
      clearTimeout(openTimer);
    };
  }, [onMeetupComplete]);

  // Three.js WebGL Spark & Shockwave Animation
  useEffect(() => {
    if (!showSpark) return;
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Core Plasma Spark
    const sparkGeom = new THREE.SphereGeometry(0.14, 24, 24);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const sparkMesh = new THREE.Mesh(sparkGeom, sparkMat);
    group.add(sparkMesh);

    // 2. Concentric Expanding Shockwave Rings
    const ringGeom1 = new THREE.TorusGeometry(0.4, 0.015, 12, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    });
    const ring1 = new THREE.Mesh(ringGeom1, ringMat1);
    group.add(ring1);

    const ringGeom2 = new THREE.TorusGeometry(0.7, 0.01, 12, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.6,
    });
    const ring2 = new THREE.Mesh(ringGeom2, ringMat2);
    ring2.rotation.x = Math.PI / 4;
    group.add(ring2);

    const ringGeom3 = new THREE.TorusGeometry(1.05, 0.008, 12, 64);
    const ringMat3 = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.4,
    });
    const ring3 = new THREE.Mesh(ringGeom3, ringMat3);
    ring3.rotation.y = -Math.PI / 5;
    group.add(ring3);

    // 3. Electrical Synapse Particle Burst
    const particleCount = 90;
    const positions = new Float32Array(particleCount * 3);
    const velocities: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.05 + Math.random() * 0.9;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

      velocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.01,
      });
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particlePoints = new THREE.Points(particleGeom, particleMat);
    group.add(particlePoints);

    // Animation Loop
    let frameId: number;
    let time = 0;

    const animate = () => {
      time += 0.02;

      // Pulse
      const pulse = 1 + Math.sin(time * 6) * 0.35;
      sparkMesh.scale.set(pulse, pulse, pulse);

      // Rings
      ring1.rotation.z += 0.03;
      const s1 = 1 + (time * 0.9) % 1.5;
      ring1.scale.set(s1, s1, s1);
      ringMat1.opacity = Math.max(0, 1 - (s1 - 1) / 1.5);

      ring2.rotation.z -= 0.02;
      ring2.rotation.x += 0.01;

      ring3.rotation.z += 0.015;

      particlePoints.rotation.z += 0.01;

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

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center overflow-hidden bg-[#060913] select-none ${className}`}
    >
      {/* Background Starfield & Volumetric Nebula Glow */}
      <div className="absolute inset-0 bg-[#060913]">
        <img
          src={aiCreationHandsImg}
          alt="Space background"
          className="w-full h-full object-cover opacity-20 blur-xl scale-110 pointer-events-none"
        />
        <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#060913]/60 to-[#060913]" />
      </div>

      {/* Hand Animations: Robot Hand (Left) and Human Hand (Right) Meet in Center */}
      <div
        className={`relative w-full ${compact ? 'max-w-xl' : 'max-w-6xl'} aspect-[16/9] flex items-center justify-center pointer-events-none transition-transform duration-200`}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
        }}
      >
        {/* Left Side: Robotic Hand */}
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-[1200ms] ease-out pointer-events-none"
          style={{
            clipPath: 'polygon(0% 0%, 50.5% 0%, 50.5% 100%, 0% 100%)',
            transform: stage === 'approaching' ? 'translateX(-80px)' : 'translateX(0px)',
          }}
        >
          <img
            src={aiCreationHandsImg}
            alt="Robotic AI Hand"
            className="w-full h-full object-cover pointer-events-none"
          />
        </div>

        {/* Right Side: Human Hand */}
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-[1200ms] ease-out pointer-events-none"
          style={{
            clipPath: 'polygon(50.4% 0%, 100% 0%, 100% 100%, 50.4% 100%)',
            transform: stage === 'approaching' ? 'translateX(80px)' : 'translateX(0px)',
          }}
        >
          <img
            src={aiCreationHandsImg}
            alt="Human Hand"
            className="w-full h-full object-cover pointer-events-none"
          />
        </div>

        {/* Convergence Spark (Visible when hands meet up) */}
        {showSpark && (
          <div
            className={`absolute left-[50.5%] top-[46%] -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-300 ${
              stage !== 'approaching' ? 'opacity-100' : 'opacity-20 scale-75'
            }`}
          >
            {/* Three.js Real-time Spark Canvas */}
            <div
              ref={mountRef}
              className="relative w-72 h-72 flex items-center justify-center mix-blend-screen pointer-events-none z-20"
            />

            {/* Glowing Radial Light Burst on Fingertip Touch */}
            {stage !== 'approaching' && (
              <>
                <div
                  className="absolute inset-0 m-auto w-40 h-40 rounded-full bg-cyan-400/50 blur-2xl animate-pulse pointer-events-none z-10"
                  style={{ animationDuration: '1.2s' }}
                />
                <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white blur-md animate-ping pointer-events-none z-10" />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AICreationTouch3D;
