import { memo } from "react";

interface ConfettiBurstProps {
  active: boolean;
}

const PARTICLES = [
  { tx: "-28px", ty: "-26px", rot: "-45deg", color: "#60a5fa" },
  { tx: "22px", ty: "-30px", rot: "50deg", color: "#93c5fd" },
  { tx: "-12px", ty: "-36px", rot: "-20deg", color: "#fbbf24" },
  { tx: "30px", ty: "-14px", rot: "75deg", color: "#6ee7b7" },
  { tx: "-34px", ty: "-6px", rot: "-70deg", color: "#f9a8d4" },
  { tx: "28px", ty: "16px", rot: "110deg", color: "#c4b5fd" },
  { tx: "-22px", ty: "22px", rot: "-115deg", color: "#86efac" },
  { tx: "10px", ty: "28px", rot: "140deg", color: "#7dd3fc" },
  { tx: "-4px", ty: "-28px", rot: "15deg", color: "#fde68a" },
  { tx: "18px", ty: "-20px", rot: "65deg", color: "#a7f3d0" },
  { tx: "-18px", ty: "12px", rot: "-90deg", color: "#ddd6fe" },
  { tx: "6px", ty: "-34px", rot: "35deg", color: "#fbcfe8" },
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
              animationDelay: `${i * 18}ms`,
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
