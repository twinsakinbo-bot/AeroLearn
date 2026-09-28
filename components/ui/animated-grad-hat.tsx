"use client"

import React, { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Float, Environment, ContactShadows } from "@react-three/drei"
import * as THREE from "three"
import { cn } from "@/lib/utils"

function GradHatModel() {
  const hatRef = useRef<THREE.Group>(null)
  
  // Optional: subtle constant rotation
  useFrame((state) => {
    if (hatRef.current) {
      hatRef.current.rotation.y = state.clock.elapsedTime * 0.2
    }
  })

  // Materials. Literal hex rather than tokens: a 3D fill has to hold still
  // across themes, and these are the fixed ramps from tailwind.config.js —
  // brand-950 for the board, accent-500 (the mark's orange) for the tassel.
  const capMaterial = new THREE.MeshStandardMaterial({
    color: "#0C1839", // brand-950
    roughness: 0.7,
    metalness: 0.1
  })

  const tasselMaterial = new THREE.MeshStandardMaterial({
    color: "#F2621E", // accent-500
    roughness: 0.4,
    metalness: 0.6
  })

  return (
    <group ref={hatRef} position={[0, -0.5, 0]}>
      {/* Top Board */}
      <mesh material={capMaterial} position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[3.5, 0.15, 3.5]} />
      </mesh>
      
      {/* Skull Cap (Base) */}
      <mesh material={capMaterial} position={[0, 0.6, 0]} castShadow>
        {/* Radius top, radius bottom, height, radial segments */}
        <cylinderGeometry args={[1.2, 1.3, 1.2, 32]} />
      </mesh>

      {/* Center Button */}
      <mesh material={tasselMaterial} position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
      </mesh>
      
      {/* Tassel String */}
      <mesh material={tasselMaterial} position={[0.6, 1.0, 0.6]} rotation={[0, 0, -Math.PI / 8]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
      </mesh>

      {/* Tassel End (Fringe) */}
      <mesh material={tasselMaterial} position={[0.9, 0.35, 0.6]} rotation={[0, 0, -Math.PI / 8]} castShadow>
        <cylinderGeometry args={[0.1, 0.2, 0.4, 16]} />
      </mesh>
    </group>
  )
}

export function AnimatedGradHat({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-72 h-80 flex items-center justify-center group cursor-grab active:cursor-grabbing z-30", className)}>
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-brand/20 blur-3xl rounded-full scale-110 pointer-events-none"></div>
      
      <Canvas shadows camera={{ position: [0, 2, 6], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[5, 10, 5]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} color="#3760CE" />
        <Environment preset="city" />
        
        <Float
          speed={2} // Animation speed
          rotationIntensity={0.2} // XYZ rotation intensity
          floatIntensity={1.5} // Up/down float intensity
          floatingRange={[-0.2, 0.2]} // Range of y-axis values the object will float within
        >
          <GradHatModel />
        </Float>
        
        <ContactShadows 
          position={[0, -1.5, 0]} 
          opacity={0.4} 
          scale={10} 
          blur={2} 
          far={4} 
        />
      </Canvas>
      
      {/* Additional particle/sparkle effects around it */}
      <div className="absolute top-10 right-10 w-3 h-3 bg-brand-400 rounded-full animate-ping opacity-75 delay-75 pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-2 h-2 bg-accent-400 rounded-full animate-ping opacity-75 delay-300 pointer-events-none"></div>
    </div>
  )
}
