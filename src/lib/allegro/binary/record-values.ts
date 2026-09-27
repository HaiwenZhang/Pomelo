/** Validate values at the boundary between decoded binary records and scene models. */
export function isUint32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

export function isUint32Words(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((word: unknown) => isUint32(word));
}
