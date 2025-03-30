struct Uniforms {
  viewProjectionMatrix : mat4x4f,
}
@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_cube<f32>;

@group(1) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) pos : vec4f,
  @location(0) tc: vec4f,
  @location(1) altitude: f32,
}

@vertex
fn main(
  @location(0) position : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  output.pos = uniforms.viewProjectionMatrix * position;
  output.tc = 0.5 * (position + vec4(1.0, 1.0, 1.0, 1.0));
  output.altitude = output.pos.y;
  return output;
}
