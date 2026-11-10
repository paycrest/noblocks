/**
 * Sizing for the compact deposit QR.
 *
 * react-qrcode-logo draws cells at `size / moduleCount`, so a size that is not
 * a multiple of the module count yields fractional pixels. At the compact
 * 116px target that happens from version 4 (33 modules -> 3.5px) upwards, and
 * the resulting anti-aliased modules plus a thin quiet zone fail to scan.
 * Rounding the module size down to whole pixels keeps every cell crisp.
 */

export type QrEcLevel = "L" | "M" | "Q" | "H";

/** Byte-mode capacities per QR version (v1..v10) for each error-correction level. */
const BYTE_CAPACITY: Record<QrEcLevel, readonly number[]> = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119],
};

/** Figma compact card inner box (141x140 minus the 4px border). */
const COMPACT_QR_CANVAS = 132;
/** Target symbol edge before rounding to whole modules (Figma). */
const COMPACT_QR_TARGET = 116;
const MIN_MODULE_PX = 2;

/** Exact UTF-8 byte length, matching how qrcode-generator encodes the value. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

export function getCompactQrLayout(
  value: string,
  ecLevel: QrEcLevel = "M",
): { size: number; quietZone: number } {
  const capacities = BYTE_CAPACITY[ecLevel];
  const byteLength = utf8ByteLength(value);
  const fittingVersion = capacities.findIndex((capacity) => byteLength <= capacity);
  // Deposit addresses stay far below v10; clamp defensively rather than
  // returning a layout for a version we have no capacity row for.
  const version =
    fittingVersion === -1 ? capacities.length : fittingVersion + 1;
  const moduleCount = 17 + 4 * version;
  const modulePx = Math.max(
    MIN_MODULE_PX,
    Math.floor(COMPACT_QR_TARGET / moduleCount),
  );
  const size = modulePx * moduleCount;
  const quietZone = Math.floor((COMPACT_QR_CANVAS - size) / 2);

  return { size, quietZone };
}
