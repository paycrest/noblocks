/// <reference types="jest" />

import { act, render, waitFor } from "@testing-library/react";

import AppUpdatePrompt from "../app/components/AppUpdatePrompt";

const mockUseStep = jest.fn();
const mockUseAppUpdateBlock = jest.fn();
const mockToast = jest.fn();
const mockToastDismiss = jest.fn();
const mockReload = jest.fn();

jest.mock("../app/context/StepContext", () => ({
  useStep: () => mockUseStep(),
}));

jest.mock("../app/context/AppUpdateBlockContext", () => ({
  useAppUpdateBlock: () => mockUseAppUpdateBlock(),
}));

jest.mock("sonner", () => {
  const toastFn = (...args: unknown[]) => mockToast(...args);
  return {
    toast: Object.assign(toastFn, {
      dismiss: (...args: unknown[]) => mockToastDismiss(...args),
    }),
  };
});

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
  const sessionStorageMock: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
    Object.keys(sessionStorageMock).forEach(
      (key) => delete sessionStorageMock[key],
    );
    jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(
        (key) => sessionStorageMock[key] ?? null,
      );
    jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((key, value) => {
        sessionStorageMock[key] = String(value);
      });
    process.env.NEXT_PUBLIC_BUILD_ID = CLIENT_BUILD_ID;
    mockUseStep.mockReturnValue({ isFormStep: true });
    mockUseAppUpdateBlock.mockReturnValue({ isSensitiveFlowActive: false });
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

  it("ignores a server buildId of unknown so the prompt does not stick forever", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "unknown" }),
    );

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("does not call /api/version when NEXT_PUBLIC_BUILD_ID is empty", async () => {
    delete process.env.NEXT_PUBLIC_BUILD_ID;

    render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("does not re-show the toast after dismiss for the same server build", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    render(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    const onDismiss = mockToast.mock.calls[0][1]?.onDismiss;
    act(() => {
      onDismiss?.();
    });

    expect(sessionStorageMock["app-update-dismissed-build-id"]).toBe(
      "server-build-xyz",
    );

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it("shows the toast again after dismiss when a newer build is detected", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    const { rerender } = render(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    const onDismiss = mockToast.mock.calls[0][1]?.onDismiss;
    act(() => {
      onDismiss?.();
    });

    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-newer" }),
    );

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
  });

  it("exposes a close button on the update toast", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    render(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast.mock.calls[0][1]?.closeButton).toBe(true);
  });

  it("dismisses the toast when leaving the form mid-transaction without reloading", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    const { rerender } = render(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));

    mockUseStep.mockReturnValue({ isFormStep: false });
    rerender(<AppUpdatePrompt />);

    expect(mockToastDismiss).toHaveBeenCalledWith("app-update");
    expect(mockReload).not.toHaveBeenCalled();

    mockUseStep.mockReturnValue({ isFormStep: true });
    rerender(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("does not show the toast when a stale in-flight fetch resolves off the form step", async () => {
    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

    const { rerender } = render(<AppUpdatePrompt />);

    mockUseStep.mockReturnValue({ isFormStep: false });
    rerender(<AppUpdatePrompt />);

    await act(async () => {
      resolveFetch!(jsonResponse({ buildId: "server-build-xyz" }));
      await fetchPromise;
    });

    expect(mockToast).not.toHaveBeenCalled();

    mockUseStep.mockReturnValue({ isFormStep: true });
    rerender(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
  });

  it("does not show the toast while a bridge or transfer flow is active", async () => {
    mockUseAppUpdateBlock.mockReturnValue({ isSensitiveFlowActive: true });
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ buildId: "server-build-xyz" }),
    );

    const { rerender } = render(<AppUpdatePrompt />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockToast).not.toHaveBeenCalled();

    mockUseAppUpdateBlock.mockReturnValue({ isSensitiveFlowActive: false });
    rerender(<AppUpdatePrompt />);

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockReload).not.toHaveBeenCalled();
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
