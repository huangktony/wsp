import { BackButton } from "./BackButton";

export function Page({ title, back, children, variant }: { title?: string; back?: string; children: React.ReactNode; variant?: "plain" }) {
  return (
    <main className={`${variant === "plain" ? "mx-auto w-full max-w-[390px]" : "px-5 pt-6"} pb-10`}>
      {back && <BackButton href={back} className="mb-5" />}
      {title && <h1 className="mb-4 text-3xl font-bold">{title}</h1>}
      {children}
    </main>
  );
}
export const Err = ({ msg }: { msg: string }) => (msg ? <p className="mt-2 text-sm font-semibold text-deep">{msg}</p> : null);
