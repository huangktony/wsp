"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TabBar } from "./TabBar";

export function AppTabBar({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const small = window.matchMedia("(max-width: 639px)");
    const update = () => {
      const element = document.activeElement;
      const textInput = element instanceof HTMLInputElement && !["button", "submit", "checkbox", "radio", "range", "file", "color", "hidden"].includes(element.type);
      setEditing(small.matches && (textInput || element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable)));
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    small.addEventListener("change", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      small.removeEventListener("change", update);
    };
  }, [path]);
  const visible = path !== "/login" && path !== "/signup" && !editing;
  return <div className="mx-auto min-h-screen w-full max-w-[430px] pb-[var(--tab-bar-height)]"
    style={{ "--tab-bar-height": visible ? "calc(92px + env(safe-area-inset-bottom, 0px))" : "0px" } as CSSProperties}>
    {children}
    {visible && <TabBar />}
  </div>;
}
