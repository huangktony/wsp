"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? "something went wrong");
  return data;
}

export function useApi<T = any>(path: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const current = ++requestId.current;
    try {
      const d = await api<T>(path);
      if (current === requestId.current) { setData(d); setError(""); }
      return d;
    } catch (e: any) {
      if (current === requestId.current) setError(e.message);
    }
  }, [path]);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const t = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      requestId.current++;
      if (t) clearInterval(t);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, pollMs]);
  return { data, error, reload: load };
}

export { INTERESTS, SLOTS } from "./constants";
export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
