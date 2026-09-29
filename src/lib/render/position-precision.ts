import { completeSteps } from "../iteration";
/** Keep the residual before converting CPU doubles to GPU float32 positions.
 * Static geometry stays uploaded; pan/zoom only changes the split camera. */
export function splitPositions(
  values: ArrayLike<number>,
  stride: number,
  components: number,
) {
  return completeSteps(splitPositionSteps(values, stride, components));
}

/** Same buffers as the synchronous API; upload consumers can pause between tails. */
export function* splitPositionSteps(
  values: ArrayLike<number>,
  stride: number,
  components: number,
) {
  const data = new Float32Array(values),
    residual = new Float32Array((values.length / stride) * components);
  for (let i = 0, j = 0; i < values.length; i += stride) {
    for (let c = 0; c < components; c++)
      residual[j++] = values[i + c] - data[i + c];
    if (((i / stride) & 2047) === 2047) yield;
  }
  return { data, residual };
}
