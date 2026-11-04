/// <reference types="jest" />

import { render, screen } from "@testing-library/react";

import {
  AnimatedModal,
  DEFAULT_ANIMATED_MODAL_SCRIM_CLASS,
} from "@/app/components/AnimatedComponents";

jest.mock("framer-motion", () => {
  const React = require("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    motion: {
      div: ({
        className,
        children,
        ...rest
      }: React.HTMLAttributes<HTMLDivElement>) => (
        <div className={className} data-testid="motion-div" {...rest}>
          {children}
        </div>
      ),
    },
  };
});

describe("AnimatedModal scrim", () => {
  it("uses the legacy blurred 30% backdrop by default", () => {
    render(
      <AnimatedModal isOpen onClose={() => {}}>
        <p>Modal body</p>
      </AnimatedModal>,
    );

    const scrims = screen.getAllByTestId("motion-div");
    const backdrop = scrims.find((node) =>
      node.className.includes(DEFAULT_ANIMATED_MODAL_SCRIM_CLASS),
    );
    expect(backdrop).toBeDefined();
    expect(backdrop?.className).toContain("bg-black/30");
    expect(backdrop?.className).toContain("backdrop-blur-sm");
    expect(backdrop?.className).not.toContain("bg-black/50");
  });

  it("allows an opt-in scrim override for v2 drawer modals", () => {
    render(
      <AnimatedModal
        isOpen
        onClose={() => {}}
        scrimClassName="fixed inset-0 bg-black/50"
      >
        <p>V2 modal</p>
      </AnimatedModal>,
    );

    const scrims = screen.getAllByTestId("motion-div");
    const backdrop = scrims.find((node) =>
      node.className.includes("bg-black/50"),
    );
    expect(backdrop).toBeDefined();
    expect(backdrop?.className).not.toContain("backdrop-blur-sm");
  });
});
