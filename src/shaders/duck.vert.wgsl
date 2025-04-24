@group(0) @binding(0) var<uniform> m_matrix:mat4x4<f32>;
@group(0) @binding(1) var<uniform> v_matrix:mat4x4<f32>;
@group(0) @binding(2) var<uniform> p_matrix:mat4x4<f32>;
@group(0) @binding(3) var<uniform> norm_matrix:mat4x4<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) @interpolate(flat) materialId: u32
};

@vertex
fn main(@location(0) inPos: vec3<f32>,
        @location(1) inNormal: vec3<f32>,
        @location(2) materialId: u32,
) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = p_matrix * v_matrix * m_matrix * vec4<f32>(inPos, 1.0);
    out.normal = normalize(norm_matrix * vec4<f32>(inNormal, 0.0)).xyz;
    out.materialId = materialId;
    return out;
}