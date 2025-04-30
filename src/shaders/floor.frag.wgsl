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

@group(0) @binding(0) var noiseSampler:sampler;
@group(0) @binding(1) var noiseTexture: texture_3d<f32>;

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
	let h1 = textureSample(noiseTexture, noiseSampler, vec3f(((tc.x))*mapScale, depthOffset, ((tc.y)+offset)*mapScale)).r * hScale;
	let h2 = textureSample(noiseTexture, noiseSampler, vec3f(((tc.x)-offset)*mapScale, depthOffset, ((tc.y)-offset)*mapScale)).r * hScale;
	let h3 = textureSample(noiseTexture,noiseSampler, vec3f(((tc.x)+offset)*mapScale, depthOffset, ((tc.y)-offset)*mapScale)).r * hScale;
	let v1 = vec3f(0, h1, -1);
	let v2 = vec3f(-1, h2, 1);
	let v3 = vec3f(1, h3, 1);
	let v4 = v2-v1;
	let v5 = v3-v1;
	let normEst = vec3f(normalize(cross(v4,v5)));
	return normEst;
}

fn checkerboard(tc:vec2f) -> vec3f
{
    let estNcb = vec3f(estimateWaveNormal(.02, .5, 0.05, tc));

	let distortStrength = f32(0.1);

	let distorted = vec2f(tc + estNcb.xz * distortStrength);

	let tileScale = f32(16.0);
	let tile = f32(floor(0.5 * (floor(distorted.x * tileScale) + floor(distorted.y * tileScale))) * 2.0 -
                   floor(distorted.x * tileScale) - floor(distorted.y * tileScale));

	return tile * vec3f(1,1,1);
}

fn getCausticValue(
    x:f32,
    y:f32,
    z:f32) ->f32
{
    let w = f32(8);  // frequency of caustic ribbon patterns
	let strength = f32(4.0);
	let PI = f32(3.14159);
	let noise = textureSample(noiseTexture, noiseSampler, vec3(x*w,  y, z*w)).r;
	return pow((1.0-abs(sin(noise*2*PI))), strength);
}

@fragment
fn main(
    input:FragmentInput
)-> @location(0) vec4f
{
    let fogColor = vec4f(0.0, 0.0, 0.2, 1.0);
	let fogStart = f32(10.0);
	let fogEnd = f32(200.0);
	let dist = f32(length(input.varyingVertPos.xyz));
	let fogFactor = f32(clamp(((fogEnd-dist) / (fogEnd-fogStart)), 0.0, 1.0));

	// normalize the light, normal, and view vectors:
	let L = vec3f(normalize(input.varyingLightDir));
	var N = vec3f(normalize(input.varyingNormal));
	let V = vec3f(normalize(-v_matrix[3].xyz - input.varyingVertPos));

    let estNlt = vec3f(estimateWaveNormal(.05, 32.0, 0.5, input.tc));
    let distortStrength = f32(0.05);
    let distort = vec2f(estNlt.xz * distortStrength);
    N = vec3f(normalize(N + vec3f(distort.x, 0.0, distort.y)));

	// get the angle between the light and surface normal:
	let cosTheta = f32(dot(L,N));

	// compute light reflection vector, with respect N:
	let R = vec3f(normalize(reflect(-L, N)));

	// angle between the view vector and reflected light:
	let cosPhi = f32(dot(V,R));

	// compute ADS contributions (per pixel):
	let ambient = ((light.globalAmbient * material.ambient) + (light.ambient * material.ambient)).xyz;
	let diffuse = light.diffuse.xyz * material.diffuse.xyz * max(cosTheta,0.0);
	//let specular = (light.specular.xyz * material.specular.xyz * pow(max(cosPhi,0.0), material.shininess));
	let specular = (light.specular.xyz * material.specular.xyz * pow(max(cosPhi,.15), material.shininess));
	let checkers = checkerboard(input.tc);

     //return vec4f(1,0,0,.5);
     return vec4f((checkers * (ambient + diffuse) + specular), 1.0);

}



