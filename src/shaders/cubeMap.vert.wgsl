@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_cube<f32>;

@group(1) @binding(0) var<uniform> m_matrix:mat4x4f;
@group(1) @binding(1) var<uniform> v_matrix:mat4x4f;
@group(1) @binding(2) var<uniform> p_matrix:mat4x4f;
@group(1) @binding(3) var<uniform> norm_matrix:mat4x4f;

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
  output.pos = p_matrix * v_matrix * m_matrix * position;
  output.tc = 0.5 * (position + vec4(1.0, 1.0, 1.0, 1.0));
  output.altitude = output.pos.y;
  return output;
}
