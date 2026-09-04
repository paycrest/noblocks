/// <reference types="jest" />

import { act, render } from "@testing-library/react";

import PWAInstall from "../app/components/PWAInstallManager";

const mockUseStep = jest.fn();

jest.mock("../app/context/StepContext", () => ({
  useStep: () => mockUseStep(),
}));

type MockServiceWorkerContainer = EventTarget & {
  controller: object | null;
  register: jest.Mock;
  getRegistration?: jest.Mock;
};

/** Installs a mock `navigator.serviceWorker`; `controller` says whether the page is already controlled. */
function installServiceWorkerMock(controller: object | null) {
  const sw = new EventTarget() as MockServiceWorkerContainer;
  sw.controller = controller;
  sw.register = jest.fn().mockResolvedValue({});
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });
  return sw;
}

/** Dispatches `controllerchange` on the mock container inside React's `act`. */
function fireControllerChange(sw: EventTarget) {
  act(() => {
    sw.dispatchEvent(new Event("controllerchange"));
  });
}

/** Points `document.visibilityState` at a mutable value for the update-check tests. */
function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("PWAInstall service worker update handling", () => {
  const originalLocation = window.location;
  let reloadMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    reloadMock = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock } as unknown as Location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("does not reload on the first install, when the page was not yet controlled", () => {
    mockUseStep.mockReturnValue({ isFormStep: true });
    const sw = installServiceWorkerMock(null);

    render(<PWAInstall />);
    fireControllerChange(sw);

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("reloads immediately when a new worker takes over on the form step", () => {
    mockUseStep.mockReturnValue({ isFormStep: true });
    const sw = installServiceWorkerMock({});

    render(<PWAInstall />);
    fireControllerChange(sw);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("defers the reload while a transaction is on screen, then reloads on return to the form", () => {
    mockUseStep.mockReturnValue({ isFormStep: false });
    const sw = installServiceWorkerMock({});

    const { rerender } = render(<PWAInstall />);
    fireControllerChange(sw);
    expect(reloadMock).not.toHaveBeenCalled();

    mockUseStep.mockReturnValue({ isFormStep: true });
    rerender(<PWAInstall />);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

describe("PWAInstall service worker update polling", () => {
  let updateMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStep.mockReturnValue({ isFormStep: true });
    updateMock = jest.fn().mockResolvedValue(undefined);
    setVisibilityState("visible");
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  function installWithRegistration() {
    const sw = installServiceWorkerMock({});
    sw.getRegistration = jest.fn().mockResolvedValue({ update: updateMock });
    return sw;
  }

  it("asks the registration to check for an update when the tab becomes visible", async () => {
    installWithRegistration();
    render(<PWAInstall />);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("does not check while the tab is hidden", async () => {
    installWithRegistration();
    setVisibilityState("hidden");
    render(<PWAInstall />);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("checks for an update on the periodic timer", async () => {
    jest.useFakeTimers();
    installWithRegistration();
    render(<PWAInstall />);

    await act(async () => {
      jest.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no registration exists yet", async () => {
    installServiceWorkerMock({});
    render(<PWAInstall />);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(updateMock).not.toHaveBeenCalled();
  });
});
