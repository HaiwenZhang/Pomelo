/**
 * Total byte lengths (including the type byte) for numeric geometry records
 * that can be indexed without decoding their fields. Other records must pass
 * through the full reader so variable payload validation still runs.
 */
export function getScannableRecordByteLength(
  recordType: number,
  formatVersion: number,
): number | undefined {
  const versionExtensionBytes = formatVersion >= 172 ? 4 : 0;
  switch (recordType) {
    case 0x01: // Arc
      return 80 + versionExtensionBytes;
    case 0x09: // Fill link
      return 44 + versionExtensionBytes + (formatVersion >= 174 ? 4 : 0);
    case 0x14: // Graphic
      return 32 + versionExtensionBytes;
    case 0x15:
    case 0x16:
    case 0x17: // Segment
      return 40 + versionExtensionBytes;
    default:
      return undefined;
  }
}
