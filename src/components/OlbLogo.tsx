type Props = { className?: string; variant?: "light" | "dark" };

export function OlbLogo({ className, variant = "dark" }: Props) {
  const teal = variant === "dark" ? "#006875" : "#FFFFFF";
  const orange = "#F6A000";
  return (
    <div className={className} aria-label="Ouest Lyonnais Business">
      <svg viewBox="0 0 220 64" className="h-full w-auto" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill={teal} />
        <text
          x="32"
          y="40"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
          fontWeight="800"
          fontSize="22"
          fill="#FFFFFF"
          letterSpacing="1"
        >
          OLB
        </text>
        <rect x="6" y="50" width="52" height="4" rx="2" fill={orange} />
        <text
          x="72"
          y="30"
          fontFamily="Inter, sans-serif"
          fontWeight="800"
          fontSize="18"
          fill={teal}
          letterSpacing="0.5"
        >
          Ouest Lyonnais
        </text>
        <text
          x="72"
          y="50"
          fontFamily="Inter, sans-serif"
          fontWeight="600"
          fontSize="14"
          fill={orange}
          letterSpacing="2"
        >
          BUSINESS
        </text>
      </svg>
    </div>
  );
}
