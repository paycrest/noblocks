# ERC-8021 Embed Attribution Implementation

## Summary

Implemented onchain attribution for embed/widget partners using ERC-8021 multi-code format. Every transaction now includes a deterministic embed code derived from the partner's origin, enabling volume tracking without relying solely on middleware analytics.

## Changes

### 1. Core Attribution Logic

**`app/lib/embedCode.ts`** (new)
- `computeEmbedCode(origin)`: Deterministic hash function
  - Algorithm: `e_` + first 8 hex chars of SHA-256(normalized origin)
  - Normalization: lowercase + strip trailing slashes
  - Works in both browser (Web Crypto) and Node.js
  - Example: `https://app.partner.com` → `e_233809b4`

**`app/lib/baseBuilderCode.ts`** (extended)
- `appendAttributionSuffix(chainId, data, embedCode)`: Multi-code attribution
  - Base mainnet: `bc_julg9gbq,<embedCode>` (existing Base code + comma + embed code)
  - Other chains: `<embedCode>` only
  - Backward compatible: works without embedCode (Base-only behavior)
- `appendEmbedCodeOnly(data, embedCode)`: For Privy smart wallet path
  - Appends only embed code (Base code already added by Privy plugin)

### 2. Context Integration

**`app/context/EmbedContext.tsx`**
- Added `embedCode` field to context
- Computes once when `parentOrigin` is resolved
- Cached for performance (no recomputation on every transaction)

### 3. Transaction Paths Updated

**`app/pages/TransactionPreview.tsx`**
- **Injected wallet path**: Uses `appendAttributionSuffix` for approve + createOrder
- **EIP-7702/bundler path**: Passes `embedCode` to bundler API
- **Privy smart wallet path**: Uses `appendEmbedCodeOnly` (avoids double-appending Base code)

**`app/lib/bundler/executeSponsored.ts`**
- Added `embedCode` parameter to `ExecuteSponsoredParams`
- Calls `appendAttributionSuffix` with embedCode

**`app/api/bundler/execute-sponsored/route.ts`**
- Extracts `embedCode` from request body
- Passes to `executeSponsored`

**`app/hooks/bridge.ts`**
- Uses `appendAttributionSuffix` for bridge transactions
- Reads `embedCode` from context via ref (avoids stale closures)

### 4. Tests

**`__tests__/embedCode.test.ts`** (new, 11 tests)
- Determinism: same origin → same code
- Normalization: case-insensitive, trailing slash handling
- Stability: documents exact algorithm
- Edge cases: null/undefined/empty input

**`__tests__/attributionSuffix.test.ts`** (new, 9 tests)
- Base mainnet: multi-code format (bc_julg9gbq + comma + embedCode)
- Other chains: embedCode only
- Backward compatibility: works without embedCode
- `appendEmbedCodeOnly`: standalone embed code appending

**`__tests__/baseBuilderCode.test.ts`** (existing, 3 tests)
- All existing tests still pass

**Total: 23 tests passing**

### 5. Documentation

**`docs/embed-widget.md`**
- New "Onchain Attribution" section
- Explains how embed codes work
- Documents the algorithm
- Warns about `Referrer-Policy: no-referrer` breaking attribution
- Clarifies that partners don't need to take any action

## Technical Details

### Embed Code Format
```
embedCode = "e_" + first 8 hex chars of sha256(normalizedOrigin)
```

**Examples:**
- `https://app.partner.com` → `e_233809b4`
- `https://App.Partner.COM/` → `e_233809b4` (same code after normalization)

### Onchain Calldata Format

The embed code is **not** appended after `BASE_BUILDER_CODE_SUFFIX`. A single
complete ERC-8021 schema 0 suffix is rebuilt from the full code list, so there is
exactly one length/schema/marker trailer per transaction:

```text
<original_calldata><codes ASCII hex><length byte><0x00 schema byte><0x8021 x 8>
```

Where:
- `codes` is a comma-separated ASCII list, hex-encoded
- `length byte` is the byte length of `codes` (max 255)
- `schema byte` is `0x00` (schema 0)
- the marker is `0x8021` repeated 8 times (16 bytes)

**Base mainnet (chainId 8453):** `codes` = `bc_julg9gbq,<embedCode>`

```text
62635f6a756c67396762712c655f3233333830396234 16 00 80218021802180218021802180218021
```

**Other chains:** `codes` = `<embedCode>` only — the length, schema, and marker
bytes are still present:

```text
655f3233333830396234 0a 00 80218021802180218021802180218021
```

Without an embed code, Base still gets the precomputed single-code
`BASE_BUILDER_CODE_SUFFIX` (`codes` = `bc_julg9gbq`) and other chains get nothing.

### Aggregator Parser Requirements

The aggregator parses the suffix backwards from the end of the outer transaction
calldata:
1. Verify the trailing 16-byte marker `0x8021` repeated 8 times
2. Read the schema byte (`0x00`); ignore suffixes with any other schema
3. Read the length byte and take that many preceding bytes as the ASCII `codes`
4. Split `codes` on `,` and match embed codes against the `embed_allowed_origins`
   allowlist by hashing each allowlisted origin

Do not strip or append bytes relative to `BASE_BUILDER_CODE_SUFFIX` — that
constant is only the precomputed encoding of the single code `bc_julg9gbq`, and a
multi-code suffix is a different byte string, not that constant plus an extra
code. See `EncodeERC8021Suffix` / `ParseERC8021Codes` in
`aggregator/services/builder_code.go`, which produce and consume byte-identical
output.

## Backward Compatibility

- All existing functionality preserved
- `appendBaseBuilderCode` still works (deprecated but not removed)
- Non-embed transactions work exactly as before
- Base builder code still appended on Base mainnet
- No breaking changes to APIs or interfaces

## Security Considerations

1. **Referrer trust model**: Unchanged from existing postMessage/middleware analytics
2. **One-way hash**: Embed codes cannot be reversed to reveal origins
3. **Deterministic**: Same origin always produces same code (can be reproduced at query time)
4. **Allowlist gating**: Middleware already blocks non-allowlisted origins from framing `/widget`

## Testing Checklist

- [x] TypeScript compiles without errors
- [x] All 23 attribution tests pass
- [x] Existing baseBuilderCode tests still pass
- [x] Injected wallet path tested
- [x] EIP-7702/bundler path tested
- [x] Privy smart wallet path tested
- [x] Bridge transactions tested
- [x] Non-embed mode works (no embedCode)
- [x] Base mainnet multi-code format correct
- [x] Other chains embed-only format correct

## Deployment Notes

1. **No database migrations required**: Embed codes are derived, not stored
2. **No environment variables required**: Uses existing `EMBED_ALLOWED_ORIGINS`
3. **Aggregator coordination**: Update parser to handle multi-code format (separate ticket)
4. **Partner communication**: Optional — attribution is automatic and transparent

## Future Enhancements

- Optional dual-write: Store `embedOrigin` in encrypted recipient metadata for easier DB filtering during rollout
- Analytics dashboard: Visualize volume by embed code
- Partner portal: Show partners their embed code and attributed volume

## References

- ERC-8021: Builder Codes & Onchain Attribution
- Existing builder code: `aggregator/services/builder_code.go` (must stay in sync)
- Middleware allowlist: `middleware.ts` + `embed_allowed_origins` table
