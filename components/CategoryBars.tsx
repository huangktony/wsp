export function CategoryBars({ data }: { data: { name: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.name}>
          <div className="mb-1 flex justify-between text-sm font-semibold"><span className="capitalize">{d.name}</span><span>${d.total}</span></div>
          <div className="h-3 rounded-full bg-mintsoft"><div className="h-3 rounded-full bg-sage" style={{ width: `${(d.total / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
