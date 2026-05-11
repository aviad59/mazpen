import { cn } from "@/lib/utils";

interface Props {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/** Show participant initials in a colored circle — no external image deps. */
export function Avatar({ name, size = "sm", className }: Props) {
  // Use first 2 Hebrew chars or initials
  const initials = (name || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("");
  const hue = hashHue(name);

  const dim =
    size === "xs"
      ? "h-6 w-6 text-[10px]"
      : size === "md"
      ? "h-9 w-9 text-sm"
      : "h-7 w-7 text-xs";

  return (
    <span
      title={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white shadow-inner",
        dim,
        className
      )}
      style={{ background: `hsl(${hue} 70% 45%)` }}
    >
      {initials || "?"}
    </span>
  );
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
