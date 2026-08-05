import { computeEmbedCode, normalizeOrigin } from '../app/lib/embedCode';

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
});
