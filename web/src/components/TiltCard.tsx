import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Card that tilts toward the pointer in 3D, like a coin catching light. */
export function TiltCard({ to, children }: { to: string; children: ReactNode }) {
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [8, -8]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(x, [0, 1], [-10, 10]), { stiffness: 200, damping: 20 });
  const glow = useTransform([x, y], ([a, b]) => `radial-gradient(400px circle at ${(a as number) * 100}% ${(b as number) * 100}%, rgba(232,176,74,.16), transparent 50%)`);
  return (
    <motion.div style={{ perspective: 900 }}>
      <motion.div
        style={{ rotateX: rx, rotateY: ry, backgroundImage: glow }}
        className="panel tight circle-card-wrap"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
        onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
        whileTap={{ scale: 0.98 }}
      >
        <Link to={to} className="circle-card">{children}</Link>
      </motion.div>
    </motion.div>
  );
}
