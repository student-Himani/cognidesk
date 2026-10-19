import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface KnowledgeOrb3DProps {
  className?: string;
  size?: number;
}

export const KnowledgeOrb3D: React.FC<KnowledgeOrb3DProps> = ({
  className = '',
  size = 240,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Theme detection
    const isDark = document.documentElement.classList.contains('dark');

    // Fresh colors: Electric Cobalt Blue & Vibrant Cyan
    const primaryColor = isDark ? 0x3b82f6 : 0x2563eb;
    const cyanColor = isDark ? 0x22d3ee : 0x06b6d4;
    const ringColor = isDark ? 0x60a5fa : 0x0284c7;
    const nodeColor = isDark ? 0x38bdf8 : 0x0284c7;

    // Three.js Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.4;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Root Group
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // 1. Outer Geodesic / Icosahedron Wireframe Sphere
    const outerGeom = new THREE.IcosahedronGeometry(1.15, 1);
    const wireframeGeom = new THREE.WireframeGeometry(outerGeom);
    const outerMat = new THREE.LineBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: isDark ? 0.75 : 0.6,
      linewidth: 1,
    });
    const outerMesh = new THREE.LineSegments(wireframeGeom, outerMat);
    orbGroup.add(outerMesh);

    // 2. Vertex Node Points on Outer Sphere
    const posAttribute = outerGeom.attributes.position;
    const nodeGeom = new THREE.BufferGeometry();
    nodeGeom.setAttribute('position', posAttribute);
    const nodeMat = new THREE.PointsMaterial({
      color: nodeColor,
      size: 0.065,
      transparent: true,
      opacity: isDark ? 0.95 : 0.85,
    });
    const nodes = new THREE.Points(nodeGeom, nodeMat);
    orbGroup.add(nodes);

    // 3. Inner Crystalline Octahedron (Cyan accent)
    const innerGeom = new THREE.OctahedronGeometry(0.65, 0);
    const innerWireGeom = new THREE.WireframeGeometry(innerGeom);
    const innerMat = new THREE.LineBasicMaterial({
      color: cyanColor,
      transparent: true,
      opacity: isDark ? 0.85 : 0.75,
    });
    const innerMesh = new THREE.LineSegments(innerWireGeom, innerMat);
    orbGroup.add(innerMesh);

    // 4. Primary Orbital Torus Ring (tilted)
    const ring1Geom = new THREE.TorusGeometry(1.5, 0.016, 16, 80);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: isDark ? 0.6 : 0.45,
      wireframe: true,
    });
    const orbitalRing1 = new THREE.Mesh(ring1Geom, ring1Mat);
    orbitalRing1.rotation.x = Math.PI / 3;
    orbitalRing1.rotation.y = Math.PI / 6;
    orbGroup.add(orbitalRing1);

    // 5. Secondary Orbital Torus Ring (counter-tilted)
    const ring2Geom = new THREE.TorusGeometry(1.65, 0.012, 12, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: cyanColor,
      transparent: true,
      opacity: isDark ? 0.45 : 0.35,
      wireframe: true,
    });
    const orbitalRing2 = new THREE.Mesh(ring2Geom, ring2Mat);
    orbitalRing2.rotation.x = -Math.PI / 4;
    orbitalRing2.rotation.z = Math.PI / 5;
    orbGroup.add(orbitalRing2);

    // 6. Floating Ambient Particle Cloud (Electric Cyan & Sky Blue)
    const particleCount = 85;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.35 + Math.random() * 0.85;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: cyanColor,
      size: 0.045,
      transparent: true,
      opacity: isDark ? 0.75 : 0.65,
    });
    const particles = new THREE.Points(particleGeom, particleMat);
    orbGroup.add(particles);

    // Mouse Interaction (Parallax tilt)
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = x * 0.5;
      targetY = y * 0.5;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation Loop
    let animationFrameId: number;
    let isVisible = true;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(container);

    let time = 0;
    const animate = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      time += 0.01;

      if (!prefersReducedMotion) {
        // Multi-axis smooth rotation
        orbGroup.rotation.y += 0.004;
        orbGroup.rotation.x += 0.002;
        innerMesh.rotation.y -= 0.008;
        innerMesh.rotation.z += 0.005;
        orbitalRing1.rotation.z += 0.006;
        orbitalRing2.rotation.z -= 0.004;

        // Pulsing scale on inner core
        const scale = 1 + Math.sin(time * 2) * 0.06;
        innerMesh.scale.set(scale, scale, scale);

        // Smooth mouse tilt interpolation
        mouseX += (targetX - mouseX) * 0.05;
        mouseY += (targetY - mouseY) * 0.05;
        orbGroup.rotation.x = mouseY + orbGroup.rotation.x * 0.98;
        orbGroup.rotation.y = mouseX + orbGroup.rotation.y * 0.98;
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    renderer.render(scene, camera);

    if (!prefersReducedMotion) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      outerGeom.dispose();
      wireframeGeom.dispose();
      outerMat.dispose();
      nodeGeom.dispose();
      nodeMat.dispose();
      innerGeom.dispose();
      innerWireGeom.dispose();
      innerMat.dispose();
      ring1Geom.dispose();
      ring1Mat.dispose();
      ring2Geom.dispose();
      ring2Mat.dispose();
      particleGeom.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={`relative flex items-center justify-center pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
};

export default KnowledgeOrb3D;
