"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import { Page } from "@/components/Page";
import { Smiley } from "@/components/Smiley";
import { useApi } from "@/lib/client";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const avatarColors = ["bg-orchid text-orchidink", "bg-peach text-indigo", "bg-matcha text-matchaink", "bg-azure text-indigo"];
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const initials = (name: string) => {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : words[0].slice(0, 2)).toUpperCase();
};
const meta = (group: any) => [group.city, typeof group.members === "number" ? `${group.members} ${group.members === 1 ? "member" : "members"}` : null].filter(Boolean).join(" · ");

function GroupsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || Boolean(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasSearching = useRef(false);
  useEffect(() => {
    if (searching) inputRef.current?.focus();
    else if (wasSearching.current) triggerRef.current?.focus();
    wasSearching.current = searching;
  }, [searching]);
  const updateQuery = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };
  const closeSearch = () => {
    setSearchOpen(false);
    updateQuery("");
  };
  const { data, error } = useApi<any[]>("/api/groups");
  const term = query.trim().toLowerCase();
  const results = data?.map((group, index) => ({ group, index })).filter(({ group }) =>
    !term || [group.name, group.city, group.status].some((value) => typeof value === "string" && value.toLowerCase().includes(term))
  );
  const featured = (results?.find(({ group }) => group.status === "VOTING OPEN") ?? results?.[0])?.group;

  return (
    <Page variant="plain" tabs>
      <div className={`${inter.className} bg-white text-indigo`}>
        <header className="flex items-center justify-between px-6 pb-3 pt-6">
          {searching ? <div role="search" className="flex w-full items-center gap-3" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSearch(); } }}>
            <div className="relative min-w-0 flex-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute left-4 top-3"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
              <input ref={inputRef} type="search" aria-label="Search your groups" placeholder="Search your groups" value={query} onChange={(event) => { setSearchOpen(true); updateQuery(event.target.value); }} className="h-11 w-full rounded-[22px] border-2 border-outline bg-white pl-11 pr-4 text-base text-indigo placeholder:text-secondary focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo focus:ring-offset-2" />
            </div>
            <button type="button" aria-label="Close search" onClick={closeSearch} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pistachio ${focus}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div> : <>
            <h1 className="font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Groups</h1>
            <button ref={triggerRef} type="button" aria-label="Search groups" aria-expanded={searching} onClick={() => setSearchOpen(true)} className={`flex h-11 w-11 items-center justify-center rounded-full bg-pistachio ${focus}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" />
              </svg>
            </button>
          </>}
        </header>

        <p className="sr-only" aria-live="polite" aria-atomic="true">{data && !error ? `${results?.length ?? 0} groups found` : ""}</p>
        <nav aria-label="Your groups" className="flex gap-4 overflow-x-auto px-6 pb-4 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!searching && <Link href="/groups/new" className={`flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-xl text-xs font-semibold ${focus}`}>
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-outline">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            New
          </Link>}
          {results?.map(({ group, index }) => (
            <Link key={group.id} href={`/groups/${group.id}`} aria-label={group.name} className={`flex w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-xl text-xs ${index === 0 ? "font-bold" : "font-semibold"} ${focus}`}>
              <span className={`h-16 w-16 rounded-full border-[3px] p-[3px] ${index === 0 ? "border-matcha" : "border-azure"}`}>
                <span className={`flex h-full w-full items-center justify-center rounded-full text-xl font-extrabold ${avatarColors[index % avatarColors.length]}`}>{initials(group.name)}</span>
              </span>
              <span className="w-full truncate text-center">{group.name.trim().split(/\s+/)[0]}</span>
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-4 px-6">
          {error && <p role="alert" className="rounded-[20px] border border-orchid bg-white p-4 text-sm text-maroon">{error}</p>}
          {featured && (
            <article className="relative flex flex-col rounded-3xl bg-pistachio">
              <div className="flex h-[84px] items-start justify-between rounded-t-3xl bg-matcha px-[18px] py-4">
                {featured.status && <span className="rounded-xl bg-indigo px-2.5 py-[5px] text-xs font-extrabold text-white">{featured.status}</span>}
                <Smiley size={48} />
              </div>
              <div className="flex flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
                <h2 className="font-[inherit] text-[22px] font-extrabold leading-tight tracking-[-0.5px]">
                  <Link href={`/groups/${featured.id}`} className={`after:absolute after:inset-0 after:rounded-3xl ${focus}`}>{featured.name}</Link>
                </h2>
                <p className="text-sm text-secondary">{meta(featured)}</p>
                <div className="mt-1.5 flex items-center justify-end">
                  <Link href={`/groups/${featured.id}/plans`} className={`relative z-10 flex min-h-11 items-center gap-1.5 rounded-full bg-indigo px-[18px] py-2 text-sm font-bold text-white shadow-md hover:brightness-90 active:brightness-75 ${focus}`}>Vote now <span aria-hidden="true">→</span></Link>
                </div>
              </div>
            </article>
          )}
          {results?.map(({ group, index }) => group.id !== featured?.id && (
            <Link key={group.id} href={`/groups/${group.id}`} className={`flex items-center gap-3.5 rounded-[20px] border border-azure bg-white px-[18px] py-4 ${focus}`}>
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${avatarColors[index % avatarColors.length]}`}>{initials(group.name)}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className="break-words font-[inherit] text-[17px] font-extrabold leading-tight">{group.name}</h2>
                <p className="text-sm text-secondary">{meta(group)}</p>
              </div>
              {group.status && <span className={`shrink-0 rounded-xl px-2.5 py-[5px] text-xs font-extrabold uppercase ${group.status === "SET UP" ? "bg-orchid text-orchidink" : group.status === "VOTING OPEN" ? "bg-matcha text-matchaink" : "bg-pistachio text-indigo"}`}>{group.status}</span>}
            </Link>
          ))}
          {term && data && !error && results?.length === 0 && <div className="py-6 text-center">
            <p className="break-words text-[15px] text-secondary">No groups match “{query.trim()}”</p>
            <Link href="/groups/new" className={`mt-2 inline-flex min-h-11 items-center justify-center rounded text-sm font-bold text-maroon ${focus}`}>Join with a code or start a group</Link>
          </div>}
          {!term && data?.length === 0 && <p className="rounded-[20px] border border-azure p-4 text-sm text-secondary">No groups yet. Tap + to create or join one.</p>}
        </div>
      </div>
    </Page>
  );
}

export default function Groups() {
  return <Suspense fallback={<Page variant="plain" tabs><header className={`${inter.className} px-6 pb-3 pt-6 text-indigo`}><h1 className="font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Groups</h1></header></Page>}><GroupsContent /></Suspense>;
}
