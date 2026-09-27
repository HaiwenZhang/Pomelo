import type { BrdHeader } from "../header";
import type { Reader } from "../reader";
import { isUint32 } from "../record-values";

export type LayerListEntry =
  { Name: string } | { NameId: number; Properties: number; Unknown: number };
export type LayerListRecord = {
  NumEntries: number;
  Entries: LayerListEntry[];
  Key: number;
};
export type LayerListContent = { type: 0x2a; Entries: LayerListEntry[] };
function isLayerListEntry(value: unknown): value is LayerListEntry {
  if (typeof value !== "object" || value === null) return false;
  if ("Name" in value) return typeof value.Name === "string";
  return (
    "NameId" in value &&
    isUint32(value.NameId) &&
    "Properties" in value &&
    isUint32(value.Properties) &&
    "Unknown" in value &&
    isUint32(value.Unknown)
  );
}
export function isLayerListRecord(value: unknown): value is LayerListContent {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== 0x2a ||
    !("Entries" in value) ||
    !Array.isArray(value.Entries)
  )
    return false;
  if ("Key" in value && !isUint32(value.Key)) return false;
  if (
    "NumEntries" in value &&
    (!isUint32(value.NumEntries) || value.Entries.length !== value.NumEntries)
  )
    return false;
  return value.Entries.every((entry: unknown) => isLayerListEntry(entry));
}

/** 0x2a: inline layer names before 16.5, string references and properties thereafter. */
export function readLayerList(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): LayerListRecord {
  reader.skip(1);
  const numEntries = reader.u16();
  if (formatVersion >= 174) reader.skip(4);
  const entries: LayerListEntry[] = Array.from({ length: numEntries }, () =>
    formatVersion < 165
      ? { Name: reader.str(36) }
      : {
          NameId: reader.u32(),
          Properties: reader.u32(),
          Unknown: reader.u32(),
        },
  );
  const key = reader.u32();
  return { NumEntries: numEntries, Entries: entries, Key: key };
}
