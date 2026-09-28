import viewSource from "./view-uniform.wgsl?raw";
import lineFrame from "./line-frame.wgsl?raw";
import primitive from "./primitive.wgsl?raw";
import polygon from "./polygon.wgsl?raw";
import arc from "./arc.wgsl?raw";
import label from "./label.wgsl?raw";

// Match CPU Float32Array layer colors exactly, including rounding at 8-bit blend
// boundaries. Runtime GPU division by 255 can differ by one ULP on Metal.
const viewUniform = viewSource.replace(
  "/* UNORM8_TABLE */",
  `const unorm8 = array<f32, 256>(${Array.from({ length: 256 }, (_, i) => `${Math.fround(i / 255).toExponential()}f`).join(",")});`,
);

// Shared camera arithmetic precedes each entry point so all pipelines use
// the same high/low coordinate representation without duplicated WGSL.
export const primitiveShader = viewUniform + lineFrame + primitive;
export const polygonShader = viewUniform + polygon;
export const arcShader = viewUniform + arc;
export const labelShader = viewUniform + label;
