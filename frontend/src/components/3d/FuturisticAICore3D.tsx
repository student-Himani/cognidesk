import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface FuturisticAICore3DProps {
  size?: number;
  showRings?: boolean;
  showParticles?: boolean;
  interactiveParallax?: boolean;
  speedMultiplier?: number;
  className?: string;
  glowIntensity?: number;
}

export const FuturisticAICore3D: React.FC<FuturisticAICore3DProps> = ({
  size = 200,
  showRings = true,
  showParticles = true,
  interactiveParallax = true,
  speedMultiplier = 1,
  className = '',
  glowIntensity = 1,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const effectiveSpeed = prefersReducedMotion ? 0.2 : speedMultiplier;

    // Theme color detection
    const isDark = document.documentElement.classList.contains('dark');
    
    // Balanced theme palette: Electric cobalt blue + vibrant cyan, with soft slate ambient accents
    // STRICTLY AVOID heavy purple / magenta / pink
    const primaryColorHex = isDark ? 0x3b82f6 : 0x2563eb; // Cobalt blue
    const cyanColorHex = isDark ? 0x22d3ee : 0x06b6d4;    // Neon cyan
    const ambientLightColor = isDark ? 0x1e3a8a : 0x93c5fd; // Deep sapphire / light sky
    const coreAccentColor = isDark ? 0x60a5fa : 0x3b82f6;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Root Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. Core Nested Geometries
    // Inner nucleus: Smooth crystalline icosahedron with translucent glass-like material
    const innerGeom = new THREE.IcosahedronGeometry(0.75, 1);
    const innerMat = new THREE.MeshPhongMaterial({
      color: primaryColorHex,
      emissive: primaryColorHex,
      emissiveIntensity: 0.35 * glowIntensity,
      shininess: 90,
      transparent: true,
      opacity: isDark ? 0.55 : 0.45,
      wireframe: false,
    });
    const innerMesh = new THREE.Mesh(innerGeom, innerMat);
    rootGroup.add(innerMesh);

    // Outer crystalline wireframe cage
    const outerGeom = new THREE.OctahedronGeometry(1.05, 0);
    const wireGeom = new THREE.WireframeGeometry(outerGeom);
    const wireMat = new THREE.LineBasicMaterial({
      color: cyanColorHex,
      transparent: true,
      opacity: isDark ? 0.8 : 0.65,
    });
    const wireMesh = new THREE.LineSegments(wireGeom, wireMat);
    rootGroup.add(wireMesh);

    // Subtle core vertices / node points
    const pointsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.055,
      transparent: true,
      opacity: 0.9,
    });
    const coreNodes = new THREE.Points(outerGeom, pointsMat);
    rootGroup.add(coreNodes);

    // 2. Orbital Thin Rings (Dual Counter-Rotating)
    let ringMesh1: THREE.Mesh | null = null;
    let ringMesh2: THREE.Mesh | null = null;
    let ringGeom1: THREE.TorusGeometry | null = null;
    let ringGeom2: THREE.TorusGeometry | null = null;
    let ringMat1: THREE.MeshBasicMaterial | null = null;
    let ringMat2: THREE.MeshBasicMaterial | null = null;

    if (showRings) {
      ringGeom1 = new THREE.TorusGeometry(1.48, 0.016, 16, 72);
      ringMat1 = new THREE.MeshBasicMaterial({
        color: cyanColorHex,
        transparent: true,
        opacity: isDark ? 0.75 : 0.6,
      });
      ringMesh1 = new THREE.Mesh(ringGeom1, ringMat1);
      ringMesh1.rotation.x = Math.PI / 3;
      ringMesh1.rotation.y = Math.PI / 6;
      rootGroup.add(ringMesh1);

      ringGeom2 = new THREE.TorusGeometry(1.82, 0.012, 16, 80);
      ringMat2 = new THREE.MeshBasicMaterial({
        color: coreAccentColor,
        transparent: true,
        opacity: isDark ? 0.55 : 0.45,
      });
      ringMesh2 = new THREE.Mesh(ringGeom2, ringMat2);
      ringMesh2.rotation.x = -Math.PI / 4;
      ringMesh2.rotation.z = Math.PI / 5;
      rootGroup.add(ringMesh2);
    }

    // 3. Floating Particle Constellation
    let particlePoints: THREE.Points | null = null;
    let particleGeom: THREE.BufferGeometry | null = null;
    let particleMat: THREE.PointsMaterial | null = null;

    if (showParticles) {
      const particleCount = size > 120 ? 85 : 45;
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        // Distribute uniformly in spherical shell around the core (radius 1.2 to 2.4)
        const radius = 1.2 + Math.random() * 1.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
      }

      particleGeom = new THREE.BufferGeometry();
      particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      particleMat = new THREE.PointsMaterial({
        color: cyanColorHex,
        size: 0.038,
        transparent: true,
        opacity: isDark ? 0.75 : 0.6,
        blending: THREE.AdditiveBlending,
      });

      particlePoints = new THREE.Points(particleGeom, particleMat);
      rootGroup.add(particlePoints);
    }

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(ambientLightColor, 1.2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(cyanColorHex, 2.5 * glowIntensity, 8);
    pointLight.position.set(2, 2.5, 3);
    scene.add(pointLight);

    const backLight = new THREE.PointLight(primaryColorHex, 1.8 * glowIntensity, 8);
    backLight.position.set(-2, -2, -2);
    scene.add(backLight);

    // Parallax tracking with smooth lerp
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactiveParallax || prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - (rect.left + rect.width / 2);
      const clientY = e.clientY - (rect.top + rect.height / 2);
      targetRotY = (clientX / window.innerWidth) * 0.45;
      targetRotX = (clientY / window.innerHeight) * 0.45;
    };

    if (interactiveParallax && !prefersReducedMotion) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // Animation Loop
    let frameId: number;
    let time = 0;

    const animate = () => {
      time += 0.016 * effectiveSpeed;

      // Parallax smooth interpolation
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      // Floating sinusoidal levitation & slow natural rotation
      rootGroup.position.y = Math.sin(time * 1.5) * 0.06;
      rootGroup.rotation.y += 0.008 * effectiveSpeed;
      rootGroup.rotation.x = currentRotX + Math.sin(time * 0.8) * 0.04;
      rootGroup.rotation.z = currentRotY + Math.cos(time * 0.7) * 0.03;

      // Inner nucleus subtle breathing scale
      const pulse = 1 + Math.sin(time * 2.8) * 0.05;
      innerMesh.scale.set(pulse, pulse, pulse);
      innerMesh.rotation.y -= 0.006 * effectiveSpeed;
      innerMesh.rotation.x += 0.004 * effectiveSpeed;

      // Outer wireframe cage slow spin
      wireMesh.rotation.y += 0.012 * effectiveSpeed;
      wireMesh.rotation.z -= 0.005 * effectiveSpeed;
      coreNodes.rotation.y = wireMesh.rotation.y;
      coreNodes.rotation.z = wireMesh.rotation.z;

      // Orbital rings counter-rotation
      if (ringMesh1) {
        ringMesh1.rotation.z += 0.014 * effectiveSpeed;
      }
      if (ringMesh2) {
        ringMesh2.rotation.z -= 0.01 * effectiveSpeed;
        ringMesh2.rotation.x += 0.004 * effectiveSpeed;
      }

      // Constellation slow orbital drift
      if (particlePoints) {
        particlePoints.rotation.y -= 0.005 * effectiveSpeed;
        particlePoints.rotation.x += 0.003 * effectiveSpeed;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // Robust WebGL Disposal & Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      if (interactiveParallax) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // Geometries
      innerGeom.dispose();
      outerGeom.dispose();
      wireGeom.dispose();
      if (ringGeom1) ringGeom1.dispose();
      if (ringGeom2) ringGeom2.dispose();
      if (particleGeom) particleGeom.dispose();

      // Materials
      innerMat.dispose();
      wireMat.dispose();
      pointsMat.dispose();
      if (ringMat1) ringMat1.dispose();
      if (ringMat2) ringMat2.dispose();
      if (particleMat) particleMat.dispose();

      // Renderer
      renderer.dispose();
    };
  }, [size, showRings, showParticles, interactiveParallax, speedMultiplier, glowIntensity]);

  return (
    <div
      ref={mountRef}
      className={`relative flex items-center justify-center pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
};

export default FuturisticAICore3D;
