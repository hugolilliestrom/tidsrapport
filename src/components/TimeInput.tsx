"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { formatMinutes, parseTimeInput } from "@/lib/timeUtils";

interface TimeInputProps {
  valueMinutes: number | null;
  onChange: (minutes: number | null) => void;
  allowMinutesOnly?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function TimeInput({
  valueMinutes,
  onChange,
  allowMinutesOnly = false,
  placeholder = "00:00",
  className = "",
  disabled,
  "aria-label": ariaLabel,
}: TimeInputProps) {
  const [text, setText] = useState(
    valueMinutes != null ? formatMinutes(valueMinutes) : ""
  );

  useEffect(() => {
    setText(valueMinutes != null ? formatMinutes(valueMinutes) : "");
  }, [valueMinutes]);

  const commit = () => {
    const parsed = parseTimeInput(text, { allowMinutesOnly });
    onChange(parsed);
    setText(parsed != null ? formatMinutes(parsed) : "");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`tabular-nums font-mono text-sm bg-white border border-slate-200 rounded px-2 py-1.5 w-full min-w-0 focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400 ${className}`}
    />
  );
}
