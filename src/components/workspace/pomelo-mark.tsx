export function PomeloMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 44"
      fill="none"
      aria-hidden="true"
    >
      <path d="M20 9C21 2 29 1 34 3c-2 5-8 7-14 6Z" fill="var(--accent)" />
      <circle
        cx="20"
        cy="25"
        r="17"
        fill="var(--panel)"
        stroke="var(--accent)"
        strokeWidth="2.5"
      />
      <g fill="var(--pomelo-pink)">
        <path d="m18 13 .3 10-8-5A13 13 0 0 1 18 13Z" />
        <path d="m22 13-.3 10 8-5A13 13 0 0 0 22 13Z" />
        <path d="m31 21-9 4 8 5a13 13 0 0 0 1-9Z" />
        <path d="m9 21 9 4-8 5a13 13 0 0 1-1-9Z" />
        <path d="m12 33 7-6-.5 10a13 13 0 0 1-6.5-4Z" />
        <path d="m28 33-7-6 .5 10a13 13 0 0 0 6.5-4Z" />
      </g>
    </svg>
  );
}
