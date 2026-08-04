export function MapPin({
  className = "",
  color = "#E8A33D",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      className={className}
      aria-hidden
      fill="none"
    >
      <path
        d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"
        fill={color}
        stroke="#12151C"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="10" r="3" fill="#12151C" />
    </svg>
  );
}