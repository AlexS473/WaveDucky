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

struct FragmentInput{
     @builtin(position) pos : vec4f,
     @location(0) tc: vec2f,
     @location(1) varyingNormal: vec3f,
     @location(2) varyingLightDir: vec3f,
     @location(3) varyingVertPos: vec3f,
}

@group(0) @binding(0) var texSampler:sampler;
@group(0) @binding(1) var noiseTexture: texture_3d<f32>;
@group(0) @binding(2) var reflectTexture: texture_2d<f32>;
@group(0) @binding(3) var refractTexture: texture_2d<f32>;

@group(1) @binding(0) var<uniform> light:PositionalLight;
@group(1) @binding(1) var<uniform> material:Material;

@group(2) @binding(0) var<uniform> m_matrix:mat4x4f;
@group(2) @binding(1) var<uniform> v_matrix:mat4x4f;
@group(2) @binding(2) var<uniform> p_matrix:mat4x4f;
@group(2) @binding(3) var<uniform> norm_matrix:mat4x4f;
@group(2) @binding(4) var<uniform> depthOffset:f32;

fn estimateWaveNormal(
    offset:f32,
    mapScale:f32,
    hScale:f32,
    tc:vec2f) -> vec3f
{
	let h1 = textureSample(noiseTexture, texSampler, vec3f(((tc.x))*mapScale, depthOffset, ((tc.y)+offset)*mapScale)).r * hScale;
	let h2 = textureSample(noiseTexture, texSampler, vec3f(((tc.x)-offset)*mapScale, depthOffset, ((tc.y)-offset)*mapScale)).r * hScale;
	let h3 = textureSample(noiseTexture, texSampler, vec3f(((tc.x)+offset)*mapScale, depthOffset, ((tc.y)-offset)*mapScale)).r * hScale;
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
   input:FragmentInput
)-> @location(0) vec4f
{	let fogColor = vec4f(0.0, 0.0, 0.2, 1.0);
	let fogStart = f32(10.0);
	let fogEnd = f32(300.0);
	let dist = f32(length(input.varyingVertPos.xyz));
	let fogFactor = f32(clamp(((fogEnd-dist) / (fogEnd-fogStart)), 0.0, 1.0));

	let L = vec3f(normalize(input.varyingLightDir));
	let V = vec3f(normalize(-v_matrix[3].xyz - input.varyingVertPos));
	let N = vec3f(estimateWaveNormal(.0002, 32.0, 16.0, input.tc));
	let Nfres = vec3f(normalize(input.varyingNormal));

	let cosTheta = f32(dot(L,N));

	let R = vec3f(normalize(reflect(-L, N)));

	let cosPhi = f32(dot(V,R));

	let cosFres = f32(dot(V,Nfres));

	let ambient = vec3f(((light.globalAmbient * material.ambient) + (light.ambient * material.ambient)).xyz);
	let diffuse = vec3f(light.diffuse.xyz * material.diffuse.xyz * max(cosTheta,0.0));
	let specular = (light.specular.xyz * material.specular.xyz * pow(max(cosPhi,0.0), material.shininess));

	var mixColor = vec4f();
	var reflectColor = vec4f();
	var refractColor = vec4f();
	var color = vec4f();
	let blueColor = vec4f(0.0, 0.25, 1.0, 1.0);

    var fresnel = f32(acos(cosFres));
    fresnel = pow(clamp(fresnel - 0.3, 0.0, 1.0), 3.0);
    refractColor = textureSample(refractTexture, texSampler, (vec2(input.pos.x,input.pos.y))/(2.0*input.pos.w)+0.5);
    reflectColor = textureSample(reflectTexture, texSampler, (vec2(input.pos.x,-input.pos.y))/(2.0*input.pos.w)+0.5);
    reflectColor = vec4((reflectColor.xyz * (ambient + diffuse) + 0.75*specular), 1.0);
    color = mix(refractColor, reflectColor, fresnel);

	 return color;
}



