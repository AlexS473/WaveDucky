struct PositionalLight
{	globalAmbient:vec4f,
    ambient:vec4f,
	diffuse:vec4f,
	specular:vec4f,
	position:vec3f,
	padding: f32,
}

struct Material
{	ambient:vec4f,
	diffuse:vec4f,
	specular:vec4f,
	shininess:f32,
	padding: vec3f,
	padding2: vec4f,
};


struct VertexOutput{
    @builtin(position) pos : vec4f,
    @location(0) tc: vec2f,
    @location(1) varyingNormal: vec3f,
    @location(2) varyingLightDir: vec3f,
    @location(3) varyingVertPos: vec3f,
}


@group(0) @binding(0) var noiseSampler:sampler;
@group(0) @binding(1) var noiseTexture: texture_3d<f32>;

@group(1) @binding(0) var<uniform> light:PositionalLight;
@group(1) @binding(1) var<uniform> material:Material;

@group(2) @binding(0) var<uniform> m_matrix:mat4x4f;
@group(2) @binding(1) var<uniform> v_matrix:mat4x4f;
@group(2) @binding(2) var<uniform> p_matrix:mat4x4f;
@group(2) @binding(3) var<uniform> norm_matrix:mat4x4f;
@group(2) @binding(4) var<uniform> depthOffset:f32;

@vertex
fn main(
  @location(0) position : vec3f,
  @location(1) texCoord : vec2f,
  @location(2) vertNormal : vec3f,
) -> VertexOutput{
    var output:VertexOutput;
	output.varyingVertPos = (m_matrix * vec4f(position,1.0)).xyz;
	output.varyingLightDir = light.position - output.varyingVertPos;
	output.varyingNormal = (norm_matrix * vec4f(vertNormal,1.0)).xyz;

	output.tc = texCoord;
	output.pos = p_matrix * v_matrix * m_matrix * vec4f(position,1.0);
	return output;
}
