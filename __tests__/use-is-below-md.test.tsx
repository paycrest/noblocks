/// <reference types="jest" />

import { render, act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import defaultTheme from "tailwindcss/defaultTheme";
import {
  BELOW_MD_QUERY,
  TAILWIND_MD_MIN_WIDTH,
  useIsBelowMd,
} from "../app/(wallet)/components/useIsBelowMd";

function Probe() {
  return <span data-testid="probe">{useIsBelowMd() ? "mobile" : "desktop"}</span>;
}

describe("useIsBelowMd (CodeRabbit hydration fix)", () => {
  let matches = true;
  const listeners = new Set<() => void>();
  const addEventListener = jest.fn((_: string, cb: () => void) => listeners.add(cb));
  const removeEventListener = jest.fn((_: string, cb: () => void) => listeners.delete(cb));

  beforeEach(() => {
    matches = true;
    listeners.clear();
    addEventListener.mockClear();
    removeEventListener.mockClear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener,
        removeEventListener,
      })),
    });
  });

  it("hydrates server desktop markup without a mismatch, then reads the media query", async () => {
    const container = document.createElement("div");
    // Markup as the server renders it (server snapshot = false).
    container.innerHTML = '<span data-testid="probe">desktop</span>';
    document.body.appendChild(container);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />, {
        onRecoverableError: (error) => {
          throw error;
        },
      });
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe("mobile");
    errors.mockRestore();
    act(() => root?.unmount());
    container.remove();
  });

  it("uses the Tailwind max-md query on the client and follows changes", () => {
    const { getByTestId } = render(<Probe />);
    expect(window.matchMedia).toHaveBeenCalledWith("not all and (min-width: 768px)");
    expect(getByTestId("probe")).toHaveTextContent("mobile");
    act(() => {
      matches = false;
      listeners.forEach((cb) => cb());
    });
    expect(getByTestId("probe")).toHaveTextContent("desktop");
  });

  it("uses exactly the inverse of Tailwind's md query, as max-md does", () => {
    // max-md in Tailwind v3 compiles to `@media not all and (min-width: <md>)`.
    expect(TAILWIND_MD_MIN_WIDTH).toBe(defaultTheme.screens.md);
    expect(BELOW_MD_QUERY).toBe(`not all and (min-width: ${defaultTheme.screens.md})`);
    // The project only extends screens (xsm, xmd), so md stays the default.
    const config = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    expect(config).not.toMatch(/\bmd:\s*["']/);
    // No fractional gap: 767.5px is below md for both the CSS and the hook.
    expect(BELOW_MD_QUERY).not.toContain("max-width");
  });

  it("removes its change listener on unmount", () => {
    const { unmount } = render(<Probe />);
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      addEventListener.mock.calls[0][1],
    );
    expect(listeners.size).toBe(0);
  });
});
