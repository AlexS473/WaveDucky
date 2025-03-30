@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_cube<f32>;

@fragment
fn main(
  @location(0) tc: vec4f,
  @location(1) altitude: f32,
) -> @location(0) vec4f {
    var cubemapVec = tc.xyz - vec3(0.5);
      cubemapVec.z *= -1;

      let sampledColor = textureSample(myTexture, mySampler, cubemapVec);

      var fragColor = select(
        textureSample(myTexture, mySampler, cubemapVec),
        vec4f(0, 0, .2, 1),
        altitude < .47
        );

      return fragColor;
}