/** In-place median partition for object arrays and packed source-ID arrays.
 * Checkpoints bound the work without recursive copies or synchronous sorts. */
export function* partitionMedian<T>(
  values: { length: number; [index: number]: T },
  center: (value: T) => number,
  start: number,
  end: number,
): Generator<void> {
  const mid = (start + end) >>> 1;
  let low = start,
    high = end - 1,
    work = 0;
  while (low < high) {
    const pivot = center(values[(low + high) >>> 1]);
    let a = low,
      b = high;
    while (a <= b) {
      while (center(values[a]) < pivot) {
        a++;
        if ((++work & 4095) === 0) yield;
      }
      while (center(values[b]) > pivot) {
        b--;
        if ((++work & 4095) === 0) yield;
      }
      if (a <= b) {
        const swap = values[a];
        values[a++] = values[b];
        values[b--] = swap;
      }
      if ((++work & 4095) === 0) yield;
    }
    if (mid <= b) high = b;
    else if (mid >= a) low = a;
    else break;
  }
}
