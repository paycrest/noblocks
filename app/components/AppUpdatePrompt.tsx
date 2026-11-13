"use client";

import { useAppUpdatePrompt } from "../hooks/useAppUpdatePrompt";

/** Registers build-version polling and the refresh toast (no UI of its own). */
export default function AppUpdatePrompt() {
  useAppUpdatePrompt();
  return null;
}
