"use client";
import { useCallback, useEffect, useState } from "react";

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? "something went wrong");
  return data;
}

export function useApi<T = any>(path: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<T>(path).then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message)), [path]);
  useEffect(() => {
    load();
    if (!pollMs) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);
  return { data, error, reload: load };
}

export const INTERESTS = ["food", "coffee", "outdoors", "entertainment"];
export const SLOTS = ["Fri evening", "Sat afternoon", "Sat evening", "Sun afternoon"];
export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
