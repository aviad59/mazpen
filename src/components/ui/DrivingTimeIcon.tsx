interface Props {
  size?: number;
  className?: string;
}

/** Half-car / half-phone icon indicating driving-time preference. */
export function DrivingTimeIcon({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 24 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="עדיפות לזמן נהיגה"
    >
      {/* ── Car (left half) ── */}
      <path
        d="M1 11h9.5V8.5L8.5 5.5H3.5L1 8.5V11Z"
        fill="currentColor"
      />
      <circle cx="3" cy="12.2" r="1.6" fill="currentColor" />
      <circle cx="8" cy="12.2" r="1.6" fill="currentColor" />

      {/* ── Divider ── */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="16"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeOpacity="0.35"
      />

      {/* ── Phone (right half) ── */}
      <rect
        x="13.5"
        y="2.5"
        width="9"
        height="13"
        rx="1.8"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="18" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
