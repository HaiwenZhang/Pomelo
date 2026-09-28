/**
 * Total byte lengths (including the type byte) for fixed numeric records.
 * Keep inline strings and validated variable payloads on the full-reader path:
 * scanning must preserve text diagnostics and reject malformed payloads.
 */
export function getScannableRecordByteLength(
  recordType: number,
  formatVersion: number,
): number | undefined {
  const modern = formatVersion >= 160;
  const v172 = formatVersion >= 172 ? 4 : 0;
  const v174 = formatVersion >= 174 ? 4 : 0;
  switch (recordType) {
    case 0x01: // Arc
      return (modern ? 80 : 68) + v172;
    case 0x04: // Net assignment
      return 20 + v174;
    case 0x05: // Track
      return (modern ? 60 : 48) + 2 * v172;
    case 0x06: // Component
      return 36 + v172;
    case 0x07: // Legacy component instances contain an inline reference.
      return modern ? 40 + 2 * v172 : undefined;
    case 0x08: // Legacy pin numbers contain an inline name.
      return modern ? 24 + 2 * v172 : undefined;
    case 0x09: // Fill link
      return (modern ? 44 : 36) + v172 + v174;
    case 0x0a: // Design-rule check
      return (modern ? 68 : 64) + v172 + v174;
    case 0x0c: // Pin definition
      return (modern ? 56 : 48) + 2 * v172 + v174;
    case 0x0d: // Legacy pads contain an inline name.
      return modern ? 40 + v172 + v174 : undefined;
    case 0x0e: // Footprint rectangle
      return (modern ? 60 : 56) + 2 * v172;
    case 0x0f: // Legacy function slots contain an inline name.
      return modern
        ? (formatVersion >= 190 ? 28 : 56) + v172 + v174
        : undefined;
    case 0x10: // Legacy function instances contain an inline name.
      return modern ? 32 + v172 + v174 : undefined;
    case 0x11: // Legacy pin names are inline.
      return modern ? 24 + v174 : undefined;
    case 0x12: // Cross-reference
      return 24 + (formatVersion >= 165 ? 4 : 0) + v174;
    case 0x14: // Graphic
      return (modern ? 32 : 28) + v172;
    case 0x15:
    case 0x16:
    case 0x17: // Segment
      return 40 + v172;
    case 0x1b: // Net
      return (modern ? 56 : 52) + v172;
    case 0x20:
      return formatVersion >= 174 ? 80 : 40;
    case 0x22:
      return 40 + v172;
    case 0x23: // Ratline
      return (modern ? 68 : 64) + (formatVersion >= 164 ? 16 : 0) + v174;
    case 0x24: // Rectangle
      return 52 + v172;
    case 0x26: // Match group
      return 20 + v172 + v174;
    case 0x28: // Shape
      return (modern ? 68 : 64) + 2 * v172;
    case 0x29: // Pin
      return 56;
    case 0x2b: // Footprint definition
      return 68 + (formatVersion >= 164 ? 4 : 0) + v172;
    case 0x2c: // Table
      return (modern ? 36 : 28) + 2 * v172;
    case 0x2d: // Footprint instance
      return (modern ? 64 : 60) + 2 * v172;
    case 0x2e: // Connection
      return 36 + v172;
    case 0x2f:
      return 32;
    case 0x30: // Text wrapper (string stored in a separate 0x31 record)
      return (modern ? 44 : 40) + 3 * v172 + v174;
    case 0x32: // Placed pad
      return (modern ? 76 : 72) + 2 * v172;
    case 0x33: // Via
      return (modern ? 72 : 68) + 2 * v172;
    case 0x34: // Keepout
      return (modern ? 32 : 28) + v172;
    case 0x35: // Opaque file reference; this record has no key.
      return 124;
    case 0x37: // Fixed capacity of 100 pointers
      return 428 + v174;
    case 0x38: // Older films contain an inline name.
      return formatVersion >= 166 ? 52 + v174 : undefined;
    case 0x39: // Film layer list
      return 60;
    case 0x3a: // Film list node
      return 16 + v174;
    case 0x3e: // Ordered keys
      return 44;
    default:
      return undefined;
  }
}
