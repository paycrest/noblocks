/// <reference types="jest" />

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

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px") ? false : false,
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
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
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
      <LeftNav mobileOpen={false} onMobileOpenChange={jest.fn()} />,
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
    screen.getByRole("button", { name: "Your account" });

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
});
