// Loading placeholders. Shaped like the real layout and sized close to it, so nothing jumps when the data arrives.
// Uses an existing token, so it works in dark mode. The pulse is off when the viewer prefers reduced motion.

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-azure/60 motion-reduce:animate-none ${className}`} />;
}

/** Wrap a page's placeholders once, so a screen reader hears "Loading" a single time. */
export function Skeleton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}
