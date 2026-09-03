import {
  INJECTED_SESSION_EXPIRY_GRACE_MS,
  resolveInjectedTokenAction,
} from "../app/context/InjectedWalletContext";

const NOW = 1_700_000_000_000;

const liveSession = {
  token: "jwt",
  expiresAt: NOW + INJECTED_SESSION_EXPIRY_GRACE_MS + 1,
};

describe("resolveInjectedTokenAction", () => {
  it("uses a live session regardless of interactivity", () => {
    for (const interactive of [true, false]) {
      expect(
        resolveInjectedTokenAction({
          session: liveSession,
          hasSignInFlight: false,
          interactive,
          now: NOW,
        }),
      ).toBe("use-session");
    }
  });

  it("does not use a session inside the expiry grace window", () => {
    expect(
      resolveInjectedTokenAction({
        session: { token: "jwt", expiresAt: NOW + 1 },
        hasSignInFlight: false,
        interactive: true,
        now: NOW,
      }),
    ).toBe("start-sign-in");
  });

  it("joins an in-flight sign-in for a passive caller", () => {
    // The regression this guards: the preview's mount effect starts an interactive sign-in, and the
    // refund-account effect reads passively in the same commit. Returning "no-session" there left
    // the saved refund account unfetched, with no dependency change to trigger a retry.
    expect(
      resolveInjectedTokenAction({
        session: null,
        hasSignInFlight: true,
        interactive: false,
        now: NOW,
      }),
    ).toBe("join-flight");
  });

  it("joins an in-flight sign-in for an interactive caller rather than opening a second popup", () => {
    expect(
      resolveInjectedTokenAction({
        session: null,
        hasSignInFlight: true,
        interactive: true,
        now: NOW,
      }),
    ).toBe("join-flight");
  });

  it("prefers a live session over joining an in-flight sign-in", () => {
    expect(
      resolveInjectedTokenAction({
        session: liveSession,
        hasSignInFlight: true,
        interactive: false,
        now: NOW,
      }),
    ).toBe("use-session");
  });

  it("reports no session when nothing is in flight and the caller is passive", () => {
    expect(
      resolveInjectedTokenAction({
        session: null,
        hasSignInFlight: false,
        interactive: false,
        now: NOW,
      }),
    ).toBe("no-session");
  });

  it("starts a sign-in when nothing is in flight and the caller is interactive", () => {
    expect(
      resolveInjectedTokenAction({
        session: null,
        hasSignInFlight: false,
        interactive: true,
        now: NOW,
      }),
    ).toBe("start-sign-in");
  });

  it("re-signs an expired session for an interactive caller", () => {
    expect(
      resolveInjectedTokenAction({
        session: { token: "stale", expiresAt: NOW - 1 },
        hasSignInFlight: false,
        interactive: true,
        now: NOW,
      }),
    ).toBe("start-sign-in");
  });
});
