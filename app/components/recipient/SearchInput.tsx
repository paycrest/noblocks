"use client";
import { CiSearch } from "react-icons/ci";
import { SearchInputProps } from "./types";
import { useRef, useEffect } from "react";

export const SearchInput = ({
  value,
  onChange,
  placeholder,
  autoFocus,
}: SearchInputProps & { autoFocus?: boolean }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className="relative">
      <CiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
      />
    </div>
  );
};
