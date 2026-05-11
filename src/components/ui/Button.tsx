import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline" | "accent";
type Size = "sm" | "md" | "lg" | "icon";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 active:opacity-95 shadow-sm",
  secondary:
    "bg-muted text-foreground hover:bg-muted/70 active:bg-muted/80",
  ghost: "bg-transparent hover:bg-muted/60 text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-90 shadow-sm",
  outline:
    "border border-border bg-card hover:bg-muted text-foreground",
  accent:
    "bg-accent text-accent-foreground hover:opacity-90 shadow-sm",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-md",
  md: "h-11 px-4 text-sm rounded-lg",
  lg: "h-12 px-5 text-base rounded-lg",
  icon: "h-10 w-10 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium",
        "transition-colors no-tap-highlight select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
