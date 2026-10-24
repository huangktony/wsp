"use client";
import Link from "next/link";
import { Page } from "@/components/Page";
import { useApi } from "@/lib/client";

export default function Groups() {
  const { data, error } = useApi<any[]>("/api/groups");
  return (
    <Page title="My groups" tabs>
      {error && <p className="text-deep">{error}</p>}
      <div className="space-y-3">
        {data?.map((g) => (
          <Link key={g.id} href={`/groups/${g.id}`} className="card block">
            <div className="flex items-start justify-between">
              <div><h2 className="text-xl font-bold">{g.name}</h2><p className="text-sm text-muted">{g.city} · {g.members} members</p></div>
              <span className={g.status === "VOTING OPEN" ? "chip-pink" : "chip"}>{g.status}</span>
            </div>
          </Link>
        ))}
        {data?.length === 0 && <p className="text-muted">No groups yet. Tap + to create or join one.</p>}
      </div>
    </Page>
  );
}
