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
};

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

function fireControllerChange(sw: EventTarget) {
  act(() => {
    sw.dispatchEvent(new Event("controllerchange"));
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
