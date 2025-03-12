struct FragmentInput{
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

fn estimateWaveNormal(
    offset:f32,
    mapScale:f32,
    hScale:f32) -> vec3f
{	// estimate the normal using the noise texture
	// by looking up three height values around this vertex
	let h1 = f32(texture(noiseTex, vec3f(((input.tc.s)    )*mapScale, depthOffset, ((input.tc.t)+offset)*mapScale))).r * hScale;
	let h2 = f32(texture(noiseTex, vec3f(((input.tc.s)-offset)*mapScale, depthOffset, ((tc.t)-offset)*mapScale))).r * hScale;
	let h3 = f32(texture(noiseTex, vec3f(((input.tc.s)+offset)*mapScale, depthOffset, ((input.tc.t)-offset)*mapScale))).r * hScale;
	let v1 = vec3f(0, h1, -1);
	let v2 = vec3f(-1, h2, 1);
	let v3 = vec3f(1, h3, 1);
	let v4 = v2-v1;
	let v5 = v3-v1;
	let normEst = vec3f(normalize(cross(v4,v5)));
	return normEst;
}

@fragment
fn main(
    input: VertexOutput
)-> @location(0) vec4f
{	let fogColor = vec4(0.0, 0.0, 0.2, 1.0);
	let fogStart = f32(10.0);
	let fogEnd = f32(300.0);
	let dist = f32(length(input.varyingVertPos.xyz));
	let fogFactor = f32(clamp(((fogEnd-dist) / (fogEnd-fogStart)), 0.0, 1.0));

	// normalize the light, normal, and view vectors:
	let L = vec3f(normalize(varyingLightDir));
	let V = vec3f(normalize(-v_matrix[3].xyz - input.varyingVertPos));
	let N = vec3f(estimateWaveNormal(.0002, 32.0, 16.0));
	let Nfres = vec3f(normalize(varyingNormal)); // for fresnel effect

	// get the angle between the light and surface normal:
	let cosTheta = f32(dot(L,N));

	// compute light reflection vector, with respect N:
	let R = vec3f(normalize(reflect(-L, N)));

	// angle between the view vector and reflected light:
	let cosPhi = f32(dot(V,R));

	// angle between normal vector and view vector (for fresnel effect)
	let cosFres = f32(dot(V,Nfres));

	// compute ADS contributions (per pixel):
	let ambient = vec3f(((globalAmbient * input.material.ambient) + (input.light.ambient * material.ambient)).xyz);
	let diffuse = vec3f(input.light.diffuse.xyz * input.material.diffuse.xyz * max(cosTheta,0.0));
	let specular = (input.light.specular.xyz * input.material.specular.xyz * pow(max(cosPhi,0.0), input.material.shininess));

	let mixColor = vec4f();
	let reflectColor = vec4f();
	let refractColor = vec4f();
	let blueColor = vec4();
	blueColor = vec4(0.0, 0.25, 1.0, 1.0);

	if (isAbove == 1)
	{	let fresnel = f32(acos(cosFres));
		fresnel = pow(clamp(fresnel - 0.3, 0.0, 1.0), 3.0);
		refractColor = texture(refractTex, (vec2(input.glp.x,input.glp.y))/(2.0*input.glp.w)+0.5);
		reflectColor = texture(reflectTex, (vec2(input.glp.x,-input.glp.y))/(2.0*input.glp.w)+0.5);
		reflectColor = vec4((reflectColor.xyz * (ambient + diffuse) + 0.75*specular), 1.0);
		color = mix(refractColor, reflectColor, fresnel);
	}
	else
	{	refractColor = texture(refractTex, (vec2(input.glp.x,input.glp.y))/(2.0*input.glp.w)+0.5);
		mixColor = (0.5 * blueColor) + (0.6 * refractColor);
		color = vec4((mixColor.xyz * (ambient + diffuse) + 0.75*specular), 1.0);
	}

	if (isAbove != 1) {
	color = mix(fogColor, color, pow(fogFactor,5));}
}
