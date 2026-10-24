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
    <nav aria-label="Main navigation" className="fixed bottom-0 left-1/2 z-20 flex h-[92px] w-full max-w-[390px] -translate-x-1/2 items-start justify-around border-t border-azure bg-white px-7 pt-3">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-label={t.plus ? "New group" : t.label} aria-current={active ? "page" : undefined} className={`flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo ${t.plus ? "-mt-0.5 h-12 w-12 bg-matcha text-indigo" : `h-11 w-11 ${active ? "text-indigo" : "text-inactive"}`}`}>
            <svg width={t.plus ? 24 : 28} height={t.plus ? 24 : 28} viewBox="0 0 24 24" fill={active && !t.plus ? "currentColor" : "none"} stroke="currentColor" strokeWidth={t.plus ? 2.6 : t.label === "Groups" ? 2 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.plus ? <path d="M12 5v14M5 12h14" /> : t.label === "Groups" ? <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.2c2.4.3 4 2.1 4 4.8h-3.5" /></> : t.label === "Budget" ? <path d="M5 20v-7M12 20V5M19 20V10" /> : <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>}
            </svg>
          </Link>
        );
      })}
    </nav>
  );
}
