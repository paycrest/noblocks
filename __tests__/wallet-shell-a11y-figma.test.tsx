/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFeatureFlags } from "../app/lib/flags";
import {
  getVisibleWalletShellAssetNavLinks,
  WALLET_SHELL_ASSET_NAV_LINKS,
} from "../app/lib/wallet-shell-nav";
import { buildWalletBreadcrumbs } from "../app/lib/breadcrumbs";
import { NOBLOCKS_HELP_URL } from "../app/lib/customer-support";
import { TopBar } from "../app/(wallet)/components/TopBar";
import { LeftNav } from "../app/(wallet)/components/LeftNav";
import { shellMinHitTargetClasses } from "../app/(wallet)/components/shellFocusStyles";
import { WALLET_MOBILE_NAV_ID } from "../app/(wallet)/components/walletShellIds";
import { WalletAccountMenu } from "../app/(wallet)/components/WalletAccountMenu";
import WalletShellLayout from "../app/(wallet)/layout";

const mockBack = jest.fn();
const mockForward = jest.fn();
let mockPathname = "/";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    back: mockBack,
    forward: mockForward,
    push: jest.fn(),
  }),
}));

jest.mock("../app/components/ImageAssets", () => ({
  NoblocksLogo: () => <span>Noblocks</span>,
}));

jest.mock("../app/(wallet)/components/WalletRouteGuard", () => ({
  WalletRouteGuard: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../app/(wallet)/components/FeatureFlagRouteGuard", () => ({
  FeatureFlagRouteGuard: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("../app/components/drawer/walletDrawerSlot", () => ({
  WALLET_DRAWER_SLOT_ID: "wallet-drawer-slot",
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

jest.mock("../app/hooks/useWalletAddress", () => ({
  useWalletAddress: () => "0x1234567890123456789012345678901234567890",
}));

jest.mock("../app/hooks/useNoblocksLogout", () => ({
  useNoblocksLogout: () => ({
    signOut: jest.fn(),
    isLoggingOut: false,
  }),
}));

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: true }),
}));

jest.mock("../app/lib/flags", () => ({
  getFeatureFlags: jest.fn(),
}));

const mockedGetFeatureFlags = getFeatureFlags as jest.MockedFunction<
  typeof getFeatureFlags
>;

const mobileAside = () =>
  document.querySelector("aside[data-mobile-nav-open]");

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
});

beforeEach(() => {
  mockPathname = "/";
  mockedGetFeatureFlags.mockReturnValue({
    stocks: false,
    "noblocks-earn-v2": false,
    "noblocks-swap": false,
    "noblocks-marketplace": false,
    "noblocks-kyb": false,
    "noblocks-tx-protection": false,
  });
  (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
    matches: query.includes("max-width: 767px"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

describe("wallet shell nav structure (KAN-993)", () => {
  it("shows only Tokens under Assets when earn and stocks flags are off", () => {
    const links = getVisibleWalletShellAssetNavLinks(getFeatureFlags());
    expect(links.map((l) => l.label)).toEqual(["Tokens"]);
  });

  it("includes Earn and Stocks when flags are on", () => {
    mockedGetFeatureFlags.mockReturnValue({
      stocks: true,
      "noblocks-earn-v2": true,
      "noblocks-swap": false,
      "noblocks-marketplace": false,
      "noblocks-kyb": false,
      "noblocks-tx-protection": false,
    });
    render(
      <LeftNav mobileOpen onMobileOpenChange={jest.fn()} />,
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveTextContent(
      "Assets",
    );
    expect(screen.getByRole("link", { name: /Tokens/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Earn/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stocks/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /History/i }),
    ).toBeInTheDocument();
    expect(WALLET_SHELL_ASSET_NAV_LINKS).toHaveLength(3);
  });

  it("renders static Assets label without a collapsible Assets link", () => {
    render(
      <LeftNav mobileOpen onMobileOpenChange={jest.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Assets/i })).toBeNull();
    expect(screen.getByText("Assets")).toBeInTheDocument();
  });
});

describe("wallet shell breadcrumb (KAN-992 / KAN-993)", () => {
  it("renders Home without a trailing slash and marks it as current page", () => {
    mockPathname = "/";
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const crumbNav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbNav).getByText("Home")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(crumbNav.textContent).not.toMatch(/Home\s*\//);
  });

  it("sets aria-current on the last crumb for nested routes", () => {
    mockPathname = "/tokens/USDC";
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const crumbs = buildWalletBreadcrumbs({
      pathname: "/tokens/USDC",
      tokenDisplayName: "USD Coin",
    });
    expect(crumbs.at(-1)?.label).toBe("USD Coin");
    expect(screen.getByText("USD Coin")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("wallet shell top bar actions", () => {
  it("links Help to the v1 help URL in a new tab", () => {
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const help = screen.getByRole("link", { name: "Help" });
    expect(help).toHaveAttribute("href", NOBLOCKS_HELP_URL);
    expect(help).toHaveAttribute("target", "_blank");
    expect(help).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows an empty notifications popover", async () => {
    const user = userEvent.setup();
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });
});

describe("wallet account menu keyboard (KAN-992)", () => {
  const menuTrigger = () =>
    screen.getByRole("button", {
      name: /Your account, 0x1234\.\.\.567890/i,
    });

  it("exposes the shortened wallet address in the accessible name", () => {
    render(<WalletAccountMenu />);
    expect(menuTrigger()).toHaveAccessibleName("Your account, 0x1234...567890");
  });

  it("opens with Enter and moves focus into the menu", async () => {
    const user = userEvent.setup();
    render(<WalletAccountMenu />);
    const trigger = menuTrigger();
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
      "data-focus",
    );
  });

  it("opens with Space and ArrowDown", async () => {
    const user = userEvent.setup();
    render(<WalletAccountMenu />);
    const trigger = menuTrigger();
    trigger.focus();
    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("supports arrow navigation between items", async () => {
    const user = userEvent.setup();
    render(<WalletAccountMenu />);
    await user.click(menuTrigger());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
      "data-focus",
    );
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "data-focus",
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<WalletAccountMenu />);
    const trigger = menuTrigger();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <WalletAccountMenu />
        <button type="button">Outside</button>
      </div>,
    );
    const trigger = menuTrigger();
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when tabbing out of the menu", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <WalletAccountMenu />
        <button type="button">Next focus</button>
      </div>,
    );
    await user.click(menuTrigger());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(menuTrigger()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("mobile nav collapse (KAN-992)", () => {
  it("toggles the off-canvas nav open state", () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={onToggle} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation" }),
    );
    expect(onToggle).toHaveBeenCalled();

    rerender(
      <>
        <LeftNav mobileOpen onMobileOpenChange={jest.fn()} />
        <TopBar mobileNavOpen onMobileNavToggle={jest.fn()} />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(
      document.querySelector('[data-mobile-nav-open="true"]'),
    ).toBeTruthy();
  });

  it("closes mobile nav on Escape via shell layout", () => {
    render(
      <WalletShellLayout>
        <div>Wallet page</div>
      </WalletShellLayout>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      document.querySelector('[data-mobile-nav-open="true"]'),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      document.querySelector('[data-mobile-nav-open="false"]'),
    ).toBeTruthy();
  });

  it("marks the closed mobile aside inert and hidden from assistive tech", () => {
    render(
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
    );
    const aside = mobileAside();
    expect(aside).toHaveAttribute("inert");
    expect(aside).toHaveAttribute("aria-hidden", "true");
  });

  it("removes inert when the mobile nav is open", () => {
    render(<LeftNav mobileOpen onMobileOpenChange={jest.fn()} />);
    const aside = mobileAside();
    expect(aside).not.toHaveAttribute("inert");
    expect(aside).not.toHaveAttribute("aria-hidden");
    expect(aside).toHaveAttribute("role", "dialog");
    expect(aside).toHaveAttribute("aria-modal", "true");
    expect(aside).toHaveAttribute("aria-label", "Main navigation");
  });

  it("does not inert the aside on md+ viewports when closed", () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    render(
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
    );
    const aside = mobileAside();
    expect(aside).not.toHaveAttribute("inert");
    expect(aside).not.toHaveAttribute("aria-hidden");
  });

  it("moves focus into the nav when opened and returns it to the toggle on close", async () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    render(
      <WalletShellLayout>
        <div>Wallet page</div>
      </WalletShellLayout>,
    );
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await userEvent.setup().click(toggle);

    const aside = mobileAside();
    expect(aside).toBeTruthy();
    expect(aside?.contains(document.activeElement)).toBe(true);

    await userEvent.setup().keyboard("{Escape}");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("returns focus to the toggle when the backdrop closes the nav", async () => {
    const user = userEvent.setup();
    render(
      <WalletShellLayout>
        <div>Wallet page</div>
      </WalletShellLayout>,
    );
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await user.click(toggle);

    const backdrop = document.querySelector(".fixed.inset-0.z-30");
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as Element);

    expect(toggle).toHaveFocus();
    expect(mobileAside()).toHaveAttribute("data-mobile-nav-open", "false");
  });

  it("traps Tab focus within the open mobile nav", async () => {
    const user = userEvent.setup();
    render(<LeftNav mobileOpen onMobileOpenChange={jest.fn()} />);
    const aside = mobileAside() as HTMLElement;
    const homeLink = within(aside).getByRole("link", { name: /Noblocks home/i });
    homeLink.focus();

    await user.tab();
    expect(aside.contains(document.activeElement)).toBe(true);

    const focusables = Array.from(
      aside.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("inert"));

    for (let i = 0; i < focusables.length + 2; i += 1) {
      await user.tab();
      expect(aside.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("wallet shell design QA (PR #737)", () => {
  it("uses CSS max-md:invisible on the closed mobile aside (N11)", () => {
    render(
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
    );
    expect(mobileAside()?.className).toMatch(/max-md:invisible/);
  });

  it("exposes dialog semantics and main-column inert when mobile nav is open (N3)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WalletShellLayout>
        <div>Wallet page</div>
      </WalletShellLayout>,
    );
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.getElementById(WALLET_MOBILE_NAV_ID)).toHaveAttribute(
      "role",
      "dialog",
    );
    const mainColumn = container.querySelector(
      ".flex.h-dvh.min-w-0.flex-1.flex-col[inert]",
    );
    expect(mainColumn).toBeTruthy();
    const toggle = document.querySelector(
      `button[aria-controls="${WALLET_MOBILE_NAV_ID}"]`,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("hides back and forward below md in markup (N2)", () => {
    const topBarSource = readFileSync(
      join(process.cwd(), "app/(wallet)/components/TopBar.tsx"),
      "utf8",
    );
    expect(topBarSource).toMatch(
      /hidden items-center gap-3 md:flex[\s\S]*Go back/,
    );
    expect(topBarSource).toContain("size-8 rounded-lg");
    expect(topBarSource).toContain("size-9 rounded-xl");
  });

  it("announces Help opens in a new tab (N10)", () => {
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const help = screen.getByRole("link", { name: "Help" });
    expect(within(help).getByText("(opens in new tab)")).toHaveClass("sr-only");
  });

  it("respects reduced motion on the mobile nav panel (N4)", () => {
    render(<LeftNav mobileOpen onMobileOpenChange={jest.fn()} />);
    expect(mobileAside()?.className).toMatch(/motion-reduce:transition-none/);
  });

  it("uses 44px-tall account menu items (N5)", async () => {
    const user = userEvent.setup();
    render(<WalletAccountMenu />);
    await user.click(
      screen.getByRole("button", {
        name: /Your account, 0x1234\.\.\.567890/i,
      }),
    );
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveClass(
      "min-h-11",
    );
  });
});

describe("wallet shell hit targets (aedda35 follow-up)", () => {
  it("defines a centred 44px ::before hit area without blocking pointer events", () => {
    expect(shellMinHitTargetClasses).toContain("before:size-11");
    expect(shellMinHitTargetClasses).not.toContain("pointer-events-none");
  });

  it("keeps Help's new-tab label screen-reader-only above the hit area", () => {
    // Child stacking rules must skip .sr-only so it stays position: absolute.
    expect(shellMinHitTargetClasses).not.toMatch(/\[&>\*\]:/);
    expect(shellMinHitTargetClasses).toContain("[&>*:not(.sr-only)]:relative");
    expect(shellMinHitTargetClasses).toContain("[&>*:not(.sr-only)]:z-[1]");

    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const help = screen.getByRole("link", { name: "Help" });
    const label = within(help).getByText("(opens in new tab)");
    expect(label).toHaveClass("sr-only");
    expect(label).not.toHaveClass("relative");
    expect(label.matches(":not(.sr-only)")).toBe(false);
    const icon = help.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon!.matches(":not(.sr-only)")).toBe(true);
  });

  it("applies hit-target classes to top-bar icon controls", () => {
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const help = screen.getByRole("link", { name: "Help" });
    for (const token of ["before:size-11", "before:-translate-x-1/2"]) {
      expect(help.className).toContain(token);
    }
    expect(help.className).not.toContain("pointer-events-none");
  });

  it("registers taps slightly outside the visible Help control box", () => {
    render(
      <TopBar mobileNavOpen={false} onMobileNavToggle={jest.fn()} />,
    );
    const help = screen.getByRole("link", { name: "Help" });
    const rect = help.getBoundingClientRect();
    if (typeof document.elementFromPoint !== "function") {
      return;
    }
    const probeX = rect.right + 2;
    const probeY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(probeX, probeY);
    expect(hit === help || help.contains(hit)).toBe(true);
  });

  it("delays max-md visibility until after the slide transition when closed", () => {
    render(
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
    );
    const className = mobileAside()?.className ?? "";
    expect(className).toMatch(/visibility_0s_200ms/);
    expect(className).toMatch(/max-md:transition-\[transform,visibility\]/);
  });

  it("styles Sign out with light failed red and dark accent red", () => {
    render(<WalletAccountMenu />);
    const source = readFileSync(
      join(process.cwd(), "app/(wallet)/components/WalletAccountMenu.tsx"),
      "utf8",
    );
    expect(source).toContain("text-text-accent-red dark:text-accent-red");
  });
});
