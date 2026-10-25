import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { geo, mat, labelTexture } from "./geometry";
import { heroOf, makeSlots, targetAt, type Slot } from "./layout";
import { OBJECTS } from "./tier";

export interface SceneProps { tier: "high" | "low"; progress: { current: number } }

function Shape({ slot }: { slot: Slot }) {
  const label = useMemo(() => (slot.kind === "tag" ? labelTexture(slot.label) : null), [slot]);
  useEffect(() => () => label?.dispose(), [label]);
  if (slot.kind === "tag")
    return (
      <group>
        <mesh geometry={geo.tag} material={slot.label === "-50%" ? mat.teal : mat.coral} castShadow receiveShadow />
        <mesh geometry={geo.label} position={[-0.1, 0, 0.08]}>
          <meshBasicMaterial map={label} transparent toneMapped={false} />
        </mesh>
        <mesh geometry={geo.label} position={[-0.1, 0, -0.08]} rotation={[0, Math.PI, 0]}>
          <meshBasicMaterial map={label} transparent toneMapped={false} />
        </mesh>
      </group>
    );
  if (slot.kind === "percent")
    return (
      <group>
        <mesh geometry={geo.ring} material={mat.coralGloss} position={[-0.26, 0.26, 0]} castShadow />
        <mesh geometry={geo.ring} material={mat.coralGloss} position={[0.26, -0.26, 0]} castShadow />
        <mesh geometry={geo.slash} material={mat.coralGloss} rotation={[0, 0, -Math.PI / 4]} castShadow />
      </group>
    );
  return (
    <group>
      <mesh geometry={geo.bag} material={mat.paper} castShadow receiveShadow />
      <mesh geometry={geo.handle} material={mat.teal} position={[0, 0.45, 0]} />
    </group>
  );
}

function Floater({ slot, i, count, progress }: { slot: Slot; i: number; count: number; progress: { current: number } }) {
  const ref = useRef<THREE.Group>(null);
  const { pointer, viewport } = useThree();
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const narrow = viewport.aspect < 1;
    const [x, y, z] = targetAt(slot, i, count, progress.current, narrow);
    const k = 1 - Math.exp(-dt * 3);
    const t = state.clock.elapsedTime;
    g.position.x += (x + pointer.x * 0.3 - g.position.x) * k;
    g.position.y += (y + Math.sin(t * 0.8 + slot.phase) * 0.15 + pointer.y * 0.2 - g.position.y) * k;
    g.position.z += (z - g.position.z) * k;
    if (slot.kind === "tag") {
      g.rotation.x = Math.sin(t * 0.6 + slot.phase) * 0.25 + pointer.y * 0.3;
      g.rotation.y = Math.sin(t * 0.5 + slot.phase) * 0.45 + pointer.x * 0.4;
      g.rotation.z = Math.sin(t * 0.4 + slot.phase) * 0.15;
    } else {
      g.rotation.x = slot.spin[0] + t * 0.15 + pointer.y * 0.4;
      g.rotation.y = slot.spin[1] + t * 0.2 + pointer.x * 0.5;
    }
  });
  return (
    <group ref={ref} position={heroOf(slot, window.innerWidth < window.innerHeight)} scale={slot.scale}>
      <Shape slot={slot} />
    </group>
  );
}

export function Scene({ tier, progress }: SceneProps) {
  const count = OBJECTS[tier];
  const slots = useMemo(() => makeSlots(count), [count]);
  const [active, setActive] = useState(true);

  // Stop rendering in a background tab.
  useEffect(() => {
    const onVis = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <Canvas
      dpr={tier === "high" ? [1, 2] : [1, 1.25]}
      shadows={tier === "high"}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 8], fov: 40 }}
      gl={{ antialias: tier === "high", alpha: true, powerPreference: "high-performance" }}
      eventSource={document.body}
      eventPrefix="client"
    >
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#fff6ea", "#146b68", 0.5]} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow={tier === "high"} shadow-mapSize={[1024, 1024]} />
      {slots.map((s, i) => (
        <Floater key={i} slot={s} i={i} count={count} progress={progress} />
      ))}
    </Canvas>
  );
}
