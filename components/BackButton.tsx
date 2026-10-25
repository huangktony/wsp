import Link from "next/link";

export function BackButton({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`flex min-h-11 w-fit items-center gap-1 rounded-full border border-indigo/20 bg-pistachio py-2 pl-3 pr-4 text-[15px] font-semibold text-indigo hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      Back
    </Link>
  );
}
