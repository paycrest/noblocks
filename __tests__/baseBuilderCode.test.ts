import {
  appendAttributionSuffix,
  appendBaseBuilderCode,
  appendEmbedCodeOnly,
  BASE_BUILDER_CODE_SUFFIX,
  BASE_MAINNET_CHAIN_ID,
  computeEmbedCode,
  isValidEmbedCode,
  normalizeOrigin,
} from "../app/lib/baseBuilderCode";

const SAMPLE_CALLDATA = "0xdeadbeef" as const;
const SAMPLE_EMBED_CODE = "e_233809b4";

describe("appendBaseBuilderCode", () => {
  it("appends suffix on Base mainnet (8453)", () => {
    const result = appendBaseBuilderCode(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA);
    expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);
    expect(result.endsWith(BASE_BUILDER_CODE_SUFFIX.slice(2))).toBe(true);
  });

  it("is a no-op on other chains", () => {
    expect(appendBaseBuilderCode(137, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
    expect(appendBaseBuilderCode(84532, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
  });

  it("does not mutate the input reference", () => {
    const input = SAMPLE_CALLDATA;
    appendBaseBuilderCode(BASE_MAINNET_CHAIN_ID, input);
    expect(input).toBe(SAMPLE_CALLDATA);
  });
});

/**
 * Helper to decode an ERC-8021 schema 0 suffix and verify its structure.
 * Returns the codes string.
 */
function decodeERC8021Suffix(suffixHex: string): string {
  const bytes = Buffer.from(suffixHex.replace('0x', ''), 'hex');

  // Last 16 bytes: marker (0x8021 repeated 8 times = 16 bytes = 32 hex chars)
  const marker = bytes.slice(-16).toString('hex');
  expect(marker).toBe('8021'.repeat(8));
  expect(marker.length).toBe(32); // 16 bytes = 32 hex chars

  // Byte -17: schema (must be 0x00)
  const schema = bytes[bytes.length - 17];
  expect(schema).toBe(0x00);

  // Byte -18: length
  const length = bytes[bytes.length - 18];

  // Bytes 0..length-1: codes
  const codes = bytes.slice(0, length).toString('ascii');
  expect(codes.length).toBe(length);

  return codes;
}

describe('appendAttributionSuffix', () => {
  describe('without embedCode', () => {
    it('appends Base builder code on Base mainnet', () => {
      const result = appendAttributionSuffix(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA);
      expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);

      // Verify it's valid ERC-8021
      const codes = decodeERC8021Suffix(BASE_BUILDER_CODE_SUFFIX);
      expect(codes).toBe('bc_julg9gbq');
    });

    it('returns data unchanged on other chains', () => {
      expect(appendAttributionSuffix(137, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
      expect(appendAttributionSuffix(84532, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
    });
  });

  describe('with embedCode', () => {
    it('appends ERC-8021 multi-code suffix on Base mainnet', () => {
      const result = appendAttributionSuffix(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA, SAMPLE_EMBED_CODE);

      // Extract the suffix (everything after SAMPLE_CALLDATA)
      const suffix = result.slice(SAMPLE_CALLDATA.length);
      const codes = decodeERC8021Suffix(`0x${suffix}`);

      // Should be comma-separated: bc_julg9gbq,e_233809b4
      expect(codes).toBe(`bc_julg9gbq,${SAMPLE_EMBED_CODE}`);
    });

    it('appends ERC-8021 single-code suffix on other chains', () => {
      const result = appendAttributionSuffix(137, SAMPLE_CALLDATA, SAMPLE_EMBED_CODE);

      // Extract the suffix
      const suffix = result.slice(SAMPLE_CALLDATA.length);
      const codes = decodeERC8021Suffix(`0x${suffix}`);

      // Should be just the embed code
      expect(codes).toBe(SAMPLE_EMBED_CODE);
    });

    it('handles null embedCode', () => {
      const result = appendAttributionSuffix(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA, null);
      expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);
    });

    it('handles undefined embedCode', () => {
      const result = appendAttributionSuffix(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA, undefined);
      expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);
    });
  });
});

describe('appendEmbedCodeOnly', () => {
  it('appends only the embed code as ERC-8021 suffix (no Base builder code)', () => {
    const result = appendEmbedCodeOnly(SAMPLE_CALLDATA, SAMPLE_EMBED_CODE);

    // Extract the suffix
    const suffix = result.slice(SAMPLE_CALLDATA.length);
    const codes = decodeERC8021Suffix(`0x${suffix}`);

    // Should be just the embed code
    expect(codes).toBe(SAMPLE_EMBED_CODE);
  });

  it('returns data unchanged when embedCode is null', () => {
    expect(appendEmbedCodeOnly(SAMPLE_CALLDATA, null)).toBe(SAMPLE_CALLDATA);
  });

  it('returns data unchanged when embedCode is undefined', () => {
    expect(appendEmbedCodeOnly(SAMPLE_CALLDATA, undefined)).toBe(SAMPLE_CALLDATA);
  });

  it('works on any chain (not Base-specific)', () => {
    const result1 = appendEmbedCodeOnly(SAMPLE_CALLDATA, SAMPLE_EMBED_CODE);
    const result2 = appendEmbedCodeOnly(SAMPLE_CALLDATA, SAMPLE_EMBED_CODE);
    expect(result1).toBe(result2);
  });
});

describe('ERC-8021 structure validation', () => {
  it('treats empty string as no embed code', () => {
    const result = appendAttributionSuffix(8453, SAMPLE_CALLDATA, '');
    expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);
  });

  it('rejects codes over 255 bytes', () => {
    const longCode = 'e_' + 'a'.repeat(260);
    expect(() => appendAttributionSuffix(8453, SAMPLE_CALLDATA, longCode)).toThrow();
  });

  it('rejects non-printable characters', () => {
    const badCode = 'e_\x00\x01\x02';
    expect(() => appendAttributionSuffix(8453, SAMPLE_CALLDATA, badCode)).toThrow();
  });
});

describe('embedCode', () => {
  describe('normalizeOrigin', () => {
    it('lowercases the origin', () => {
      expect(normalizeOrigin('https://App.Partner.COM')).toBe('https://app.partner.com');
    });

    it('strips trailing slashes', () => {
      expect(normalizeOrigin('https://app.partner.com/')).toBe('https://app.partner.com');
      expect(normalizeOrigin('https://app.partner.com///')).toBe('https://app.partner.com');
    });

    it('combines lowercase and slash stripping', () => {
      expect(normalizeOrigin('https://App.Partner.COM/')).toBe('https://app.partner.com');
    });
  });

  describe('computeEmbedCode', () => {
    it('returns null for null/undefined/empty input', async () => {
      expect(await computeEmbedCode(null)).toBeNull();
      expect(await computeEmbedCode(undefined)).toBeNull();
      expect(await computeEmbedCode('')).toBeNull();
    });

    it('produces a code starting with e_', async () => {
      const code = await computeEmbedCode('https://app.partner.com');
      expect(code).toMatch(/^e_[0-9a-f]{8}$/);
    });

    it('is deterministic (same input → same output)', async () => {
      const code1 = await computeEmbedCode('https://app.partner.com');
      const code2 = await computeEmbedCode('https://app.partner.com');
      expect(code1).toBe(code2);
    });

    it('normalizes before hashing (case-insensitive)', async () => {
      const code1 = await computeEmbedCode('https://App.Partner.COM');
      const code2 = await computeEmbedCode('https://app.partner.com');
      expect(code1).toBe(code2);
    });

    it('normalizes before hashing (trailing slash)', async () => {
      const code1 = await computeEmbedCode('https://app.partner.com/');
      const code2 = await computeEmbedCode('https://app.partner.com');
      expect(code1).toBe(code2);
    });

    it('produces different codes for different origins', async () => {
      const code1 = await computeEmbedCode('https://app.partner1.com');
      const code2 = await computeEmbedCode('https://app.partner2.com');
      expect(code1).not.toBe(code2);
    });

    it('produces stable output across test runs', async () => {
      // This test documents the exact algorithm so regressions are caught.
      // sha256('https://app.partner.com') = 233809b4... → first 8 hex chars
      const code = await computeEmbedCode('https://app.partner.com');
      expect(code).toBe('e_233809b4');
    });
  });

  describe('isValidEmbedCode', () => {
    it('accepts a derived code', async () => {
      const code = await computeEmbedCode('https://app.partner.com');
      expect(isValidEmbedCode(code)).toBe(true);
      expect(isValidEmbedCode('e_233809b4')).toBe(true);
    });

    it('rejects codes with the wrong shape', () => {
      expect(isValidEmbedCode('e_233809B4')).toBe(false); // uppercase hex
      expect(isValidEmbedCode('e_233809b')).toBe(false); // too short
      expect(isValidEmbedCode('e_233809b44')).toBe(false); // too long
      expect(isValidEmbedCode('e_2338zzzz')).toBe(false); // non-hex
      expect(isValidEmbedCode('233809b4')).toBe(false); // missing prefix
      expect(isValidEmbedCode('bc_julg9gbq')).toBe(false); // builder code, not an embed code
      expect(isValidEmbedCode('e_233809b4,bc_julg9gbq')).toBe(false); // injected extra code
      expect(isValidEmbedCode('e_233809b4\n')).toBe(false); // trailing newline
      expect(isValidEmbedCode('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isValidEmbedCode(undefined)).toBe(false);
      expect(isValidEmbedCode(null)).toBe(false);
      expect(isValidEmbedCode(12345678)).toBe(false);
      expect(isValidEmbedCode({ toString: () => 'e_233809b4' })).toBe(false);
    });
  });
});
