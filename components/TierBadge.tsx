export function TierBadge({ tier, label }: { tier?: string | null; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-sm font-bold text-sageink">
      {label && <span className="font-medium">{label}</span>}
      {tier ?? "–"}
    </span>
  );
}
