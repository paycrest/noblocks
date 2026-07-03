"use client";

import React from "react";
import { ArrowLeft02Icon } from "hugeicons-react";
import { EarnActivityDetails } from "../EarnActivityDetails";
import type { EarnActivityEntry } from "../../hooks/useEarnHandler";

interface EarnActivityDetailViewProps {
  entry: EarnActivityEntry;
  onBack: () => void;
}

export const EarnActivityDetailView: React.FC<EarnActivityDetailViewProps> = ({
  entry,
  onBack,
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <button
        type="button"
        title="Go back"
        onClick={onBack}
        className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
      >
        <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
      </button>
      <h2 className="text-lg font-semibold text-text-body dark:text-white">
        Earn activity
      </h2>
      <div className="w-10" />
    </div>
    <EarnActivityDetails entry={entry} />
  </div>
);
