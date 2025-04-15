@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_cube<f32>;

@group(1) @binding(0) var<uniform> m_matrix:mat4x4f;
@group(1) @binding(1) var<uniform> v_matrix:mat4x4f;
@group(1) @binding(2) var<uniform> p_matrix:mat4x4f;
@group(1) @binding(3) var<uniform> norm_matrix:mat4x4f;

@fragment
fn main(
  @location(0) tc: vec4f,
  @location(1) altitude: f32,
) -> @location(0) vec4f {
    var cubemapVec = tc.xyz - vec3(0.5);
      cubemapVec.z *= -1;

      let sampledColor = textureSample(myTexture, mySampler, cubemapVec);
      return sampledColor;
}