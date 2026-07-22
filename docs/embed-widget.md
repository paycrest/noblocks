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
  style="width: 100%; max-width: 460px; height: 680px; border: 0; background: transparent"
></iframe>
```

Notes:

- Do **not** set `Referrer-Policy: no-referrer` on the embedding page (or
  `referrerpolicy="no-referrer"` on the iframe). The widget derives your origin
  from the referrer to send you events; origin-level referrer
  (`strict-origin-when-cross-origin`, the browser default) is enough.
- `camera` is needed for KYC selfie capture, `clipboard-write` for
  copy-address buttons.
- The widget renders as a floating card (393px) on a **transparent backdrop**,
  with its close button in a right-side gutter. Give the iframe **≥ 449px**
  width for that layout; below 449px the close button moves inside the card
  header (compact/mobile variant), so narrower embeds still work.

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

| Event                | Payload                 | Meaning                                    |
| -------------------- | ----------------------- | ------------------------------------------ |
| `noblocks:ready`     | —                       | Widget mounted                             |
| `noblocks:resize`    | `{ height }`            | Content height changed (auto-size iframe)  |
| `noblocks:close`     | —                       | User clicked the widget close button — remove/hide the iframe |
| `noblocks:tx_status` | `{ status, orderId }`   | Transaction progress (e.g. `pending`, `settled`, `refunded`) |

```js
window.addEventListener("message", (e) => {
  if (e.origin !== "https://noblocks.xyz") return;
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

```html
<script src="https://noblocks.xyz/embed.js"></script>
<iframe id="noblocks-widget" src="https://noblocks.xyz/widget?injected=bridge"></iframe>
<script>
  const iframe = document.getElementById("noblocks-widget");
  const unbind = NoblocksEmbed.bindWallet(iframe, window.ethereum, {
    onEvent(event, payload) {
      if (event === "noblocks:resize") iframe.style.height = payload.height + "px";
      if (event === "noblocks:close") iframe.remove();
    },
  });
</script>
```

With wagmi (v2), pass the connector's provider:

```ts
import { getConnectorClient } from "@wagmi/core";

const client = await getConnectorClient(wagmiConfig);
NoblocksEmbed.bindWallet(iframe, client.transport, { onEvent });
// or: NoblocksEmbed.bindWallet(iframe, await connector.getProvider(), { onEvent });
```

Call `bindWallet` before (or immediately after) inserting the iframe so no
request is missed. The returned `unbind()` removes all listeners.

## Configuration (Noblocks operators)

- `NEXT_PUBLIC_EMBED_ENABLED` — feature flag; when not `"true"`, `/widget`
  returns 404.
- `EMBED_ALLOWED_ORIGINS` — comma-separated base allowlist (env-only, needs a
  redeploy to change).
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
