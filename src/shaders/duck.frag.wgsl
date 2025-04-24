struct Material {
    ambient: vec4f,
    diffuse: vec4f,
    specular: vec4f,
    shininess: f32,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) @interpolate(flat) materialId: u32
};

@group(0) @binding(0) var<uniform> m_matrix:mat4x4<f32>;
@group(0) @binding(1) var<uniform> v_matrix:mat4x4<f32>;
@group(0) @binding(2) var<uniform> p_matrix:mat4x4<f32>;
@group(0) @binding(3) var<uniform> norm_matrix:mat4x4<f32>;
@group(1) @binding(0) var<storage, read> materials: array<Material>;

@fragment
fn main(
in: VertexOutput,
@builtin(front_facing) face: bool
) -> @location(0) vec4<f32> {
    if (face) {
        let material = materials[in.materialId];
        var norm:vec3<f32> = normalize(in.normal);

        let lightDir = normalize(vec3f(0.5, 0.8, -0.6));
        let viewDir = normalize(-in.clip_position.xyz);

        let ambient = material.ambient.rgb;

        let diffStrength = max(dot(norm, lightDir), 0.0);
        let diffuse = material.diffuse.rgb * diffStrength;

        let reflectDir = reflect(-lightDir, norm);
        let specStrength = pow(max(dot(viewDir, reflectDir), 0.0), material.shininess);
        let specular = material.specular.rgb * specStrength;

        let finalColor = ambient*.5 + diffuse + specular;
        let finalOut = clamp(finalColor, vec3f(0.0), vec3f(1.0));
        return vec4f(finalOut, 1.0);
    }
    else {
        return vec4f(0.0, 1.0, 0.0 ,1.0);
    }
}
