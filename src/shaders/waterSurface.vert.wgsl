struct VertexOutput{
@builtin(position) Position : vec4f,
@location(0) varyingNormal:vec3f,
@location(1) varyingLightDir:vec3f,
@location(2) varyingVertPos:vec3f,
@location(3) tc:vec2f,
@location(4) glp:vec4f,
}

@binding(0) @group(0) var<uniform> reflectTex: sampler;
@binding(1) @group(0) var<uniform> refractTex:sampler; //sampler2D
@binding(2) @group(0) var<uniform> noiseTex:sampler; //sampler3D

struct PositionalLight
{	ambient:vec4f,
	diffuse:vec4f,
	specular:vec4f,
	position:vec3f,
}
struct Material
{	ambient:vec4f,
	diffuse:vec4f,
	specular:vec4f,
	shininess:f32,
};

var<uniform> globalAmbient:vec4f;
var<uniform> light:PositionalLight;
var<uniform> material:Material;
var<uniform> m_matrix:mat4x4f;
var<uniform> v_matrix:mat4x4f;
var<uniform> p_matrix:mat4x4f;
var<uniform> norm_matrix:mat4x4f;
var<uniform> isAbove:i32;
var<uniform> depthOffset:f32;

@vertex
fn main(
@location(0) position:vec3f,
@location(1) texCoord:vec2f,
@location(2) vertNormal:vec3f
) -> VertexOutput{
    var output:VertexOutput;
	output.varyingVertPos = (m_matrix * vec4(position,1.0)).xyz;
	output.varyingLightDir = light.position - output.varyingVertPos;
	output.varyingNormal = (norm_matrix * vec4(vertNormal,1.0)).xyz;

	output.tc = texCoord;
	output.glp = p_matrix * v_matrix * m_matrix * vec4(position,1.0);
	output.Position = output.glp;
}
