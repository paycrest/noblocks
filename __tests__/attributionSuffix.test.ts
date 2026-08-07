import { appendAttributionSuffix, appendEmbedCodeOnly, BASE_BUILDER_CODE_SUFFIX, BASE_MAINNET_CHAIN_ID } from '../app/lib/baseBuilderCode';

const SAMPLE_CALLDATA = '0xdeadbeef' as const;
const SAMPLE_EMBED_CODE = 'e_233809b4';

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
