/// <reference types="jest" />

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatActionAmount } from "@/app/utils";
import {
  ActionDrawer,
  ActionProgress,
  ActionReceiptFailed,
  ActionReceiptSuccess,
  ActionSubmitButton,
  formatExpiryCountdown,
  ReceiptMetaRows,
  ReviewModal,
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
    useReducedMotion: () => false,
    motion: {
      aside: React.forwardRef(
        (
          props: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
          ref: React.Ref<HTMLElement>,
        ) => <aside ref={ref as React.Ref<HTMLDivElement>} {...props} />,
      ),
      div: (
        props: React.HTMLAttributes<HTMLDivElement> & {
          children?: React.ReactNode;
        },
      ) => <div {...props} />,
    },
  };
});

jest.mock("../app/components/AnimatedComponents", () => {
  const React = require("react");
  return {
    AnimatedModal: ({
      isOpen,
      onClose,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      children: React.ReactNode;
    }) =>
      isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review modal"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        >
          {children}
        </div>
      ) : null,
    acquireBodyScrollLock: jest.fn(),
    releaseBodyScrollLock: jest.fn(),
  };
});

const { toastMappedError } = jest.requireMock("../app/lib/toastMappedError");

const VALID_EVM_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("formatExpiryCountdown", () => {
  it("formats mm:ss with zero padding and seconds capped at 59", () => {
    expect(formatExpiryCountdown(0)).toBe("00:00");
    expect(formatExpiryCountdown(59)).toBe("00:59");
    expect(formatExpiryCountdown(60)).toBe("01:00");
    expect(formatExpiryCountdown(1783)).toBe("29:43");
    expect(formatExpiryCountdown(1799)).toBe("29:59");
  });

  it("clamps negative values to 00:00", () => {
    expect(formatExpiryCountdown(-30)).toBe("00:00");
  });
});

describe("formatActionAmount", () => {
  it("formats to token decimals without float math", () => {
    expect(formatActionAmount("14.3456789", 2)).toBe("14.34");
    expect(formatActionAmount("19000", 0)).toBe("19,000");
    expect(formatActionAmount("123456789012345678901234567890.123456789", 8)).toBe(
      "123,456,789,012,345,678,901,234,567,890.12345678",
    );
  });

  it("rejects hex, exponent, and other non-decimal forms", () => {
    expect(formatActionAmount("0x10", 2)).toBe("—");
    expect(formatActionAmount("1e10", 2)).toBe("—");
    expect(formatActionAmount("not-a-number", 2)).toBe("—");
    expect(formatActionAmount("", 2)).toBe("—");
  });

  it("normalises negative zero to zero", () => {
    expect(formatActionAmount("-0", 2)).toBe("0");
    expect(formatActionAmount("-0.00", 4)).toBe("0");
  });
});

describe("getAllowlistedExplorerUrl", () => {
  it("returns null without tx hash or for unknown networks", () => {
    expect(getAllowlistedExplorerUrl("Base", undefined)).toBeNull();
    expect(getAllowlistedExplorerUrl("Unknown Chain", "0xabc")).toBeNull();
  });

  it("returns explorer URL for allowlisted network and valid 64-char EVM hash", () => {
    const url = getAllowlistedExplorerUrl("Base", VALID_EVM_HASH);
    expect(url).toMatch(/^https:\/\/basescan\.org\/tx\/0x/);
  });

  it("rejects EVM hashes that are not exactly 64 hex chars", () => {
    expect(getAllowlistedExplorerUrl("Base", "0xabc")).toBeNull();
    expect(
      getAllowlistedExplorerUrl(
        "Base",
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00",
      ),
    ).toBeNull();
  });

  it("allows Starknet hashes between 1 and 64 hex chars", () => {
    expect(getAllowlistedExplorerUrl("Starknet", "0xabc")).toMatch(
      /voyager\.online/,
    );
    expect(getAllowlistedExplorerUrl("Starknet", VALID_EVM_HASH)).toMatch(
      /voyager\.online/,
    );
    expect(
      getAllowlistedExplorerUrl(
        "Starknet",
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00",
      ),
    ).toBeNull();
  });
});

describe("ActionDrawer focus and Escape", () => {
  it("moves focus into the drawer without trapping tab and closes on Escape", async () => {
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

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "false");

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    expect(closeButtons[0]).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape when focus is outside the drawer", () => {
    const onRequestClose = jest.fn();

    render(
      <>
        <button type="button">Outside</button>
        <ActionDrawer isOpen title="Buy" onRequestClose={onRequestClose}>
          <button type="button">Inside</button>
        </ActionDrawer>
      </>,
    );

    screen.getByRole("button", { name: "Outside" }).focus();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("does not close the drawer when Escape was handled by a stacked modal", () => {
    const onDrawerClose = jest.fn();
    const onModalClose = jest.fn();

    render(
      <>
        <ActionDrawer isOpen title="Swap" onRequestClose={onDrawerClose}>
          <p>Drawer body</p>
        </ActionDrawer>
        <ReviewModal
          isOpen
          onClose={onModalClose}
          from={{ symbol: "USDC", amountLabel: "1" }}
          to={{ symbol: "USDT", amountLabel: "1" }}
          youPayLabel="1 USDC"
          feesLabel="0"
          warningText="Cannot reverse"
          onSubmit={() => {}}
        />
      </>,
    );

    const modal = screen.getByRole("dialog", { name: "Review modal" });
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();
  });
});

describe("ActionSubmitButton / useActionSubmit", () => {
  it("disables while in flight and prevents double submit", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void = () => {};
    const handler = jest.fn(
      (_key: string) =>
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
          onClick={() => {
            void submit("key-1", handler);
          }}
        />
      );
    }

    render(<Harness />);
    const button = screen.getByRole("button", { name: "Buy" });
    await user.click(button);
    await user.click(button);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("key-1");
    expect(
      screen.getByRole("button", { name: "Buy" }),
    ).toBeDisabled();

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Buy" })).not.toBeDisabled(),
    );
  });

  it("runs only one handler for same-tick submits with different keys", async () => {
    const handler = jest.fn(async (_key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const { result } = renderHook(() =>
      useActionSubmit({ feature: "concurrency" }),
    );

    await act(async () => {
      const first = result.current.submit("key-a", handler);
      const second = result.current.submit("key-b", handler);
      await Promise.all([first, second]);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("key-a");
  });

  it("returns ok:false and toasts when the handler rejects", async () => {
    const user = userEvent.setup();
    const boom = new Error("boom");
    const handler = jest.fn(async () => {
      throw boom;
    });

    let lastResult: Awaited<
      ReturnType<ReturnType<typeof useActionSubmit>["submit"]>
    >;

    function Harness() {
      const { submit } = useActionSubmit({ feature: "drawer-test" });
      return (
        <ActionSubmitButton
          label="Submit"
          onClick={async () => {
            lastResult = await submit("idempotent-key", handler);
          }}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(toastMappedError).toHaveBeenCalled());
    expect(handler).toHaveBeenCalledWith("idempotent-key");
    expect(lastResult).toEqual({ ok: false, error: boom });
  });
});

describe("ReceiptMetaRows explorer link", () => {
  it("hides explorer row when tx hash is missing", () => {
    render(
      <ReceiptMetaRows
        networkName="Base"
        txHash={null}
        rows={[
          { kind: "default", label: "Transaction status", value: "Completed" },
          { kind: "explorer", label: "Onchain receipt" },
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
        txHash={VALID_EVM_HASH}
        primaryActionLabel="Earn"
        onPrimaryAction={jest.fn()}
      />,
    );
    expect(screen.getByText("USDT 14.3 added")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View in explorer/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("button", { name: "Earn" })).toBeInTheDocument();
  });

  it("renders failed drawer receipt without Done", () => {
    render(
      <ActionReceiptFailed
        body="Your transfer failed."
        fundStatusLabel="Deposited"
        timeSpentLabel="4 seconds"
        networkName="Base"
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText("Oops! Transaction failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry transaction" }),
    ).toBeInTheDocument();
  });

  it("renders powered-by footer inside drawer body by default", () => {
    render(
      <ActionDrawer isOpen title="Buy" onRequestClose={jest.fn()}>
        <p>Step content</p>
      </ActionDrawer>,
    );
    expect(screen.getByText("Powered by")).toBeInTheDocument();
  });

  it("modal success receipt omits subtitle when not provided", () => {
    render(
      <ActionReceiptSuccess
        variant="modal"
        isOpen
        onClose={jest.fn()}
        title="Swap successful"
        fundStatusLabel="Swapped"
        timeSpentLabel="12 seconds"
        networkName="Base"
      />,
    );
    expect(screen.getByText("Swap successful")).toBeInTheDocument();
    expect(
      screen.queryByText("Your money is in your balance"),
    ).not.toBeInTheDocument();
  });
});

describe("ReceiptMetaRows modal tone", () => {
  it("applies valueClassName over default secondary tone", () => {
    render(
      <ReceiptMetaRows
        layout="modal"
        networkName="Base"
        txHash={null}
        rows={[
          {
            kind: "default",
            label: "Transaction status",
            value: "Completed",
            valueClassName: "text-[#39c65d]",
          },
        ]}
      />,
    );
    const value = screen.getByText("Completed");
    expect(value).toHaveClass("text-[#39c65d]");
    expect(value).not.toHaveClass("text-white/80");
  });
});

describe("ReceiptMetaRows failed layout", () => {
  it("pairs each label with its value for assistive tech", () => {
    const { container } = render(
      <ReceiptMetaRows
        layout="failed"
        networkName="Base"
        txHash={VALID_EVM_HASH}
        rows={[
          {
            kind: "default",
            label: "Transaction status",
            value: "Failed",
          },
          { kind: "explorer", label: "Onchain receipt" },
        ]}
      />,
    );

    const list = container.querySelector("dl");
    expect(list).toBeTruthy();
    expect(container.querySelector("dt")?.textContent).toBe("Transaction status");
    expect(container.querySelector("dd")?.textContent).toContain("Failed");
    expect(
      screen.getByRole("link", { name: /View in explorer/i }),
    ).toBeInTheDocument();
  });
});

describe("ActionProgress defaults", () => {
  it("shows disabled secondary button and note by default", () => {
    render(
      <ActionProgress
        heading="Watching for your transfer"
        subheading="Transfers usually arrive within a few minutes."
        steps={[
          { id: "1", label: "Waiting", state: "active" },
          { id: "2", label: "Complete", state: "pending" },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "I have sent the money" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/You can leave this page/),
    ).toBeInTheDocument();
    expect(screen.getByText(/when it lands$/)).toBeInTheDocument();
    expect(screen.queryByText(/when it lands\./)).not.toBeInTheDocument();
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
