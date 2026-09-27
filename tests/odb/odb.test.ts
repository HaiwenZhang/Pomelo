import { test, expect } from "vitest";

import { gzipSync } from "node:zlib";
import { PadShape } from "../../src/lib/board/shapes/pad";
import { readOdbArchive } from "../../src/lib/odb/archive";
import { orientation, readFeatures } from "../../src/lib/odb/features";
import { padPaths, transformPoint } from "../../src/lib/odb/geometry";
import { importOdb } from "../../src/lib/odb/import";
import { contourIslands, standardSymbol } from "../../src/lib/odb/symbols";

function tar(entries: Record<string, string | Buffer>) {
  const pieces: Buffer[] = [];
  for (const [name, body] of Object.entries(entries)) {
    const bytes = typeof body === "string" ? Buffer.from(body) : body,
      h = Buffer.alloc(512);
    h.write(name);
    h.write("0000644\0", 100);
    h.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
    h.fill(32, 148, 156);
    h[156] = 48;
    const sum = h.reduce((s, x) => s + x, 0);
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    pieces.push(h, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  pieces.push(Buffer.alloc(1024));
  const b = Buffer.concat(pieces);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
const matrix =
  "STEP {\nCOL=1\nNAME=PCB\n}\n" +
  ["TOP", "BOTTOM"]
    .map(
      (name, i) =>
        `LAYER {\nROW=${i + 1}\nTYPE=SIGNAL\nCONTEXT=BOARD\nNAME=${name}\nPOLARITY=POSITIVE\n}\n`,
    )
    .join("") +
  "LAYER {\nROW=3\nTYPE=DRILL\nNAME=DRILL\nSTART_NAME=TOP\nEND_NAME=BOTTOM\n}\n";
const square = "S P 0\nOB 0 0 I\nOS 2 0\nOS 2 2\nOS 0 2\nOS 0 0\nOE\nSE\n";
function fixture() {
  return {
    "matrix/matrix": matrix,
    "misc/info": "UNITS=MM\nODB_VERSION_MAJOR=8\nODB_VERSION_MINOR=1",
    "steps/pcb/stephdr": "UNITS=MM",
    "steps/pcb/profile": square,
    "steps/pcb/eda/data":
      "LYR top bottom drill\nNET GND\nSNT VIA\nFID C 0 0\nFID C 1 0\nFID H 2 0",
    "steps/pcb/layers/top/features": "$0 r1000\nP 1 1 0 P 0 0;;ID=99",
    "steps/pcb/layers/bottom/features": "$0 r800\nP 1 1 0 P 0 0",
    "steps/pcb/layers/drill/features": "$0 r400\n@0 .drill\nP 1 1 0 P 0 0;0=2",
  };
}
async function features(text: string) {
  const r = [];
  for await (const f of readFeatures(text, "MM")) r.push(f);
  return r;
}
test("tar/gzip roots, checksum, bounds, duplicate paths and traversal are checked", async () => {
  const input = tar({ "job/matrix/matrix": matrix }),
    gzip = gzipSync(Buffer.from(input));
  const archive = await readOdbArchive(
    gzip.buffer.slice(gzip.byteOffset, gzip.byteOffset + gzip.byteLength),
  );
  expect(archive.root).toBe("job/");
  expect(archive.text("matrix/matrix")).toBe(matrix);
  await expect(
    readOdbArchive(tar({ "../matrix/matrix": matrix })),
  ).rejects.toThrow(/路径/);
  await expect(
    readOdbArchive(tar({ "matrix/matrix": matrix, "./matrix/matrix": matrix })),
  ).rejects.toThrow(/重复/);
  const bad = new Uint8Array(input.slice(0));
  bad[1] ^= 1;
  await expect(readOdbArchive(bad.buffer)).rejects.toThrow(/校验/);
  await expect(readOdbArchive(input.slice(0, 1000))).rejects.toThrow(
    /截断|结束/,
  );
  await expect(
    readOdbArchive(input, undefined, undefined, {
      bytes: 16,
      entries: 10,
      entryBytes: 10,
    }),
  ).rejects.toThrow(/限额/);
  await expect(
    readOdbArchive(
      gzip.buffer.slice(gzip.byteOffset, gzip.byteOffset + gzip.byteLength),
      undefined,
      undefined,
      { bytes: 16, entries: 10, entryBytes: 10 },
    ),
  ).rejects.toThrow(/限额/);
});
test("feature sequence differs from UID; full-circle direction and explicit symbol units survive", async () => {
  const list = await features(
    "$0 r10 I\n&0\nP 1 2 0 P 0 8 30;;ID=900\nA 2 2 2 2 1 2 0 P 0 Y\n" + square,
  );
  expect(list.map((f) => f.index)).toStrictEqual([0, 1, 2]);
  expect(list[0].uid).toBe("900");
  expect(list[0].kind).toBe("pad");
  if (list[0].kind === "pad") expect(list[0].symbol.scale).toBe(0.0254);
  expect(list[1].kind).toBe("line");
  if (list[1].kind === "line")
    expect(list[1].segment.arc!.sweep).toBe(-2 * Math.PI);
});
test("all orientation codes rotate clockwise then mirror world X", () => {
  for (let code = 0; code < 10; code++) {
    const o = orientation(code, 37),
      deg = code < 8 ? (code % 4) * 90 : 37,
      theta = (-deg * Math.PI) / 180;
    const expected: [number, number] = [
      2 * Math.cos(theta) - 3 * Math.sin(theta),
      2 * Math.sin(theta) + 3 * Math.cos(theta),
    ];
    if (o.mirror) expected[0] *= -1;
    const actual = transformPoint([2, 3], [0, 0], o.angle, o.mirror);
    expect(
      Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-12,
    ).toBeTruthy();
  }
});
test("independent surface islands and holes are not flattened into a single outer contour", async () => {
  const list = await features(
    square.replace(
      "SE",
      "OB .5 .5 H\nOS .5 1\nOS 1 1\nOS 1 .5\nOS .5 .5\nOE\nOB 3 0 I\nOS 4 0\nOS 4 1\nOS 3 1\nOS 3 0\nOE\nSE",
    ),
  );
  expect(list[0].kind).toBe("surface");
  if (list[0].kind === "surface")
    expect(
      contourIslands(list[0].contours).map((i) => i.paths.length),
    ).toStrictEqual([2, 1]);
  await expect(features(square.replace("OS 0 0", "OS 0 .1"))).rejects.toThrow(
    /闭合/,
  );
  await expect(features(square.replace("S P", "S N"))).rejects.toThrow(
    /负极性/,
  );
  await expect(features(square.replace("SE", ""))).rejects.toThrow(/截断/);
});
test("symbol units, roundrect radii, donuts and selected corners retain dimensions", () => {
  const round = standardSymbol({ name: "rect1000x2000xr100", scale: 0.001 })!
    .pads[0];
  expect(round.width).toBe(1);
  expect(round.height).toBe(2);
  expect(round.corner).toBe(0.1);
  const donut = standardSymbol({ name: "donut_r1000x500", scale: 0.001 })!
    .pads[0];
  expect(padPaths(donut).length).toBe(2);
  expect(new PadShape(donut).distance([0, 0], { at: [0, 0] }) > 0).toBeTruthy();
  expect(
    new PadShape(donut).distance([0.4, 0], { at: [0, 0] }) < 0,
  ).toBeTruthy();
  const partial = standardSymbol({
    name: "rect1000x1000xr100x1",
    scale: 0.001,
  })!.pads[0];
  expect(partial.customPaths![0].filter((s) => s.arc).length).toBe(1);
  const zero = standardSymbol({
    name: "donut_r188612.5260x188612.5260",
    scale: 0.001,
  })!;
  expect(zero.pads.length).toBe(0);
  expect(zero.strokes[0].width).toBe(0);
  expect(zero.strokes[0].arc!.radius).toBe(94.306263);
});
test("complete import uses FID ownership, physical layer span and independent drill dimensions", async () => {
  const { scene, info } = await importOdb(tar(fixture()));
  expect(scene.vias.length).toBe(1);
  expect(scene.pins.length).toBe(0);
  const via = scene.vias[0];
  expect(via.net).toBe(1);
  expect(scene.nets.get(1)).toBe("GND");
  expect(via.drill).toBe(0.4);
  expect(via.pads.map((p) => p.width)).toStrictEqual([1, 0.8]);
  expect([via.startLayer, via.endLayer]).toStrictEqual([0, 1]);
  expect(info.features).toBe(3);
  expect(scene.outline.length).toBe(4);
});
test("eccentric pad and hole keep their distinct positions after anchoring to the drill", async () => {
  const f = fixture();
  f["steps/pcb/layers/top/features"] = "$0 r1000\nP 1.1 1 0 P 0 0";
  const via = (await importOdb(tar(f))).scene.vias[0];
  expect(via.at).toStrictEqual([1, 1]);
  expect(Math.abs(via.pads[0].offset[0] - 0.1) < 1e-12).toBeTruthy();
  expect(via.pads[1].offset[0]).toBe(0);
});
test("squared round thermal preserves its four gaps and analytic circular edges", () => {
  const s = standardSymbol({ name: "ths2500x2000x0x4x350", scale: 0.001 })!;
  expect(s.pads.length).toBe(4);
  for (const pad of s.pads)
    expect(pad.customPaths![0].filter((e) => e.arc).length).toBe(2);
  const inside = (p: [number, number]) =>
    s.pads.some((pad) => new PadShape(pad).distance(p, { at: [0, 0] }) < 0);
  expect(inside([1.1, 0])).toBe(false);
  expect(inside([0, 1.1])).toBe(false);
  expect(inside([0.78, 0.78])).toBe(true);
  expect(inside([0, 0])).toBe(false);
});
test("legacy U MM unit directives and zero-width drill outline arcs are preserved", async () => {
  const list = [];
  for await (const f of readFeatures("U MM\n$0 r1000\nL 1 2 3 4 0 P 0", "INCH"))
    list.push(f);
  expect(list[0].kind).toBe("line");
  if (list[0].kind === "line") expect(list[0].segment.a).toStrictEqual([1, 2]);
  const f = fixture();
  f["steps/pcb/layers/drill/features"] += "\n$1 r0\nA 2 0 2 0 0 0 1 P 0 Y";
  const result = await importOdb(tar(f));
  expect(result.scene.vias.length).toBe(1);
  expect(result.scene.segments.length).toBe(1);
  expect(result.scene.segments[0].width).toBe(0);
});
test("cancellation rejects import and the next independent import succeeds", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(importOdb(tar(fixture()), abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  const abortDuring = new AbortController();
  await expect(
    importOdb(tar(fixture()), abortDuring.signal, (phase) => {
      if (phase.includes("图层")) abortDuring.abort();
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect((await importOdb(tar(fixture()))).scene.vias.length).toBe(1);
});
test("non-UTF8 descriptions stay byte-exact but invalid geometric records fail", async () => {
  const body = Buffer.concat([
    Buffer.from("CMP 0 0 0 0 N U1 x\nPRP Description "),
    Buffer.from([0xa1, 0xc0]),
    Buffer.from("\nTOP 0 0 0 0 N 0 0 1\n"),
  ]);
  const archive = await readOdbArchive(
    tar({
      "matrix/matrix": matrix,
      "steps/pcb/layers/comp_+_top/components": body,
    }),
  );
  expect(archive.text("steps/pcb/layers/comp_+_top/components")).toMatch(/TOP/);
  expect(archive.opaqueProperties.length).toBe(1);
  expect(
    Buffer.from(archive.opaqueProperties[0].bytes).includes(
      Buffer.from([0xa1, 0xc0]),
    ),
  ).toBeTruthy();
  const bad = await readOdbArchive(
    tar({
      "matrix/matrix": matrix,
      "steps/pcb/layers/comp_+_top/components": Buffer.from([0xa1, 0xc0]),
    }),
  );
  expect(() => bad.text("steps/pcb/layers/comp_+_top/components")).toThrow(
    /编码无效/,
  );
  const f = fixture(),
    eda = Buffer.concat([
      Buffer.from(f["steps/pcb/eda/data"] + "\nPRP Owner "),
      Buffer.from([0xa1, 0xc0]),
    ]);
  const imported = await importOdb(tar({ ...f, "steps/pcb/eda/data": eda }));
  expect(imported.scene.vias[0].net).toBe(1);
  expect(imported.info.opaqueProperties.length).toBe(1);
  expect(
    Buffer.from(imported.info.opaqueProperties[0].bytes).equals(
      eda.subarray(eda.lastIndexOf(Buffer.from("PRP"))),
    ),
  ).toBeTruthy();
});

test("large surface traversal yields to scheduled cancellation before its final SE", async () => {
  const controller = new AbortController(),
    long = "S P 0\nOB 0 0 I\n" + "OS 1 0\nOS 0 0\n".repeat(200000) + "OE\nSE\n";
  let completed = 0;
  const task = (async () => {
    for await (const f of readFeatures(long, "MM", controller.signal)) {
      expect(f.kind).toBe("surface");
      completed++;
    }
  })();
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(completed).toBe(0);
  } finally {
    clearTimeout(timer);
  }
  expect((await features(square)).length).toBe(1);
});

test("layer-specific rotated and mirrored pads keep their world-space corners after an eccentric hole", async () => {
  for (const [topCode, bottomCode] of [
    [1, 0],
    [4, 8],
    [9, 5],
  ]) {
    const f = fixture();
    f["steps/pcb/layers/top/features"] =
      `$0 rect1000x500\nP 1.1 1 0 P 0 ${topCode} 37`;
    f["steps/pcb/layers/bottom/features"] =
      `$0 rect800x400\nP 1 1.1 0 P 0 ${bottomCode} 37`;
    const via = (await importOdb(tar(f))).scene.vias[0];
    for (const [i, code, w, h, at] of [
      [0, topCode, 1, 0.5, [1.1, 1]],
      [1, bottomCode, 0.8, 0.4, [1, 1.1]],
    ] as const) {
      const original = orientation(code, 37),
        corners: [
          [number, number],
          [number, number],
          [number, number],
          [number, number],
        ] = [
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
          [w / 2, h / 2],
          [-w / 2, h / 2],
        ];
      const actual = padPaths(via.pads[i]).flatMap((path) =>
        path.map((s) =>
          transformPoint(
            s.a,
            [
              via.at[0] + via.pads[i].offset[0],
              via.at[1] + via.pads[i].offset[1],
            ],
            via.angle ?? 0,
            !!via.back,
          ),
        ),
      );
      for (const corner of corners) {
        const expected = transformPoint(
          corner,
          [...at],
          original.angle,
          original.mirror,
        );
        expect(
          actual.some(
            (p) => Math.hypot(p[0] - expected[0], p[1] - expected[1]) < 1e-10,
          ),
        ).toBeTruthy();
      }
    }
  }
});
