import { expect, test, vi } from "vitest";
import { importBoard } from "../../src/lib/import/formats";

const mocks = vi.hoisted(() => ({
  allegro: vi.fn(),
  odb: vi.fn(),
  hfss: vi.fn(),
  altium: vi.fn(),
  kicad: vi.fn(),
  pads: vi.fn(),
}));
vi.mock("../../src/lib/allegro/import", () => ({
  importAllegro: mocks.allegro,
}));
vi.mock("../../src/lib/odb/import", () => ({ importOdb: mocks.odb }));
vi.mock("../../src/lib/hfss/import", () => ({ importHfss: mocks.hfss }));
vi.mock("../../src/lib/altium/import", () => ({ importAltium: mocks.altium }));
vi.mock("../../src/lib/kicad/import", () => ({ importKiCad: mocks.kicad }));
vi.mock("../../src/lib/pads/import", () => ({ importPads: mocks.pads }));

test.each([
  { name: "board.TAR.GZ", format: "odb", info: { features: 7 }, records: 7 },
  {
    name: "board.DEF",
    format: "hfss",
    info: { sourcePrimitives: 3, padstacks: 4 },
    records: 7,
  },
  {
    name: "board.PcbDoc",
    format: "altium",
    info: { sourceObjects: 9 },
    records: 9,
  },
  {
    name: "board.KICAD_PCB",
    format: "kicad",
    info: { sourceObjects: 8 },
    records: 8,
  },
  {
    name: "board.PCB",
    format: "pads",
    info: { sourcePins: 2, sourceVias: 3, sourceRoutes: 4 },
    records: 9,
  },
] as const)(
  "$name preserves source metadata and combines its record counts",
  async ({ name, format, info, records }) => {
    const scene = {};
    const buffer = new ArrayBuffer(1);
    const signal = new AbortController().signal;
    const progress = vi.fn();
    const importer = mocks[format];
    importer.mockImplementation(async (_buffer, _signal, report) => {
      report("Source-specific phase");
      return { scene, info };
    });
    const loaded = await importBoard(name, buffer, signal, progress, "utf-8");
    expect(loaded.scene).toBe(scene);
    expect(loaded.metadata).toEqual({ format, [format]: info, records });
    expect(importer).toHaveBeenLastCalledWith(
      buffer,
      signal,
      expect.any(Function),
    );
    expect(progress).toHaveBeenCalledWith({
      phase: "Source-specific phase",
      fraction: 0.4,
    });
  },
);

test.each(["board.brd", "package.mcm", "legacy"])(
  "%s keeps the Allegro fallback and forwards its encoding",
  async (name) => {
    const imported = {
      scene: {},
      metadata: { format: "brd", records: 5, header: {} },
    };
    mocks.allegro.mockResolvedValue(imported);
    const buffer = new ArrayBuffer(1);
    const signal = new AbortController().signal;
    const progress = vi.fn();
    expect(await importBoard(name, buffer, signal, progress, "gbk")).toBe(
      imported,
    );
    expect(mocks.allegro).toHaveBeenLastCalledWith(
      buffer,
      signal,
      progress,
      "gbk",
    );
  },
);
