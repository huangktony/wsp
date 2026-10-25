/** Photo if the user has one, otherwise a colored circle with their first initial. `className` sets size, colors and text size. */
export function Avatar({ name, src, className = "" }: { name: string; src?: string | null; className?: string }) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold ${className}`;
  if (src) return <img src={src} alt="" aria-hidden="true" className={`${base} object-cover`} />;
  return <span aria-hidden="true" className={base}>{name.trim().charAt(0).toUpperCase()}</span>;
}
