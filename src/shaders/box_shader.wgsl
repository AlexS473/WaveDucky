// Vertex shader

    @group(0) @binding(0)
    var<uniform> modelView: mat4x4<f32>;
    @group(0) @binding(1)
    var<uniform> projection: mat4x4<f32>;

    struct VertexOutput {
        @builtin(position) clip_position: vec4<f32>,
        @location(0) texCoord: vec2<f32>
    };

    @vertex
    fn vs_main(
        @location(0) inPos: vec3<f32>,
        @location(1) inTexCoord: vec2<f32>
    ) -> VertexOutput {
        var out: VertexOutput;
        out.clip_position = projection * modelView * vec4<f32>(inPos, 1.0);
        out.texCoord = inTexCoord;
        return out;
    }

    // Fragment shader
    @group(0) @binding(2)
    var t_diffuse: texture_2d<f32>;
    @group(0) @binding(3)
    var s_diffuse: sampler;

    @fragment
    fn fs_main(in: VertexOutput,  @builtin(front_facing) face: bool) -> @location(0) vec4<f32> {
        return textureSample(t_diffuse, s_diffuse, in.texCoord);
    }