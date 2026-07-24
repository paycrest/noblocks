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

- The widget **fills the iframe** — it has no margins, shadow, or fixed size of
  its own. You control the size, corner radius, shadow, and positioning by
  styling the `<iframe>` element (as above). The example's rounded corners +
  shadow give the floating-card look; drop them for a flush embed. The widget
  keeps `background: transparent`, so its rounded corners reveal your page
  behind them — set the iframe's `border-radius` to match (24px).
- Recommended width **360–420px**. The widget renders its mobile UI below
  ~640px wide (a comfortable compact layout); above that it would switch to
  the desktop layout, so keep it narrow. Height is flexible — size it to fit
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

| Param         | Values                   | Effect                                                    |
| ------------- | ------------------------ | --------------------------------------------------------- |
| `theme`       | `dark` \| `light`        | Force the widget theme (default: visitor system theme)    |
| `side`        | `buy` \| `sell`          | Start in on-ramp (buy) or off-ramp (sell) mode            |
| `token`       | e.g. `USDC`, `USDT`      | Preselect token                                           |
| `currency`    | e.g. `NGN`, `KES`        | Preselect fiat currency                                   |
| `tokenAmount` | number                   | Prefill token amount                                      |
| `fiatAmount`  | number                   | Prefill fiat amount                                       |
| `provider`    | liquidity provider ID    | Pin a specific liquidity provider                         |
| `ref`         | referral code            | Attribute transactions to your referral code              |
| `injected`    | `true` \| `bridge`       | Wallet mode — see below                                   |

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

## Wallet modes

### Default: Privy login in the widget

Users sign in with email (Privy) inside the widget — no host integration
needed. Note: in Safari/Firefox, storage partitioning means the session may
not persist across page reloads, and OAuth popups must not be blocked.

### `injected=true` — extension wallet inside the iframe

Browser-extension wallets (MetaMask, Rabby, ...) inject `window.ethereum`
into iframes too, so the user transacts with the same extension they use on
your page. The wallet prompts them once to connect the noblocks.xyz origin
(auto-connects on return visits). This does **not** cover WalletConnect /
mobile-QR sessions — use the bridge for those.

### `injected=bridge` — hand off your page's connected wallet

Your page proxies the widget's wallet requests to **your** connected provider
(WalletConnect, AppKit, wagmi, `window.ethereum`, ...). All signing prompts
appear in your wallet UI; the widget never sees keys.

`bindWallet` is **required** for `injected=bridge` — don't pass the param on a
plain iframe with no host script. (If no bridge responds within ~4 seconds,
the widget automatically falls back to the standard sign-in flow rather than
hanging, but users see a loading state for those seconds.)

Bind the wallet **before** the iframe loads — create the iframe without a
`src`, call `bindWallet` (which installs the message listener), then set `src`.
Otherwise a fast widget load can fire `eth_requestAccounts` before the listener
exists and the request hangs until timeout.

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

The returned `unbind()` removes all listeners.

## Configuration (Noblocks operators)

- `NEXT_PUBLIC_EMBED_ENABLED` — feature flag; when not `"true"`, `/widget`
  returns 404.
- `EMBED_ALLOWED_ORIGINS` — comma-separated base allowlist (env-only, needs a
  redeploy to change). Origins must be `https://` (only `http://localhost` is
  accepted, for local dev).
- `INTERNAL_API_BASE_URL` — trusted absolute base URL (e.g. `https://noblocks.xyz`)
  the middleware uses to fetch the DB-backed allowlist. **Required to consult the
  `embed_allowed_origins` table** — if unset, only `EMBED_ALLOWED_ORIGINS` is
  used. Never derived from the request Host header, so a poisoned host can't
  redirect the authenticated fetch. On a failed/non-OK refresh the DB-backed
  origins are dropped (fail closed) until the next successful fetch.
- `embed_allowed_origins` table (Supabase) — runtime allowlist, merged with the
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
analytics event `Embed Widget Loaded` with the embedding `referrer_origin` —
no client trackers or cookie banner run inside the widget.
