/** Initials from a full name: first letter of the first and last words, e.g. "Demo Dana" → "DD", "Sam" → "S". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Photo if the user has one, otherwise a colored circle with their initials. `className` sets size, colors and text size. */
export function Avatar({ name, src, className = "" }: { name: string; src?: string | null; className?: string }) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold ${className}`;
  if (src) return <img src={src} alt="" aria-hidden="true" className={`${base} object-cover`} />;
  return <span aria-hidden="true" className={base}>{initials(name)}</span>;
}
