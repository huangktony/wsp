import { BackButton } from "./BackButton";
import { TabBar } from "./TabBar";

export function Page({ title, back, tabs, children, variant }: { title?: string; back?: string; tabs?: boolean; children: React.ReactNode; variant?: "plain" }) {
  return (
    <main className={`${variant === "plain" ? "mx-auto w-full max-w-[390px]" : "px-5 pt-6"} ${tabs ? "pb-28" : "pb-10"}`}>
      {back && <BackButton href={back} className="mb-5" />}
      {title && <h1 className="mb-4 text-3xl font-bold">{title}</h1>}
      {children}
      {tabs && <TabBar />}
    </main>
  );
}
export const Err = ({ msg }: { msg: string }) => (msg ? <p className="mt-2 text-sm font-semibold text-deep">{msg}</p> : null);
