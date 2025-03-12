struct Uniforms {
  modelViewProjectionMatrix : mat4x4f,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0)tc: vec2f,
}

@vertex
fn main(
  @location(0) position : vec3f,
  @location(1) texCoord : vec2f
) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.modelViewProjectionMatrix * vec4(position, 1.0);
  output.tc = texCoord;
  return output;
}



