import { test, expect } from "vitest";

import { isLayerListRecord } from "../../src/lib/allegro/binary/records/layers";

test("layer-list record accepts the legacy and modern entry layouts", () => {
  expect(
    isLayerListRecord({
      type: 0x2a,
      Key: 1,
      NumEntries: 1,
      Entries: [{ Name: "TOP" }],
    }),
  ).toBe(true);
  expect(
    isLayerListRecord({
      type: 0x2a,
      Key: 1,
      NumEntries: 1,
      Entries: [{ NameId: 2, Properties: 0x8000, Unknown: 0 }],
    }),
  ).toBe(true);
});

test("layer-list record rejects malformed entries and count mismatches", () => {
  expect(
    isLayerListRecord({
      type: 0x2a,
      Key: 1,
      NumEntries: 2,
      Entries: [{ Name: "TOP" }],
    }),
  ).toBe(false);
  expect(
    isLayerListRecord({
      type: 0x2a,
      Key: 1,
      NumEntries: 1,
      Entries: [{ NameId: 2, Properties: "copper", Unknown: 0 }],
    }),
  ).toBe(false);
});
