/// <reference types="jest" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatActionAmount } from "@/app/utils";
import {
  ActionDrawer,
  ActionReceiptFailed,
  ActionReceiptSuccess,
  ActionSubmitButton,
  ReceiptMetaRows,
  getAllowlistedExplorerUrl,
  useActionSubmit,
  usePendingActionClose,
} from "@/app/components/drawer";
import { renderHook, act } from "@testing-library/react";

jest.mock("../app/lib/toastMappedError", () => ({
  toastMappedError: jest.fn(),
}));

jest.mock("framer-motion", () => {
  const React = require("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      aside: React.forwardRef(
        (
          props: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
          ref: React.Ref<HTMLElement>,
        ) => <aside ref={ref as React.Ref<HTMLDivElement>} {...props} />,
      ),
      button: (
        props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
          children?: React.ReactNode;
        },
      ) => <button type="button" {...props} />,
    },
  };
});

const { toastMappedError } = jest.requireMock("../app/lib/toastMappedError");

describe("formatActionAmount", () => {
  it("formats to token decimals without float math", () => {
    expect(formatActionAmount("14.3456789", 2)).toBe("14.34");
    expect(formatActionAmount("19000", 0)).toBe("19,000");
    expect(formatActionAmount("123456789012345678901234567890.123456789", 8)).toBe(
      "123,456,789,012,345,678,901,234,567,890.12345678",
    );
  });
});

describe("getAllowlistedExplorerUrl", () => {
  it("returns null without tx hash or for unknown networks", () => {
    expect(getAllowlistedExplorerUrl("Base", undefined)).toBeNull();
    expect(getAllowlistedExplorerUrl("Unknown Chain", "0xabc")).toBeNull();
  });

  it("returns explorer URL for allowlisted network and valid hash", () => {
    const url = getAllowlistedExplorerUrl(
      "Base",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    );
    expect(url).toMatch(/^https:\/\/basescan\.org\/tx\/0x/);
  });
});

describe("ActionDrawer focus trap and Escape", () => {
  it("traps tab focus and closes on Escape", async () => {
    const user = userEvent.setup();
    const onRequestClose = jest.fn();

    render(
      <ActionDrawer
        isOpen
        title="Buy"
        onRequestClose={onRequestClose}
      >
        <button type="button">First</button>
        <button type="button">Second</button>
      </ActionDrawer>,
    );

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    closeButtons[0].focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();
    await user.tab();
    expect(closeButtons[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onRequestClose).toHaveBeenCalled();
  });
});

describe("ActionSubmitButton / useActionSubmit", () => {
  it("disables while in flight and prevents double submit", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void = () => {};
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    function Harness() {
      const { isSubmitting, submit } = useActionSubmit({
        feature: "test-action",
      });
      return (
        <ActionSubmitButton
          label="Buy"
          isSubmitting={isSubmitting}
          onClick={() => submit("key-1", handler)}
        />
      );
    }

    render(<Harness />);
    const button = screen.getByRole("button", { name: "Buy" });
    await user.click(button);
    await user.click(button);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Buy loading" }),
    ).toBeDisabled();

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Buy" })).not.toBeDisabled(),
    );
  });

  it("maps errors via toastMappedError", async () => {
    const user = userEvent.setup();
    const handler = jest.fn(async () => {
      throw new Error("boom");
    });

    function Harness() {
      const { submit } = useActionSubmit({ feature: "drawer-test" });
      return (
        <ActionSubmitButton
          label="Submit"
          onClick={() => submit("idempotent", handler)}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(toastMappedError).toHaveBeenCalled());
  });
});

describe("ReceiptMetaRows explorer link", () => {
  it("hides onchain row when tx hash is missing", () => {
    render(
      <ReceiptMetaRows
        networkName="Base"
        txHash={null}
        rows={[
          { label: "Transaction status", value: "Completed" },
          { label: "Onchain receipt", value: null },
        ]}
      />,
    );
    expect(screen.queryByText("View in explorer")).not.toBeInTheDocument();
    expect(screen.queryByText("Onchain receipt")).not.toBeInTheDocument();
  });
});

describe("ActionReceipt variants", () => {
  it("renders success drawer receipt", () => {
    render(
      <ActionReceiptSuccess
        variant="drawer"
        title="USDT 14.3 added"
        subtitle="Your money is in your balance and ready to use."
        fundStatusLabel="Transferred"
        timeSpentLabel="12 seconds"
        networkName="BNB Smart Chain"
        txHash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      />,
    );
    expect(screen.getByText("USDT 14.3 added")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in explorer" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("renders failed drawer receipt with Done", () => {
    render(
      <ActionReceiptFailed
        body="Your transfer failed."
        fundStatusLabel="Deposited"
        timeSpentLabel="4 seconds"
        networkName="Base"
        onDone={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText("Oops! Transaction failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry transaction" }),
    ).toBeInTheDocument();
  });
});

describe("usePendingActionClose", () => {
  it("notifies background tracking when closing during pending action", () => {
    const onContinueTrackingInBackground = jest.fn();
    const onDrawerClosed = jest.fn();
    const { result } = renderHook(() =>
      usePendingActionClose({
        isActionPending: true,
        onContinueTrackingInBackground,
        onDrawerClosed,
      }),
    );

    act(() => {
      result.current.requestClose();
    });

    expect(onContinueTrackingInBackground).toHaveBeenCalled();
    expect(onDrawerClosed).toHaveBeenCalled();
  });
});
