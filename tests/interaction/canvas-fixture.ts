import { vi } from "vitest";

export class TestCanvas extends EventTarget {
  readonly style = { cursor: "default" };
  readonly captures = new Set<number>();
  readonly focus = vi.fn();
  getBoundingClientRect() {
    return { left: 20, top: 30, width: 800, height: 600 };
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
    this.dispatchEvent(new Event("lostpointercapture"));
  }
  get element() {
    return this as unknown as HTMLCanvasElement;
  }
}

export function emit(
  target: EventTarget,
  name: string,
  fields: object = {},
): Event {
  const event = Object.assign(new Event(name, { cancelable: true }), fields);
  target.dispatchEvent(event);
  return event;
}

export function installCanvasEnvironment() {
  const window = new EventTarget();
  const observers: { disconnect: ReturnType<typeof vi.fn>; trigger(): void }[] =
    [];
  class Element extends EventTarget {
    closest() {
      return null;
    }
  }
  vi.stubGlobal("window", window);
  vi.stubGlobal("HTMLElement", Element);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly disconnect = vi.fn();
      constructor(callback: () => void) {
        observers.push({ disconnect: this.disconnect, trigger: callback });
      }
      observe() {}
    },
  );
  return { window, observers };
}
