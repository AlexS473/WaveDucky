struct Uniforms {
  modelViewProjectionMatrix : mat4x4f,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

@fragment
fn main(
  @location(0) tc:vec2f
) -> @location(0) vec4f {
        let res = f32(floor(tc.x * 16.0)+ floor(tc.y * 16.0));
        let tile = f32(res % 2.0);
        let result = vec3f(tile * vec3f(1,1,1));
        return vec4f(result, 1.0);
}
/*
@fragment
fn main(@location(0) tc: vec2f) -> @location(0) vec4f {
    return vec4f(tc.x, tc.y, 0.0, 1.0); // Visualize UVs
}
*/
