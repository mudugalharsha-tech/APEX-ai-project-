import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function getNodeVisuals(type) {
  const t = (type || '').toLowerCase();
  if (t === 'pdf') {
    return { color: '#22d3ee', shape: 'octahedron' };
  }
  if (t === 'xlsx' || t === 'xls' || t === 'csv') {
    return { color: '#34d399', shape: 'box' };
  }
  if (t === 'web' || t === 'youtube') {
    return { color: '#a78bfa', shape: 'icosahedron' };
  }
  return { color: '#fbbf24', shape: 'dodecahedron' };
}

function OrbitalRing({ radius, tiltX = 0, tiltZ = 0, color = '#334155', opacity = 0.22 }) {
  const points = useMemo(() => {
    const pts = [];
    const segments = 96;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(theta) * radius, 0, Math.sin(theta) * radius]);
    }
    return pts;
  }, [radius]);

  return (
    <group rotation={[tiltX, 0, tiltZ]}>
      <Line points={points} color={color} lineWidth={1} transparent opacity={opacity} />
    </group>
  );
}

function GalaxyCore({ isThinking }) {
  const coreRef = useRef();
  const shellRef = useRef();

  useFrame((state, delta) => {
    const speed = isThinking ? 2.6 : 0.45;
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * speed;
      coreRef.current.rotation.x += delta * speed * 0.4;
      const pulse = isThinking
        ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.14
        : 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      coreRef.current.scale.setScalar(pulse);
    }
    if (shellRef.current) {
      shellRef.current.rotation.y -= delta * speed * 0.7;
      shellRef.current.rotation.z += delta * speed * 0.3;
    }
  });

  return (
    <group>
      <pointLight
        color={isThinking ? '#fcd34d' : '#ea580c'}
        intensity={isThinking ? 6.5 : 3.2}
        distance={18}
      />
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.95, 2]} />
        <meshStandardMaterial
          color={isThinking ? '#fcd34d' : '#ea580c'}
          emissive={isThinking ? '#f59e0b' : '#9a3412'}
          emissiveIntensity={isThinking ? 2.4 : 1.25}
          roughness={0.22}
          metalness={0.6}
        />
      </mesh>
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial
          color={isThinking ? '#fde68a' : '#fdba74'}
          wireframe
          transparent
          opacity={isThinking ? 0.48 : 0.22}
        />
      </mesh>
    </group>
  );
}

function FileNode({ source, index, total, isCited, isResetting }) {
  const orbitRef = useRef();
  const meshRef = useRef();
  const beamPulseRef = useRef();
  const [hovered, setHovered] = useState(false);

  const { color, shape } = useMemo(() => getNodeVisuals(source.type), [source.type]);

  // Deterministic orbital parameters per source
  const orbit = useMemo(() => {
    const ring = index % 3;
    const radius = 3.4 + ring * 1.9 + ((index * 0.35) % 1.1);
    const initialAngle = (index / Math.max(total, 1)) * Math.PI * 2 + ring * 0.8;
    const yOffset = ((index % 5) - 2) * 0.45;
    const speed = 0.12 + (index % 4) * 0.035;
    const tiltX = ((index % 3) - 1) * 0.18;
    const tiltZ = ((index % 2) * 2 - 1) * 0.12;
    return { radius, initialAngle, yOffset, speed, tiltX, tiltZ };
  }, [index, total]);

  const nodeLocalPos = useMemo(
    () => [
      Math.cos(orbit.initialAngle) * orbit.radius,
      orbit.yOffset,
      Math.sin(orbit.initialAngle) * orbit.radius,
    ],
    [orbit]
  );

  // Start at scale 0 on mount for smooth scale-in animation
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.scale.set(0, 0, 0);
    }
  }, []);

  useFrame((state, delta) => {
    if (orbitRef.current) {
      orbitRef.current.rotation.y += delta * orbit.speed;
    }
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.7;
      meshRef.current.rotation.y += delta * 0.9;

      const targetScale = isResetting
        ? 0
        : isCited
        ? 1.35 + Math.sin(state.clock.elapsedTime * 7) * 0.18
        : hovered
        ? 1.25
        : 1.0;

      const lerpFactor = isResetting ? 0.18 : 0.09;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        lerpFactor
      );
    }
    if (beamPulseRef.current && isCited && !isResetting) {
      const t = (state.clock.elapsedTime * 1.1) % 1;
      beamPulseRef.current.position.set(
        nodeLocalPos[0] * (1 - t),
        nodeLocalPos[1] * (1 - t),
        nodeLocalPos[2] * (1 - t)
      );
    }
  });

  const renderGeometry = () => {
    switch (shape) {
      case 'octahedron':
        return <octahedronGeometry args={[0.38, 0]} />;
      case 'box':
        return <boxGeometry args={[0.5, 0.5, 0.5]} />;
      case 'icosahedron':
        return <icosahedronGeometry args={[0.38, 0]} />;
      default:
        return <dodecahedronGeometry args={[0.38, 0]} />;
    }
  };

  return (
    <group ref={orbitRef} rotation={[orbit.tiltX, 0, orbit.tiltZ]}>
      <Line
        points={[[0, 0, 0], nodeLocalPos]}
        color={isCited ? '#fbbf24' : color}
        lineWidth={isCited ? 2.6 : 1}
        transparent
        opacity={isResetting ? 0.05 : isCited ? 0.9 : 0.28}
      />

      {isCited && !isResetting && (
        <mesh ref={beamPulseRef}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      )}

      <mesh
        ref={meshRef}
        position={nodeLocalPos}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        {renderGeometry()}
        <meshStandardMaterial
          color={color}
          emissive={isCited ? '#f59e0b' : color}
          emissiveIntensity={isCited ? 2.2 : hovered ? 1.4 : 0.65}
          roughness={0.25}
          metalness={0.5}
        />

        {hovered && !isResetting && (
          <Html distanceFactor={10} center style={{ pointerEvents: 'none' }}>
            <div className="px-3 py-1.5 rounded-xl backdrop-blur-xl bg-slate-950/85 border border-white/20 text-slate-100 shadow-xl whitespace-nowrap">
              <p className="text-xs font-medium max-w-[200px] truncate">{source.name}</p>
              <p className="text-[10px] text-amber-300">
                {(source.type || 'file').toUpperCase()} • {source.chunks_added} chunks
              </p>
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

/**
 * Applies subtle mouse-synced camera sway / parallax without fighting OrbitControls.
 */
function GalaxyStage({ sourcesList, activeSources, isThinking, isResetting }) {
  const stageRef = useRef();

  useFrame((state) => {
    if (!stageRef.current) return;
    const targetRotY = state.pointer.x * 0.14;
    const targetRotX = -state.pointer.y * 0.1;
    stageRef.current.rotation.y = THREE.MathUtils.lerp(
      stageRef.current.rotation.y,
      targetRotY,
      0.04
    );
    stageRef.current.rotation.x = THREE.MathUtils.lerp(
      stageRef.current.rotation.x,
      targetRotX,
      0.04
    );
  });

  return (
    <group ref={stageRef}>
      <Sparkles count={200} scale={20} size={2} speed={0.3} opacity={0.5} color="#fda4af" />
      <Sparkles count={80} scale={14} size={2.8} speed={0.45} opacity={0.5} color="#fcd34d" />

      <OrbitalRing radius={3.5} tiltX={0.18} tiltZ={-0.1} color="#431407" opacity={0.65} />
      <OrbitalRing radius={5.5} tiltX={-0.15} tiltZ={0.12} color="#7c2d12" opacity={0.48} />
      <OrbitalRing radius={7.5} tiltX={0.1} tiltZ={0.08} color="#431407" opacity={0.4} />

      <GalaxyCore isThinking={isThinking} />

      {sourcesList.map((src, idx) => (
        <FileNode
          key={src.id || `${src.name}-${idx}`}
          source={src}
          index={idx}
          total={sourcesList.length}
          isCited={activeSources.includes(src.name)}
          isResetting={isResetting}
        />
      ))}
    </group>
  );
}

export default function DataGalaxy3D({
  sourcesList = [],
  activeSources = [],
  isThinking = false,
  isResetting = false,
}) {
  return (
    <div
      className="fixed inset-0 z-0"
      style={{
        background:
          'radial-gradient(circle at 30% 75%, #2b1309 0%, #160a06 42%, #090504 82%)',
      }}
    >
      <Canvas camera={{ position: [0, 3.5, 11.5], fov: 50 }} dpr={[1, 2]}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[8, 10, 6]} intensity={0.8} color="#fde68a" />

        <GalaxyStage
          sourcesList={sourcesList}
          activeSources={activeSources}
          isThinking={isThinking}
          isResetting={isResetting}
        />

        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={4}
          maxDistance={16}
          autoRotate
          autoRotateSpeed={isThinking ? 1.5 : 0.35}
        />
      </Canvas>
    </div>
  );
}
