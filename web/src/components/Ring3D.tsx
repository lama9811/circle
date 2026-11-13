// The savings circle as a living 3D object: member coins stand on a brass ring,
// contributions arc into a glass pot at the centre, and the pot bursts out to
// the round's recipient on payout. Driven by real contract state (or a demo).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type SeatState = "paid" | "unpaid" | "waiting" | "joined";
export interface Seat {
  label: string;
  state: SeatState;
  isMe?: boolean;
}

export interface RingProps {
  seats: Seat[];
  recipient: number | null; // index of this round's recipient
  round: number; // increments on each payout → triggers burst
  compact?: boolean;
}

const C = {
  brass: "#E8B04A",
  jade: "#3CC6A4",
  hibiscus: "#F0507F",
  mist: "#ECEFFB",
  adire: "#2A3790",
};
const R = 2.35;
const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function seatPos(i: number, n: number): THREE.Vector3 {
  const a = (i / n) * Math.PI * 2 + Math.PI / 2; // seat 1 at the front
  return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
}

const stateColor = (s: SeatState) =>
  s === "paid" ? C.jade : s === "unpaid" ? C.hibiscus : s === "joined" ? C.jade : "#5a6396";

/* ---------- label anchors: 3D points that drive plain DOM labels ---------- */
const Anchors = createContext<{ current: (THREE.Object3D | null)[] }>({ current: [] });

function LabelProjector({ labels }: { labels: React.RefObject<(HTMLDivElement | null)[]> }) {
  const anchors = useContext(Anchors);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    anchors.current.forEach((a, i) => {
      const el = labels.current?.[i];
      if (!a || !el) return;
      a.getWorldPosition(v).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(-50%, 0) translate(${x}px, ${y}px)`;
      el.style.opacity = "1";
    });
  });
  return null;
}

/* ---------- pieces ---------- */

const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 64);
const rimGeo = new THREE.TorusGeometry(0.42, 0.035, 12, 64);
const flatCoinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.055, 40);

function brassMat() {
  return new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.88, roughness: 0.26, envMapIntensity: 1.6, emissive: "#3a2508", emissiveIntensity: 0.35 });
}

function MemberCoin({ i, n, seat, isRecipient, compact }: { i: number; n: number; seat: Seat; isRecipient: boolean; compact?: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const halo = useRef<THREE.MeshStandardMaterial>(null!);
  const pos = useMemo(() => seatPos(i, n), [i, n]);
  const mat = useMemo(brassMat, []);
  const target = new THREE.Color(stateColor(seat.state));
  const reduced = prefersReduced();
  const anchors = useContext(Anchors);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const lift = isRecipient ? 0.55 + (reduced ? 0 : Math.sin(t * 2) * 0.06) : 0.42;
    g.current.position.y = THREE.MathUtils.damp(g.current.position.y, lift, 6, dt);
    // Face the centre; recipient slowly spins to catch the light.
    const face = Math.atan2(pos.x, pos.z);
    g.current.rotation.y = isRecipient && !reduced ? face + Math.sin(t * 1.4) * 0.6 : THREE.MathUtils.damp(g.current.rotation.y, face, 5, dt);
    halo.current.color.lerp(target, 0.08);
    halo.current.emissive.lerp(target, 0.08);
    halo.current.emissiveIntensity = THREE.MathUtils.damp(halo.current.emissiveIntensity, seat.state === "unpaid" ? 1.2 + Math.sin(t * 4) * 0.5 : 1.4, 4, dt);
  });

  return (
    <group position={[pos.x, 0, pos.z]}>
      <group ref={g} position={[0, 0.42, 0]}>
        <mesh geometry={coinGeo} material={mat} rotation={[Math.PI / 2, 0, 0]} castShadow />
        <mesh geometry={rimGeo} material={mat} position={[0, 0, 0.05]} />
        <mesh geometry={rimGeo} material={mat} position={[0, 0, -0.05]} />
        {seat.isMe && (
          <mesh position={[0, 0, 0.056]}>
            <circleGeometry args={[0.16, 32]} />
            <meshStandardMaterial color={C.adire} metalness={0.4} roughness={0.4} />
          </mesh>
        )}
      </group>
      {/* status halo on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.36, 0.5, 48]} />
        <meshStandardMaterial ref={halo} color={stateColor(seat.state)} emissive={stateColor(seat.state)} emissiveIntensity={1.4} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      {isRecipient && <Beam />}
      {!compact && <object3D ref={(o) => { anchors.current[i] = o; }} position={[0, 0, 0.35]} />}
    </group>
  );
}

export const seatLabel = (s: SeatState) => (s === "paid" ? "paid" : s === "unpaid" ? "not paid yet" : s === "joined" ? "deposit in" : "hasn't joined");

function Beam() {
  const m = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((s) => (m.current.opacity = 0.09 + Math.sin(s.clock.elapsedTime * 2.2) * 0.04));
  return (
    <mesh position={[0, 0.9, 0]}>
      <cylinderGeometry args={[0.18, 0.46, 1.8, 32, 1, true]} />
      <meshBasicMaterial ref={m} color={C.brass} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function Pot({ fill, n }: { fill: number; n: number }) {
  const mat = useMemo(brassMat, []);
  const stack = useRef<THREE.Group>(null!);
  useFrame((s) => {
    if (!prefersReduced()) stack.current.rotation.y = s.clock.elapsedTime * 0.25;
  });
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.62, 0.5, 1.1, 64, 1, true]} />
        <meshPhysicalMaterial color="#cfd8ff" transmission={1} thickness={0.4} roughness={0.08} ior={1.4} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 48]} />
        <meshStandardMaterial color="#1f2a6e" metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={stack}>
        {Array.from({ length: fill }).map((_, k) => (
          <mesh key={k} geometry={flatCoinGeo} material={mat} position={[Math.sin(k * 2.1) * 0.05, 0.06 + k * 0.06, Math.cos(k * 2.1) * 0.05]} castShadow />
        ))}
      </group>
      {/* capacity ticks: how full the pot is */}
      {Array.from({ length: n }).map((_, k) => {
        const a = (k / n) * Math.PI * 2;
        return (
          <mesh key={k} position={[Math.cos(a) * 0.82, 0.01, Math.sin(a) * 0.82]} rotation={[-Math.PI / 2, 0, -a]}>
            <planeGeometry args={[0.16, 0.05]} />
            <meshBasicMaterial color={k < fill ? C.brass : "#3a4278"} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

interface Flight { id: number; from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; delay: number }

function Flights({ flights, onDone }: { flights: Flight[]; onDone: (id: number) => void }) {
  return <>{flights.map((f) => <FlyingCoin key={f.id} f={f} onDone={onDone} />)}</>;
}

function FlyingCoin({ f, onDone }: { f: Flight; onDone: (id: number) => void }) {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useMemo(brassMat, []);
  const done = useRef(false);
  useFrame((s) => {
    const p = (s.clock.elapsedTime - f.t0 - f.delay) / f.dur;
    if (p < 0) { ref.current.visible = false; return; }
    ref.current.visible = true;
    const e = p >= 1 ? 1 : 1 - Math.pow(1 - p, 3);
    ref.current.position.lerpVectors(f.from, f.to, e);
    ref.current.position.y = THREE.MathUtils.lerp(f.from.y, f.to.y, e) + Math.sin(e * Math.PI) * 1.6;
    ref.current.rotation.x = e * Math.PI * 4;
    if (p >= 1 && !done.current) { done.current = true; onDone(f.id); }
  });
  return <mesh ref={ref} geometry={flatCoinGeo} material={mat} visible={false} castShadow />;
}

/** Keep the whole ring in frame whatever the canvas aspect ratio. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const k = Math.max(1, 1.02 / aspect); // pull back only as much as a narrow canvas needs
    camera.position.set(0, 4.4 * k, 8.4 * k);
    camera.lookAt(0, 0.3, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Scene({ seats, recipient, round, compact }: RingProps) {
  const root = useRef<THREE.Group>(null!);
  const n = seats.length;
  const paidCount = seats.filter((s) => s.state === "paid").length;
  const [flights, setFlights] = useState<Flight[]>([]);
  const [shown, setShown] = useState(paidCount); // coins visible in the pot
  const prev = useRef<{ seats: Seat[]; round: number; recipient: number | null } | null>(null);
  const clock = useRef(0);
  const idc = useRef(0);
  const reduced = prefersReduced();

  useFrame((s, dt) => {
    clock.current = s.clock.elapsedTime;
    if (reduced) return;
    // gentle parallax toward the pointer + slow drift
    const tx = s.pointer.y * 0.12;
    const ty = s.pointer.x * 0.35 + s.clock.elapsedTime * 0.04;
    root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, tx, 3, dt);
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, ty, 3, dt);
  });

  // Diff incoming state → animations.
  useEffect(() => {
    const p = prev.current;
    prev.current = { seats, round, recipient };
    if (!p || p.seats.length !== n) { setShown(paidCount); return; }
    const center = new THREE.Vector3(0, 0.5, 0);
    if (round !== p.round && p.recipient !== null) {
      // payout: the whole pot flies to last round's recipient
      const to = seatPos(p.recipient, n).setY(0.5);
      const burst: Flight[] = Array.from({ length: n }).map((_, k) => ({
        id: ++idc.current, from: center.clone().setY(0.4 + k * 0.06), to, t0: clock.current, dur: reduced ? 0.01 : 0.9, delay: reduced ? 0 : k * 0.08,
      }));
      setShown(0);
      setFlights((f) => [...f, ...burst]);
      return;
    }
    const newly: Flight[] = [];
    seats.forEach((s, i) => {
      if (s.state === "paid" && p.seats[i]?.state !== "paid") {
        newly.push({ id: ++idc.current, from: seatPos(i, n).setY(0.45), to: center, t0: clock.current, dur: reduced ? 0.01 : 0.8, delay: 0 });
      }
    });
    if (newly.length) setFlights((f) => [...f, ...newly]);
    else setShown(paidCount);
  }, [seats, round, recipient, n, paidCount, reduced]);

  const onDone = (id: number) => {
    setFlights((f) => {
      const fl = f.find((x) => x.id === id);
      if (fl && fl.to.lengthSq() < 1) setShown((v) => Math.min(n, v + 1));
      return f.filter((x) => x.id !== id);
    });
  };

  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <torusGeometry args={[R, 0.022, 16, 160]} />
        <meshStandardMaterial color={C.brass} emissive={C.brass} emissiveIntensity={0.35} metalness={1} roughness={0.3} />
      </mesh>
      {/* soft indigo glow under the ring instead of a hard floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[R + 0.35, 96]} />
        <meshBasicMaterial color="#2A3790" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {seats.map((s, i) => (
        <MemberCoin key={i} i={i} n={n} seat={s} isRecipient={i === recipient} compact={compact} />
      ))}
      <Pot fill={shown} n={n} />
      <Flights flights={flights} onDone={onDone} />
      <ContactShadows position={[0, 0.006, 0]} opacity={0.55} scale={8} blur={2.4} far={2} color="#05081c" />
    </group>
  );
}

export function Ring3D(props: RingProps & { className?: string; height?: number }) {
  const anchors = useRef<(THREE.Object3D | null)[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  anchors.current.length = props.seats.length;
  return (
    <div className={`ring3d ${props.className ?? ""}`} style={{ height: props.height ?? 460 }}>
      <ul className="sr-only">
        {props.seats.map((s, i) => <li key={i}>{s.label}: {i === props.recipient ? "gets the pot this round" : seatLabel(s.state)}</li>)}
      </ul>
      {!props.compact && (
        <div className="seat-layer" aria-hidden>
          {props.seats.map((s, i) => (
            <div key={i} ref={(el) => { labels.current[i] = el; }} className={`seat-tag ${s.state}${s.isMe ? " me" : ""}`}>
              <b>{s.label}</b>
              <span>{i === props.recipient ? "gets the pot" : seatLabel(s.state)}</span>
            </div>
          ))}
        </div>
      )}
      <Anchors.Provider value={anchors}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 4.4, 8.4], fov: 36 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 6, 6]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
        <pointLight position={[0, 2.2, 0]} intensity={6} color={C.brass} distance={5} />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.2} position={[0, 5, -6]} scale={[12, 4, 1]} color="#8ea0ff" />
          <Lightformer intensity={3} position={[-5, 2, 2]} scale={[2, 6, 1]} color="#ffd590" />
          <Lightformer intensity={1.5} position={[5, 1, 3]} scale={[3, 3, 1]} color={C.hibiscus} />
          <Lightformer form="ring" intensity={2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={4} />
          <Lightformer intensity={2.6} position={[0, 2.5, 9]} scale={[10, 3, 1]} color="#ffe2a8" />
        </Environment>
        <FitCamera />
        <Scene {...props} />
        <LabelProjector labels={labels} />
      </Canvas>
      </Anchors.Provider>
    </div>
  );
}

/** Self-running demo: members pay one by one, the pot pays out, the turn moves on. */
export function DemoRing({ height }: { height?: number }) {
  const names = ["Amina", "Kofi", "Lucía", "Wanjiru", "Tunde", "Rosa"];
  const n = names.length;
  const [paid, setPaid] = useState<boolean[]>(() => Array(n).fill(false));
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (prefersReduced()) return;
    const t = setTimeout(() => {
      const next = paid.findIndex((p) => !p);
      if (next === -1) { setRound((r) => r + 1); setPaid(Array(n).fill(false)); }
      else setPaid((p) => p.map((v, i) => (i === next ? true : v)));
    }, paid.every(Boolean) ? 900 : 750);
    return () => clearTimeout(t);
  }, [paid, n]);

  const seats: Seat[] = names.map((label, i) => ({ label, state: paid[i] ? "paid" : "unpaid" }));
  return <Ring3D seats={seats} recipient={round % n} round={round} height={height} />;
}
