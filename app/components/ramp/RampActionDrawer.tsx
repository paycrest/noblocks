"use client";

import { useState } from "react";

import { ActionDrawer } from "@/app/components/drawer";

import { RampDrawerFlow } from "./RampDrawerFlow";

const RAMP_TITLES = {
  buy: "Buy",
  sell: "Sell",
} as const;

export type RampAction = "buy" | "sell";

/**
 * Shared Buy/Sell drawer host for Home and Tokens (KAN-971) — both pages
 * render the exact same drawer, so this is the one place that wires it up.
 *
 * Owns the one persistent `ActionDrawer` instance (its open/close slide
 * animation depends on this component never remounting it) and tracks
 * `bodyAlign` as local state so `RampDrawerFlow` can recentre the body per
 * step (Figma: Make payment/Watching/Success are centred, Form/Review are
 * top-aligned) without that remount.
 */
export function RampActionDrawer({
  activeAction,
  onClose,
}: {
  activeAction: RampAction | null;
  onClose: () => void;
}) {
  const [bodyAlign, setBodyAlign] = useState<"start" | "center">("start");

  return (
    <ActionDrawer
      isOpen={activeAction != null}
      title={activeAction ? RAMP_TITLES[activeAction] : "Action"}
      onRequestClose={onClose}
      bodyAlign={bodyAlign}
      showPoweredByFooter={false}
    >
      {activeAction === "buy" ? (
        <RampDrawerFlow
          mode="onramp"
          onCenterBodyChange={(center) =>
            setBodyAlign(center ? "center" : "start")
          }
        />
      ) : activeAction === "sell" ? (
        <RampDrawerFlow
          mode="offramp"
          onCenterBodyChange={(center) =>
            setBodyAlign(center ? "center" : "start")
          }
        />
      ) : null}
    </ActionDrawer>
  );
}
