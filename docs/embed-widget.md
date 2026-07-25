# Embeddable Widget (`/widget`)

Noblocks can be embedded as a compact swap widget in partner sites via iframe.
Embedding is restricted to whitelisted origins, enforced by the browser through
`Content-Security-Policy: frame-ancestors`.

## Getting whitelisted

Email **info@noblocks.xyz** with:

- The exact origin(s) that will embed the widget (e.g. `https://app.partner.com`;
  wildcard subdomains like `https://*.partner.com` are supported)
- A contact email for incident/breaking-change notifications
- A short description of your integration

Once approved, your origin is added to the allowlist and the widget will load
inside your iframe. Non-whitelisted origins are blocked by the browser.

## Quick start

```html
<iframe
  id="noblocks-widget"
  src="https://noblocks.xyz/widget?theme=dark&currency=NGN"
  allow="clipboard-write; publickey-credentials-get; camera"
  style="
    width: 100%;
    max-width: 420px;
    height: 640px;
    border: 0;
    border-radius: 24px;
    box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.4);
    background: transparent;
  "
></iframe>
```

Notes:

- The widget **fills the iframe**: a single card with no outer margins, shadow,
  or fixed size of its own. You control the size, shadow, and positioning by
  styling the `<iframe>` element (as above). The card itself has 24px rounded
  corners and its own internal padding; the page behind the card is
  transparent, so your page shows through the corner cut-outs. Set the
  iframe's `border-radius` to 24px to match (as in the example), or clip
  harder for a flush embed.
- Recommended width **360–420px**. The widget renders its mobile UI below
  ~640px wide (a comfortable compact layout); above that it would switch to
  the desktop layout, so keep it narrow. Height is flexible: size it to fit
  the flow (≈670–750px works well); the footer pins to the bottom edge, and
  the wallet control stays visible while the form scrolls.
- **Dismissing the widget is your responsibility.** Provide whatever close
  affordance fits your UX (modal backdrop click, host close button, drawer
  handle, etc.) and remove or hide the iframe from your page. The widget
  itself does not render a close control.
- Do **not** set `Referrer-Policy: no-referrer` on the embedding page (or
  `referrerpolicy="no-referrer"` on the iframe). The widget derives your origin
  from the referrer to send you events; origin-level referrer
  (`strict-origin-when-cross-origin`, the browser default) is enough.
- `camera` is needed for KYC selfie capture, `clipboard-write` for
  copy-address buttons.

## URL parameters

| Param            | Values                              | Effect                                                                 |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `theme`          | `dark` \| `light`                   | Force the widget theme (default: visitor system theme)                 |
| `side`           | `buy` \| `sell`                     | Start in on-ramp (buy) or off-ramp (sell) mode; locks the center flip  |
| `token`          | e.g. `USDC`, `cNGN`, `CNGN`         | Preselect token (case-insensitive; `CNGN`/`cNGN` both display as cNGN) |
| `tokens`         | CSV of symbols                      | Allowlist for the token dropdown (omit = all; one entry = read-only)   |
| `currency`       | e.g. `NGN`, `KES`                   | Preselect fiat currency                                                |
| `currencies`     | CSV of codes                        | Allowlist for the currency dropdown (omit = all; one entry = read-only)|
| `tokenAmount`    | number                              | Prefill token amount                                                   |
| `fiatAmount`     | number                              | Prefill fiat amount                                                    |
| `provider`       | liquidity provider ID               | Pin a specific liquidity provider                                      |
| `injected`       | `true` \| `bridge`                  | Wallet mode (see below)                                                |
| `chainId`        | decimal or `0x` hex                 | Default EVM network only (e.g. `8453` / `0x2105` for Base)             |
| `chainIds`       | CSV of decimal or `0x` hex          | Allowlist for the network switcher by EVM chain ID; unioned with `networks` |
| `network`        | slug                                | Default network by slug (e.g. `base`, `starknet`, `arbitrum-one`)      |
| `networks`       | CSV of slugs                        | Allowlist for the network switcher (omit = all; one entry = locked)    |
| `hideSideToggle` | `1` \| `true`                       | Hide the “Swap” title and Buy/Sell pills (also locks the center flip)  |
| `hideSupport`    | `1` \| `true`                       | Hide the in-widget support chat, default shown (see below)             |

`cNGN` / `CNGN` are accepted interchangeably in URL and host config; the UI
shows **cNGN**. Aggregator rate/order calls still use the wire form `CNGN`.

### Token / currency / network allowlists

```
/widget?
  side=sell
  &token=cNGN&tokens=cNGN
  &currency=NGN&currencies=NGN
  &network=base&networks=base,arbitrum-one
  &hideSideToggle=1
  &injected=bridge
```

- Omit an allowlist param (`tokens`, `currencies`, `networks`, `chainIds`) to
  leave that selector unrestricted.
- A single-item allowlist renders a read-only chip (dropdown disabled).
- `networks=` takes slugs; `chainIds=` takes EVM chain IDs (decimal or `0x`
  hex). Passing both unions the two lists.
- A multi-item network allowlist filters the wallet network switcher only;
  balance lists and history stay **unfiltered**.
- Without an allowlist key, a lone `network=` / `chainId=` keeps the previous
  **lock** behaviour (read-only chip + no balance auto-hop).
- Supported network slugs match rate paths: `base`, `arbitrum-one`,
  `bnb-smart-chain`, `polygon`, `lisk`, `celo`, `scroll`, `ethereum`,
  `starknet`, `tron`. Legacy `starknet-mainnet` is accepted as an alias.

### Network lock / follow

Pass `chainId` and/or `network` to set the **default** chain (and lock when
no multi-value allowlist is present):

- The wallet drawer shows a read-only chain chip when locked (no switcher).
- Balance-based auto network hopping is disabled whenever a network allowlist
  or lock is set.
- Prefer **`chainId`** for EVM default. Use **`network`** (slug) for Starknet /
  Tron. For allowlists, use `networks=` (slugs, covers Starknet/Tron) or
  `chainIds=` (EVM IDs). If both default params are present, `chainId` wins
  when non-empty.
- An unsupported or unknown value toasts once and leaves the last valid
  network (or the widget default).

With `injected=true` or `injected=bridge`, the widget also **follows** the host wallet:

- EIP-1193 `chainChanged` (extension or bridge) updates the displayed network
  when the new chain is supported **and** within the network allowlist (if set),
  and keeps the lock on that chain.
- Unsupported / out-of-allowlist wallet chains toast once and do **not** unlock
  the picker.

Closing / dismissing the iframe remains the host page’s responsibility (unchanged).

### Support chat

By default the widget loads Noblocks’ in-widget support chat (a small launcher
pinned inside the iframe) so your users can reach support without leaving the
flow. If you already provide your own support channel and don’t want a second
one inside the embed, suppress it with `hideSupport=1`:

```html
<iframe src="https://noblocks.xyz/widget?hideSupport=1" ...></iframe>
```

The chat is third-party JavaScript loaded lazily (after the widget is
interactive), so hiding it also trims that download from the embed.

```html
<!-- Lock to Base -->
<iframe src="https://noblocks.xyz/widget?chainId=8453&currency=NGN" ...></iframe>

<!-- Lock to Starknet by slug -->
<iframe src="https://noblocks.xyz/widget?network=starknet" ...></iframe>

<!-- Allow Base + Arbitrum; default Base -->
<iframe src="https://noblocks.xyz/widget?networks=base,arbitrum-one&network=base" ...></iframe>

<!-- Same allowlist by EVM chain id -->
<iframe src="https://noblocks.xyz/widget?chainIds=8453,42161&chainId=8453" ...></iframe>

<!-- Bridge wallet + lock; follow host chain switches -->
<iframe src="https://noblocks.xyz/widget?injected=bridge&chainId=8453" ...></iframe>
```

## Widget → host events (postMessage)

The widget posts messages to the embedding page (only to your whitelisted
origin, never `*`). Each message is
`{ source: "noblocks", event, payload }`:

| Event                | Payload                 | Meaning                                   |
| -------------------- | ----------------------- | ----------------------------------------- |
| `noblocks:ready`     | —                       | Widget mounted                            |
| `noblocks:resize`    | `{ height }`            | Content height changed (auto-size iframe) |
| `noblocks:tx_status` | `{ status, orderId }`   | Transaction progress (e.g. `pending`, `settled`, `refunded`) |

```js
const iframe = document.getElementById("noblocks-widget");
window.addEventListener("message", (e) => {
  // Check both the origin AND the source window, so another child frame at
  // the Noblocks origin can't spoof resize/tx_status events.
  if (e.origin !== "https://noblocks.xyz") return;
  if (e.source !== iframe.contentWindow) return;
  if (e.data?.source !== "noblocks") return;
  const { event, payload } = e.data;
  // ...
});
```

## Host → widget: `noblocks:set_config`

After the widget is ready, the host can push live updates (same origin /
`event.source` checks as the wallet bridge):

```js
iframe.contentWindow.postMessage(
  {
    source: "noblocks-host",
    event: "noblocks:set_config",
    payload: {
      network: "arbitrum-one", // slug
      side: "sell",            // buy | sell
      token: "cNGN",           // or CNGN
      currency: "NGN",
    },
  },
  "https://noblocks.xyz",
);
```

Values outside the URL allowlists (or unsupported chains/tokens) are ignored
and toasted. Omit fields you do not want to change.

`NoblocksEmbed.bindWallet` (see below) already posts `noblocks-host` messages
for the wallet bridge; you can reuse the same `postMessage` pattern for
`set_config`, or call `iframe.contentWindow.postMessage` directly as above.

## Wallet modes

### Default: Privy login in the widget

Users sign in with email (Privy) inside the widget, with no host integration
needed. Note: in Safari/Firefox, storage partitioning means the session may
not persist across page reloads, and OAuth popups must not be blocked.

### Connection flow in injected modes

In both injected modes the widget never prompts the wallet on load. It checks
silently (`eth_accounts`) for an already-authorized account:

- Already connected: the widget shows the wallet pill and behaves as signed in.
- Not connected yet: the header shows neither Sign in nor the pill, and the
  primary button reads **"Connect wallet"**. Tapping it requests connection
  (`eth_requestAccounts`). The widget also listens for `accountsChanged`, so a
  connection made through **your page's own connect button** is picked up
  automatically. This matters for managed connector stacks (wagmi, AppKit,
  WalletConnect): those providers usually cannot open a connect prompt from
  inside the iframe, so your own connect flow is the reliable path and the
  widget follows it.
- The Privy sign-in fallback appears only when injected mode is genuinely
  unavailable: no host bridge responded, or `injected=true` without an
  extension wallet.

The first authenticated action (e.g. submitting a swap) additionally asks the
wallet for a one-time SIWE signature to authenticate API calls. It is a plain
message signature: no transaction, no gas.

### `injected=true` — extension wallet inside the iframe

Browser-extension wallets (MetaMask, Rabby, ...) inject `window.ethereum`
into iframes too, so the user transacts with the same extension they use on
your page. The "Connect wallet" button prompts the extension once for the
noblocks.xyz origin (auto-connects on return visits). This does **not** cover
WalletConnect / mobile-QR sessions; use the bridge for those.

### `injected=bridge` — hand off your page's connected wallet

Your page proxies the widget's wallet requests to **your** connected provider
(WalletConnect, AppKit, wagmi, `window.ethereum`, ...). All signing prompts
appear in your wallet UI; the widget never sees keys.

`bindWallet` is **required** for `injected=bridge`. Don't pass the param on a
plain iframe with no host script: if no bridge responds within ~4 seconds,
the widget falls back to the standard sign-in flow rather than hanging, but
users see a loading state for those seconds.

Bind the wallet **before** the iframe loads: create the iframe without a
`src`, call `bindWallet` (which installs the message listener), then set `src`.
Otherwise a fast widget load can probe the wallet before the listener exists
and the request hangs until timeout.

```html
<script src="https://noblocks.xyz/embed.js"></script>
<iframe id="noblocks-widget"></iframe>
<script>
  const iframe = document.getElementById("noblocks-widget");
  const unbind = NoblocksEmbed.bindWallet(iframe, window.ethereum, {
    onEvent(event, payload) {
      if (event === "noblocks:resize") iframe.style.height = payload.height + "px";
    },
  });
  // Set src only after bindWallet has installed the listener.
  iframe.src = "https://noblocks.xyz/widget?injected=bridge";
</script>
```

With wagmi (v2), pass the connector's provider (still bind before setting `src`):

```ts
import { getConnectorClient } from "@wagmi/core";

const client = await getConnectorClient(wagmiConfig);
NoblocksEmbed.bindWallet(iframe, client.transport, { onEvent });
// or: NoblocksEmbed.bindWallet(iframe, await connector.getProvider(), { onEvent });
iframe.src = "https://noblocks.xyz/widget?injected=bridge";
```

If your users may open the widget before connecting a wallet on your page,
bind the provider anyway; when they later connect through your UI, the
provider's `accountsChanged` event flows through the bridge and the widget
picks the wallet up without a reload.

The returned `unbind()` removes all listeners.

## Configuration (Noblocks operators)

- `NEXT_PUBLIC_EMBED_ENABLED`: feature flag; when not `"true"`, `/widget`
  returns 404.
- `EMBED_ALLOWED_ORIGINS`: comma-separated base allowlist (env-only, needs a
  redeploy to change). Origins must be `https://` (only `http://localhost` is
  accepted, for local dev).
- `INTERNAL_API_BASE_URL`: trusted absolute base URL (e.g. `https://noblocks.xyz`)
  the middleware uses to fetch the DB-backed allowlist. **Required to consult the
  `embed_allowed_origins` table**; if unset, only `EMBED_ALLOWED_ORIGINS` is
  used. Never derived from the request Host header, so a poisoned host can't
  redirect the authenticated fetch. On a failed/non-OK refresh the DB-backed
  origins are dropped (fail closed) until the next successful fetch.
- `embed_allowed_origins` table (Supabase): runtime allowlist, merged with the
  env var by `middleware.ts` (cached ~5 min). Managed via the secret-gated
  internal API:

```bash
# List
curl -H "x-internal-auth: $INTERNAL_API_KEY" https://noblocks.xyz/api/internal/embed-origins

# Add / update (contact_email required)
curl -X POST -H "x-internal-auth: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"origin":"https://app.partner.com","partner_name":"Partner","contact_email":"dev@partner.com","note":"Q3 pilot"}' \
  https://noblocks.xyz/api/internal/embed-origins

# Remove
curl -X DELETE -H "x-internal-auth: $INTERNAL_API_KEY" \
  "https://noblocks.xyz/api/internal/embed-origins?origin=https://app.partner.com"
```

Also add partner origins to the **Privy dashboard allowed origins** so Privy
login works inside their frames.

Widget loads are attributed server-side (cookieless) via the middleware
analytics event `Embed Widget Loaded` with the embedding `referrer_origin`;
no client trackers or cookie banner run inside the widget.
