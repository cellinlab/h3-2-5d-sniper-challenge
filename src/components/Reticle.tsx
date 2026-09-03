/**
 * Inline SVG reticle. Two modes:
 *  - observation: a fine central cross with an open center so it never
 *    hides a small target.
 *  - scope: a larger cross with mil-style tick marks and a clear
 *    4-way bracket, kept deliberately restrained.
 */

type Props = {
  variant: "observation" | "scope";
  className?: string;
};

export const Reticle = ({ variant, className }: Props) => {
  if (variant === "observation") {
    return (
      <svg className={className} viewBox="0 0 22 22" aria-hidden>
        <g stroke="rgba(220, 232, 248, 0.85)" strokeWidth="1" fill="none">
          <circle cx="11" cy="11" r="6" />
          <line x1="11" y1="0" x2="11" y2="6" />
          <line x1="11" y1="16" x2="11" y2="22" />
          <line x1="0" y1="11" x2="6" y2="11" />
          <line x1="16" y1="11" x2="22" y2="11" />
        </g>
        <circle cx="11" cy="11" r="0.6" fill="rgba(214, 150, 74, 0.9)" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 320 320" aria-hidden>
      <g stroke="rgba(220, 232, 248, 0.85)" strokeWidth="1.5" fill="none">
        <line x1="160" y1="0" x2="160" y2="120" />
        <line x1="160" y1="200" x2="160" y2="320" />
        <line x1="0" y1="160" x2="120" y2="160" />
        <line x1="200" y1="160" x2="320" y2="160" />
        <circle cx="160" cy="160" r="6" />
        <circle cx="160" cy="160" r="40" />
        <line x1="160" y1="60" x2="160" y2="80" />
        <line x1="160" y1="240" x2="160" y2="260" />
        <line x1="60" y1="160" x2="80" y2="160" />
        <line x1="240" y1="160" x2="260" y2="160" />
        <g stroke="rgba(214, 150, 74, 0.7)">
          <line x1="20" y1="20" x2="60" y2="20" />
          <line x1="20" y1="20" x2="20" y2="60" />
          <line x1="300" y1="20" x2="260" y2="20" />
          <line x1="300" y1="20" x2="300" y2="60" />
          <line x1="20" y1="300" x2="60" y2="300" />
          <line x1="20" y1="300" x2="20" y2="260" />
          <line x1="300" y1="300" x2="260" y2="300" />
          <line x1="300" y1="300" x2="300" y2="260" />
        </g>
      </g>
    </svg>
  );
};
