struct Uniforms {
  modelViewProjectionMatrix : mat4x4f,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;
/*
@fragment
fn main(
  @location(0) tc:vec2f
) -> @location(0) vec4f {
        let res = f32(floor(tc.x * 16.0)+ floor(tc.y * 16.0));
        let tile = f32(res % 2.0);
        let result = vec3f(tile * vec3f(1,1,1));
        return vec4f(result, 1.0);
}
*/
@group(0) @binding(1) var ourSampler: sampler;
@group(0) @binding(2) var ourTexture: texture_2d<f32>;

@fragment
fn main(
@location(0) tc:vec2f
) -> @location(0) vec4f {
  //return fsInput.color;
  return textureSample(ourTexture, ourSampler, tc);
}
/*
@fragment
fn main(@location(0) tc: vec2f) -> @location(0) vec4f {
    return vec4f(tc.x, tc.y, 0.0, 1.0); // Visualize UVs
}
*/
