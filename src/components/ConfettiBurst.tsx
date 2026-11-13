import { memo } from "react";

interface ConfettiBurstProps {
  active: boolean;
}

const PARTICLES = [
  { tx: "-28px", ty: "-26px", rot: "-45deg", color: "#3b82f6" },
  { tx: "22px", ty: "-30px", rot: "50deg", color: "#60a5fa" },
  { tx: "-12px", ty: "-36px", rot: "-20deg", color: "#f59e0b" },
  { tx: "30px", ty: "-14px", rot: "75deg", color: "#10b981" },
  { tx: "-34px", ty: "-6px", rot: "-70deg", color: "#ec4899" },
  { tx: "28px", ty: "16px", rot: "110deg", color: "#8b5cf6" },
  { tx: "-22px", ty: "22px", rot: "-115deg", color: "#22c55e" },
  { tx: "10px", ty: "28px", rot: "140deg", color: "#3b82f6" },
  { tx: "-4px", ty: "-28px", rot: "15deg", color: "#fbbf24" },
  { tx: "18px", ty: "-20px", rot: "65deg", color: "#34d399" },
  { tx: "-18px", ty: "12px", rot: "-90deg", color: "#a855f7" },
  { tx: "6px", ty: "-34px", rot: "35deg", color: "#f472b6" },
];

export const ConfettiBurst = memo(function ConfettiBurst({ active }: ConfettiBurstProps) {
  if (!active) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible z-20"
    >
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              backgroundColor: p.color,
              "--tx": p.tx,
              "--ty": p.ty,
              "--rot": p.rot,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
});
