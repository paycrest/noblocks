/// <reference types="jest" />

import { render, act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { useIsBelowMd } from "../app/(wallet)/components/useIsBelowMd";

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

  it("uses the 767px query on the client and follows changes", () => {
    const { getByTestId } = render(<Probe />);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(getByTestId("probe")).toHaveTextContent("mobile");
    act(() => {
      matches = false;
      listeners.forEach((cb) => cb());
    });
    expect(getByTestId("probe")).toHaveTextContent("desktop");
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
