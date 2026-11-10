/// <reference types="jest" />

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { WalletRouteGuard } from "../app/(wallet)/components/WalletRouteGuard";
import {
  WalletAuthPageSkeleton,
  isTokenDetailPath,
} from "../app/(wallet)/components/WalletPageSkeletons";
import { WidgetFormSkeleton } from "../app/components/WidgetFormSkeleton";
import { AUTH_RETURN_STORAGE_KEY } from "../app/lib/wallet-auth";

const mockLogin = jest.fn();
const mockReplace = jest.fn();
let mockPathname = "/";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
}));

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: jest.fn(),
  useLogin: jest.fn(() => ({ login: mockLogin })),
}));

jest.mock("../app/hooks/useLoginWithScrollPin", () => ({
  useLoginWithScrollPin: (login: () => void) => login,
}));

const { usePrivy } = jest.requireMock("@privy-io/react-auth");

const KNOWN_PRELOADER_SITES = [
  "app/(wallet)/components/WalletRouteGuard.tsx",
  "app/widget/page.tsx",
  "app/components/MainPageContent.tsx",
  "app/components/index.ts",
  "app/components/AppLayout.tsx",
  "app/(wallet)/layout.tsx",
  "app/globals.css",
];

function walkSource(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkSource(path, acc);
    } else if (/\.(tsx?|css)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

describe("preloader module is gone", () => {
  it("does not keep Preloader.tsx", () => {
    expect(
      existsSync(join(process.cwd(), "app/components/Preloader.tsx")),
    ).toBe(false);
  });

  it("does not reference Preloader or the purple .loader at known former call sites", () => {
    for (const relative of KNOWN_PRELOADER_SITES) {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      expect(source).not.toMatch(/Preloader/);
      expect(source).not.toMatch(/className=["']loader["']/);
      expect(source).not.toMatch(/\.loader\s*\{/);
    }
  });

  it("has no remaining Preloader import or purple loader class in app source", () => {
    const files = walkSource(join(process.cwd(), "app"));
    const hits: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (
        /\bPreloader\b/.test(source) ||
        /className=["']loader["']/.test(source) ||
        /\.loader\s*\{/.test(source)
      ) {
        hits.push(file.replace(`${process.cwd()}/`, ""));
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("WalletAuthPageSkeleton", () => {
  it("maps home, tokens list, token detail, and other wallet routes", () => {
    expect(isTokenDetailPath("/tokens/USDC")).toBe(true);
    expect(isTokenDetailPath("/tokens")).toBe(false);

    const { rerender } = render(<WalletAuthPageSkeleton pathname="/" />);
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "home",
    );
    expect(screen.getByText("Your balances")).toBeInTheDocument();

    rerender(<WalletAuthPageSkeleton pathname="/tokens" />);
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "tokens",
    );
    expect(screen.getByText("Total token balance")).toBeInTheDocument();

    rerender(<WalletAuthPageSkeleton pathname="/tokens/USDC" />);
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "token-detail",
    );

    rerender(<WalletAuthPageSkeleton pathname="/history" />);
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "placeholder",
    );
  });
});

describe("WalletRouteGuard", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockReplace.mockReset();
    mockPathname = "/";
    sessionStorage.clear();
    usePrivy.mockReturnValue({ ready: true, authenticated: true });
  });

  it("renders the home skeleton while the auth SDK is not ready and does not mount children", () => {
    usePrivy.mockReturnValue({ ready: false, authenticated: false });
    render(
      <WalletRouteGuard>
        <p>PROTECTED_WALLET_CONTENT</p>
      </WalletRouteGuard>,
    );
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "home",
    );
    expect(screen.queryByText("PROTECTED_WALLET_CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("keeps the tokens skeleton while the session is pending and triggers login without protected content", async () => {
    mockPathname = "/tokens";
    usePrivy.mockReturnValue({ ready: true, authenticated: false });
    render(
      <WalletRouteGuard>
        <p>PROTECTED_TOKENS</p>
      </WalletRouteGuard>,
    );
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "tokens",
    );
    expect(screen.queryByText("PROTECTED_TOKENS")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY)).toBe("/tokens");
  });

  it("uses the token-detail skeleton on /tokens/USDC before authorization", () => {
    mockPathname = "/tokens/USDC";
    usePrivy.mockReturnValue({ ready: false, authenticated: false });
    render(
      <WalletRouteGuard>
        <p>PROTECTED_DETAIL 1000.4831</p>
      </WalletRouteGuard>,
    );
    expect(screen.getByTestId("wallet-page-skeleton")).toHaveAttribute(
      "data-skeleton",
      "token-detail",
    );
    expect(screen.queryByText(/1000\.4831/)).not.toBeInTheDocument();
    expect(screen.queryByText("PROTECTED_DETAIL 1000.4831")).not.toBeInTheDocument();
  });

  it("mounts children once the session is ready and authenticated", () => {
    mockPathname = "/tokens";
    usePrivy.mockReturnValue({ ready: true, authenticated: true });
    render(
      <WalletRouteGuard>
        <p>READY_TOKENS</p>
      </WalletRouteGuard>,
    );
    expect(screen.getByText("READY_TOKENS")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-page-skeleton")).not.toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("swaps the skeleton for children when auth resolves", () => {
    usePrivy.mockReturnValue({ ready: false, authenticated: false });
    const { rerender } = render(
      <WalletRouteGuard>
        <p>AFTER_AUTH</p>
      </WalletRouteGuard>,
    );
    expect(screen.getByTestId("wallet-page-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("AFTER_AUTH")).not.toBeInTheDocument();

    usePrivy.mockReturnValue({ ready: true, authenticated: true });
    rerender(
      <WalletRouteGuard>
        <p>AFTER_AUTH</p>
      </WalletRouteGuard>,
    );
    expect(screen.queryByTestId("wallet-page-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("AFTER_AUTH")).toBeInTheDocument();
  });
});

describe("WidgetFormSkeleton", () => {
  it("renders widget-card geometry instead of a full-screen preloader", () => {
    render(<WidgetFormSkeleton />);
    expect(screen.getByTestId("widget-form-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("widget-form-skeleton")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelector(".loader")).toBeNull();
  });
});
