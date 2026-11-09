/// <reference types="jest" />

import { act, render, waitFor } from "@testing-library/react";

import AppUpdatePrompt from "../app/components/AppUpdatePrompt";

const mockUseStep = jest.fn();
const mockToast = jest.fn();
const mockReload = jest.fn();

jest.mock("../app/context/StepContext", () => ({
  useStep: () => mockUseStep(),
}));

jest.mock("sonner", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

/** Points `document.visibilityState` at a mutable value for visibility tests. */
function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("useAppUpdatePrompt", () => {
  const originalLocation = window.location;
  const CLIENT_BUILD_ID = "client-build-abc";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_BUILD_ID = CLIENT_BUILD_ID;
    mockUseStep.mockReturnValue({ isFormStep: true });
    setVisibilityState("visible");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: mockReload } as unknown as Location,
    });
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    delete process.env.NEXT_PUBLIC_BUILD_ID;
  });

  it("shows a persistent toast when the server buildId differs from the client", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    render(<AppUpdatePrompt />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledTimes(1);
    });
    expect(mockToast.mock.calls[0][0]).toMatch(/new version/i);
    const options = mockToast.mock.calls[0][1];
    expect(options?.duration).toBe(Infinity);
    expect(options?.id).toBe("app-update");
    expect(options?.action?.label).toMatch(/refresh/i);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("shows nothing when buildIds match", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: CLIENT_BUILD_ID }),
    );

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows nothing when the version fetch fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("reloads only when the user clicks Refresh on the toast", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    render(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const onClick = mockToast.mock.calls[0][1]?.action?.onClick;
    expect(typeof onClick).toBe("function");
    act(() => {
      onClick?.(new Event("click"));
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("never reloads without an explicit Refresh click", async () => {
    mockUseStep.mockReturnValue({ isFormStep: false });
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    const { rerender } = render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();

    mockUseStep.mockReturnValue({ isFormStep: true });
    rerender(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("does not stack duplicate toasts on repeated checks", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockToast).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it("re-checks when the tab becomes visible", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: CLIENT_BUILD_ID }),
    );

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
