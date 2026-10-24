"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/groups", label: "Groups" },
  { href: "/spending", label: "Budget" },
  { href: "/groups/new", label: "+", plus: true },
  { href: "/profile", label: "Profile" },
];
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 flex h-20 w-full max-w-[430px] -translate-x-1/2 items-center justify-around border-t border-line bg-white px-4">
      {TABS.map((t) =>
        t.plus ? (
          <Link key={t.href} href={t.href} aria-label="New group" className="flex h-14 w-14 items-center justify-center rounded-full bg-deep text-3xl text-white">+</Link>
        ) : (
          <Link key={t.href} href={t.href} className={`px-3 py-2 text-sm font-semibold ${path === t.href ? "text-ink" : "text-muted opacity-60"}`}>{t.label}</Link>
        ),
      )}
    </nav>
  );
}
