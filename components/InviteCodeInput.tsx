"use client";
import { useRef } from "react";
import { buildInviteCode, formatInviteSuffix, isCompleteInviteCode } from "@/lib/inviteCodeInput";

export function InviteCodeInput({ value, onChange, onSubmit, describedBy, className = "" }: {
  value: string;
  onChange: (fullCode: string, isComplete: boolean) => void;
  onSubmit?: () => void;
  describedBy?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Remember discarded prefix letters so typing W, S, P sequentially also works.
  const pendingPrefix = useRef("");
  const suffix = value.startsWith("WSP-") ? value.slice(4) : formatInviteSuffix(value);
  const update = (raw: string, pasted = false) => {
    const compact = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const candidate = !pasted && !suffix ? pendingPrefix.current + compact : compact;
    pendingPrefix.current = candidate && candidate.length < 3 && "WSP".startsWith(candidate) ? candidate : "";
    const fullCode = buildInviteCode(formatInviteSuffix(candidate));
    onChange(fullCode, isCompleteInviteCode(fullCode));
  };
  return <div onClick={() => input.current?.focus()}
    className={`flex h-[54px] items-center rounded-2xl border-2 border-[#6F98A2] bg-white px-4 text-base text-[#28536B] focus-within:border-[#28536B] focus-within:ring-2 focus-within:ring-[#28536B] focus-within:ring-offset-2 ${className}`}>
    <span aria-hidden="true" className="select-none font-bold tracking-[1px]">WSP-</span>
    <input ref={input} type="text" aria-label="Invite code, after WSP dash" aria-describedby={describedBy}
      className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-[inherit] text-base text-[#28536B] outline-none placeholder:text-[#35607A]/80 focus:ring-0"
      placeholder="XXX" maxLength={4} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
      value={suffix} onChange={event => update(event.currentTarget.value)}
      onPaste={event => { event.preventDefault(); update(event.clipboardData.getData("text"), true); }}
      onKeyDown={event => {
        if (!suffix && (event.key === "Backspace" || event.key === "Delete")) pendingPrefix.current = "";
        if (event.key === "Enter") {
          event.preventDefault();
          if (isCompleteInviteCode(buildInviteCode(suffix))) onSubmit?.();
        }
      }} />
  </div>;
}
