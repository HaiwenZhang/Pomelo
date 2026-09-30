import { test, expect, vi } from "vitest";
import { LabelLayoutCache } from "../../src/lib/render/label-layout-cache";
import {
  BoardLabelLayout,
  type BoardLabelLayoutInput,
} from "../../src/lib/render/board-label-layout";
import { BoardDisplay } from "../../src/lib/board/display";
import { Camera } from "../../src/lib/interaction/camera";

test("labels reuse uploads for overlays and invalidate for camera, visibility, font and scene lifetime", () => {
  const layout = vi
    .spyOn(BoardLabelLayout, "layout")
    .mockReturnValue(new Map());
  try {
    const cache = new LabelLayoutCache(),
      upload = vi.fn();
    const input = {
      scene: {},
      font: {},
      camera: new Camera(),
      width: 1280,
      height: 800,
      options: BoardDisplay.createDisplayOptions(),
    } as unknown as BoardLabelLayoutInput;
    expect(cache.update(input, upload)).toBe(true);
    expect(cache.update(input, upload)).toBe(false);
    input.camera.x += 1;
    expect(cache.update(input, upload)).toBe(true);
    (input.options.hidden as Set<number>).add(1);
    expect(cache.update(input, upload)).toBe(true);
    input.font = { ...input.font };
    expect(cache.update(input, upload)).toBe(true);
    cache.clear();
    expect(cache.update(input, upload)).toBe(true);
    expect(upload).toHaveBeenCalledTimes(5);
  } finally {
    layout.mockRestore();
  }
});
test("composition settings reuse label uploads while layout settings invalidate them", () => {
  const layout = vi
    .spyOn(BoardLabelLayout, "layout")
    .mockReturnValue(new Map());
  try {
    const cache = new LabelLayoutCache(),
      upload = vi.fn();
    const options = BoardDisplay.createDisplayOptions();
    const input = {
      scene: {},
      font: {},
      camera: new Camera(),
      width: 1280,
      height: 800,
      options,
    } as unknown as BoardLabelLayoutInput;
    expect(cache.update(input, upload)).toBe(true);
    options.opacity = 0.5;
    options.activeLayer = 0;
    options.priorities = [{ layer: 1, category: "etch" }];
    options.filled = false;
    options.drills = false;
    options.backdrills = false;
    options.boardText = true;
    expect(cache.update(input, upload)).toBe(false);
    options.pinNames = false;
    expect(cache.update(input, upload)).toBe(true);
    options.shapes = 0;
    expect(cache.update(input, upload)).toBe(true);
    options.layerVisibility = new Map([[0, { etch: false }]]);
    expect(cache.update(input, upload)).toBe(true);
    expect(upload).toHaveBeenCalledTimes(4);
  } finally {
    layout.mockRestore();
  }
});
test("failed upload never marks labels as cached", () => {
  const layout = vi
    .spyOn(BoardLabelLayout, "layout")
    .mockReturnValue(new Map());
  try {
    const cache = new LabelLayoutCache();
    const input = {
      scene: {},
      font: {},
      camera: new Camera(),
      width: 1,
      height: 1,
      options: BoardDisplay.createDisplayOptions(),
    } as unknown as BoardLabelLayoutInput;
    expect(() =>
      cache.update(input, () => {
        throw Error("upload");
      }),
    ).toThrow("upload");
    expect(cache.update(input, () => {})).toBe(true);
  } finally {
    layout.mockRestore();
  }
});
