This keeps Travel, uses one context-aware add button, and preserves safe-area spacing and correct active tabs.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/groups", label: "Groups" },
  { href: "/travel", label: "Travel" },
  { href: "/spending", label: "Budget" },
  { href: "/groups/new", label: "New group" },
  { href: "/profile", label: "Profile" },
];

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";

export function TabBar() {
  const path = usePathname();
  const isTravel = path === "/travel" || path.startsWith("/travel/");
  const addHref = isTravel ? "/travel/new" : "/groups/new";
  const addLabel = isTravel ? "New trip" : "New group";
  const isCreating =
    path === addHref || path.startsWith(`${addHref}/`);

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-1/2 z-50 flex h-[calc(92px+env(safe-area-inset-bottom,0px))] w-full max-w-[390px] -translate-x-1/2 items-start justify-around border-t border-azure bg-surface px-7 pt-3"
    >
      {TABS.map((t) => {
        const add = t.href === "/groups/new";
        const href = add ? addHref : t.href;
        const label = add ? addLabel : t.label;
        const active = add
          ? isCreating
          : !isCreating &&
            (path === href || path.startsWith(`${href}/`));

        return (
          <Link
            key={t.href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center justify-center rounded-full ${focus} ${
              add ? "h-12 w-12 bg-matcha" : "h-11 w-11"
            } ${
              add
                ? "text-matchaink"
                : active
                  ? "text-indigo"
                  : "text-inactive"
            }`}
          >
            <svg
              width={28}
              height={28}
              viewBox="0 0 24 24"
              fill={active && !add ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={add ? 2.6 : t.label === "Groups" ? 2 : 2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {add ? (
                <path d="M12 5v14M5 12h14" />
              ) : t.label === "Groups" ? (
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
  );
}
```