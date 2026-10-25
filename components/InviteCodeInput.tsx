"use client";
import { useRef } from "react";
import { applyInviteInput, buildInviteCode, formatInviteSuffix, HANGOUT_CODE, isCompleteInviteCode, type InviteCodeSpec } from "@/lib/inviteCodeInput";

/** The prefix is fixed text outside the input, so it cannot be deleted. `spec` picks the prefix and the suffix rule (Hangout by default). */
export function InviteCodeInput({ value, onChange, onSubmit, describedBy, className = "", spec = HANGOUT_CODE }: {
  value: string;
  onChange: (fullCode: string, isComplete: boolean) => void;
  onSubmit?: () => void;
  describedBy?: string;
  className?: string;
  spec?: InviteCodeSpec;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Remember discarded prefix letters so typing them one at a time also works.
  const pendingPrefix = useRef("");
  const lead = `${spec.prefix}-`;
  const suffix = value.startsWith(lead) ? value.slice(lead.length) : formatInviteSuffix(value, spec);
  const update = (raw: string, pasted = false) => {
    const result = applyInviteInput(spec, { suffix, pending: pendingPrefix.current }, raw, pasted);
    pendingPrefix.current = result.pending;
    onChange(result.code, result.complete);
  };
  return <div onClick={() => input.current?.focus()}
    className={`flex h-[54px] items-center rounded-2xl border-2 border-outline bg-surface px-4 text-base text-indigo focus-within:border-indigo focus-within:ring-2 focus-within:ring-indigo focus-within:ring-offset-2 focus-within:ring-offset-surface ${className}`}>
    <span aria-hidden="true" className="select-none font-bold tracking-[1px]">{lead}</span>
    <input ref={input} type="text" aria-label={`Invite code, after ${spec.prefix} dash`} aria-describedby={describedBy}
      className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-[inherit] text-base text-indigo outline-none placeholder:text-secondary/80 focus:ring-0"
      placeholder={"X".repeat(spec.min)} maxLength={spec.max} inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
      value={suffix} onChange={event => update(event.currentTarget.value)}
      onPaste={event => { event.preventDefault(); update(event.clipboardData.getData("text"), true); }}
      onKeyDown={event => {
        if (!suffix && (event.key === "Backspace" || event.key === "Delete")) pendingPrefix.current = "";
        if (event.key === "Enter") {
          event.preventDefault();
          if (isCompleteInviteCode(buildInviteCode(suffix, spec), spec)) onSubmit?.();
        }
      }} />
  </div>;
}
