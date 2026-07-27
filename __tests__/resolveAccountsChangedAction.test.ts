import { resolveAccountsChangedAction } from "../app/context/InjectedWalletContext";

const ADDRESS = "0xeAd3288C7Fb1e0BeC5C8D4E5B8f9A8abBBDE7001";
const OTHER = "0xB7a6000000000000000000000000000000005556";

describe("resolveAccountsChangedAction", () => {
  it("treats a re-emit of the same account as unchanged", () => {
    // Hosts re-emit accountsChanged on reconnect / tab refocus. Dropping the SIWE session
    // there costs the user a needless signature and resets every wallet-keyed cache.
    expect(resolveAccountsChangedAction(ADDRESS, ADDRESS)).toEqual({
      kind: "unchanged",
      clearSession: false,
      setAddress: false,
    });
  });

  it("treats the same account in different casing as unchanged", () => {
    // The session token asserts the lowercased address, so casing is not an identity change.
    // Letting the string flip would also reset KYC status, which keys on the raw address.
    expect(
      resolveAccountsChangedAction(ADDRESS, ADDRESS.toLowerCase()),
    ).toEqual({ kind: "unchanged", clearSession: false, setAddress: false });
    expect(
      resolveAccountsChangedAction(ADDRESS.toLowerCase(), ADDRESS),
    ).toEqual({ kind: "unchanged", clearSession: false, setAddress: false });
  });

  it("ignores surrounding whitespace when comparing", () => {
    expect(resolveAccountsChangedAction(ADDRESS, ` ${ADDRESS} `)).toEqual({
      kind: "unchanged",
      clearSession: false,
      setAddress: false,
    });
  });

  it("clears the session on a real account switch", () => {
    expect(resolveAccountsChangedAction(ADDRESS, OTHER)).toEqual({
      kind: "switched",
      clearSession: true,
      setAddress: true,
    });
  });

  it("treats the first account as a switch so the address is adopted", () => {
    expect(resolveAccountsChangedAction(null, ADDRESS)).toEqual({
      kind: "switched",
      clearSession: true,
      setAddress: true,
    });
  });

  it.each([undefined, null, "", "   "])(
    "treats %p as a disconnect",
    (next) => {
      expect(resolveAccountsChangedAction(ADDRESS, next)).toEqual({
        kind: "disconnected",
        clearSession: true,
        setAddress: true,
      });
    },
  );
});
