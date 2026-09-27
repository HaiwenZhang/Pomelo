import viewUniform from "./view-uniform.wgsl?raw";
import lineFrame from "./line-frame.wgsl?raw";
import primitive from "./primitive.wgsl?raw";
import polygon from "./polygon.wgsl?raw";
import arc from "./arc.wgsl?raw";
import label from "./label.wgsl?raw";

// Shared camera arithmetic precedes each entry point so all pipelines use
// the same high/low coordinate representation without duplicated WGSL.
export const primitiveShader = viewUniform + lineFrame + primitive;
export const polygonShader = viewUniform + polygon;
export const arcShader = viewUniform + arc;
export const labelShader = viewUniform + label;
