/// <reference types="jest" />

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { networks } from "../app/mocks";
import { NetworkProvider, useNetwork } from "../app/context/NetworksContext";

const mockUseInjectedWallet = jest.fn();

jest.mock("../app/context/InjectedWalletContext", () => ({
  useInjectedWallet: () => mockUseInjectedWallet(),
}));

function NetworkConsumer() {
  const { selectedNetwork, setDisplayedNetwork, setSelectedNetwork } =
    useNetwork();

  return (
    <>
      <div data-testid="selected-network">{selectedNetwork.chain.name}</div>
      <button type="button" onClick={() => setDisplayedNetwork(networks[1])}>
        Set displayed network
      </button>
      <button type="button" onClick={() => setSelectedNetwork(networks[1])}>
        Persist network
      </button>
    </>
  );
}

describe("NetworkProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseInjectedWallet.mockReturnValue({
      isInjectedWallet: true,
      injectedReady: true,
    });

    window.ethereum.request = jest.fn().mockResolvedValue(undefined);
    window.localStorage.getItem = jest
      .fn()
      .mockReturnValue(networks[0].chain.name);
    window.localStorage.setItem = jest.fn();
  });

  it("updates the displayed network without persisting or switching wallets", async () => {
    render(
      <NetworkProvider>
        <NetworkConsumer />
      </NetworkProvider>,
    );

    await waitFor(() => {
      expect(window.ethereum.request).toHaveBeenCalledTimes(1);
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "selectedNetwork",
        networks[0].chain.name,
      );
    });

    jest.clearAllMocks();

    fireEvent.click(screen.getByRole("button", { name: "Set displayed network" }));

    expect(screen.getByTestId("selected-network")).toHaveTextContent(
      networks[1].chain.name,
    );
    expect(window.ethereum.request).not.toHaveBeenCalled();
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("keeps manual network changes persisted for injected wallets", async () => {
    render(
      <NetworkProvider>
        <NetworkConsumer />
      </NetworkProvider>,
    );

    await waitFor(() => {
      expect(window.ethereum.request).toHaveBeenCalledTimes(1);
    });

    jest.clearAllMocks();

    fireEvent.click(screen.getByRole("button", { name: "Persist network" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-network")).toHaveTextContent(
        networks[1].chain.name,
      );
    });

    expect(window.ethereum.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${networks[1].chain.id.toString(16)}` }],
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "selectedNetwork",
      networks[1].chain.name,
    );
  });
});
