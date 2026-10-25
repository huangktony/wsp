"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/groups", label: "Groups" },
  { href: "/travel", label: "Travel" },
  { href: "/spending", label: "Budget" },
  { href: "/profile", label: "Profile" },
];
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";

export function TabBar() {
  const path = usePathname();
  const isTravel = path === "/travel" || path.startsWith("/travel/");
  const addHref = isTravel ? "/travel/new" : "/groups/new";
  const addLabel = isTravel ? "New trip" : "New group";
  // The floating + sits above the bar on the main tab screens only, not on group, trip or form pages.
  const showAdd = ["/groups", "/travel", "/spending", "/profile"].includes(path);

  return (
    <>
      {showAdd && (
        <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex w-full max-w-[390px] -translate-x-1/2 justify-end px-4">
          <Link
            href={addHref}
            aria-label={addLabel}
            className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-matcha text-matchaink shadow-lg ${focus}`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </Link>
        </div>
      )}
      <nav
        aria-label="Main navigation"
        className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex h-16 w-[calc(100%-32px)] max-w-[358px] -translate-x-1/2 items-center justify-around rounded-full border border-azure bg-nav px-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      >
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);

          return (
            <Link
              key={t.href}
              href={t.href}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${focus} ${active ? "bg-pistachio text-ink" : "text-inactive"}`}
            >
              <svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill={active ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={t.label === "Groups" ? 2 : 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {t.label === "Groups" ? (
                  <>
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" />
                    <circle cx="17" cy="9" r="2.5" />
                    <path d="M17.5 14.2c2.4.3 4 2.1 4 4.8h-3.5" />
                  </>
                ) : t.label === "Travel" ? (
                  <path d="m3 11 18-8-8 18-3-8-7-2 18-8-11 10" />
                ) : t.label === "Budget" ? (
                  active ? (
                    <>
                      <rect x="4" y="13" width="2" height="7" />
                      <rect x="11" y="5" width="2" height="15" />
                      <rect x="18" y="10" width="2" height="10" />
                    </>
                  ) : (
                    <path d="M5 20v-7M12 20V5M19 20V10" />
                  )
                ) : (
                  <>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
                  </>
                )}
              </svg>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
