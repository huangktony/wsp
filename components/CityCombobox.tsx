"use client";
import { useEffect, useId, useRef, useState } from "react";
import { US_CITIES } from "@/lib/usCities";

export function citySuggestions(value: string) {
  const query = value.trim().toLowerCase();
  if (!query) return [];
  return [...US_CITIES.filter(city => city.toLowerCase().startsWith(query)),
    ...US_CITIES.filter(city => !city.toLowerCase().startsWith(query) && city.toLowerCase().includes(query))];
}

export function CityCombobox({ value, onChange, className, describedBy }: {
  value: string; onChange: (city: string) => void; className: string; describedBy?: string;
}) {
  const id = useId();
  const listId = `${id}-cities`;
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const matches = citySuggestions(value);
  const shown = open && matches.length > 0;
  const active = activeCity ? matches.indexOf(activeCity) : -1;
  const optionId = (city: string) => `${id}-city-${US_CITIES.indexOf(city)}`;
  const close = () => { setOpen(false); setActiveCity(null); };
  const select = (city: string) => { onChange(city); close(); };

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false); setActiveCity(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    if (shown && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [shown, active]);

  return <div ref={root} className="relative w-full">
    <input type="text" role="combobox" aria-label="City" aria-describedby={describedBy}
      aria-expanded={shown} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={shown && active >= 0 ? optionId(matches[active]) : undefined}
      autoComplete="off" className={`${className} w-full`} placeholder="City, ST" value={value}
      onChange={event => { onChange(event.target.value); setActiveCity(null); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={close}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (!matches.length) return;
          event.preventDefault(); setOpen(true);
          const index = shown ? active : -1;
          const next = event.key === "ArrowDown" ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1;
          setActiveCity(matches[next]);
        } else if (event.key === "Enter" && shown && active >= 0) {
          event.preventDefault(); select(matches[active]);
        } else if (event.key === "Escape") {
          event.preventDefault(); close();
        } else if (event.key === "Tab") close();
      }} />
    {shown && <ul id={listId} ref={list} role="listbox" aria-label="US cities"
      className="absolute left-0 top-full z-50 mt-1.5 max-h-[276px] w-full overflow-y-auto overscroll-contain rounded-2xl bg-[#2F3A40] p-1.5 text-white shadow-lg">
      {matches.map((city, index) => {
        const start = city.toLowerCase().indexOf(value.trim().toLowerCase());
        const end = start + value.trim().length;
        return <li key={city} id={optionId(city)} role="option" aria-selected={index === active}
          className={`flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-xl px-3.5 text-base text-white hover:bg-[#28536B] ${index === active ? "bg-[#28536B]" : ""}`}
          onMouseDown={event => { event.preventDefault(); select(city); }}
          onPointerUp={event => { if (event.pointerType === "touch") { event.preventDefault(); select(city); } }}>
          <span>{city.slice(0, start)}<span className="font-extrabold">{city.slice(start, end)}</span>{city.slice(end)}</span>
        </li>;
      })}
    </ul>}
  </div>;
}
