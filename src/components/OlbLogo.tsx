import logo from "@/assets/olb-logo.png.asset.json";

type Props = { className?: string; variant?: "light" | "dark" };

export function OlbLogo({ className }: Props) {
  return (
    <img
      src={logo.url}
      alt="Ouest Lyonnais Business"
      className={className ?? "h-12 w-auto"}
      style={{ objectFit: "contain" }}
    />
  );
}
