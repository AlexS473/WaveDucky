import {mat4} from 'https://webgpufundamentals.org/3rdparty/wgpu-matrix.module.js';

async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
    fail('need a browser that supports WebGPU');
    return;
}

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
    alphaMode: 'premultiplied',
});

const skyBoxModule = device.createShaderModule({
code: `
      struct Uniforms {
        viewDirectionProjectionInverse: mat4x4f,
      };

      struct VSOutput {
        @builtin(position) position: vec4f,
        @location(0) pos: vec4f,
      };

      @group(0) @binding(0) var<uniform> uni: Uniforms;
      @group(0) @binding(1) var ourSampler: sampler;
      @group(0) @binding(2) var ourTexture: texture_cube<f32>;

      @vertex fn vs(@builtin(vertex_index) vNdx: u32) -> VSOutput {
        let pos = array(
          vec2f(-1, 3),
          vec2f(-1,-1),
          vec2f( 3,-1),
        );
        var vsOut: VSOutput;
        vsOut.position = vec4f(pos[vNdx], 1, 1);
        vsOut.pos = vsOut.position;
        return vsOut;
      }

      @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
        let t = uni.viewDirectionProjectionInverse * vsOut.pos;
        return textureSample(ourTexture, ourSampler, normalize(t.xyz / t.w) * vec3f(1, 1, -1));
      }
    `,
});

const skyboxPipeline = device.createRenderPipeline({
    label: 'skybox pipeline',
    layout: 'auto',
    vertex: {
        module: skyBoxModule,
    },
    fragment: {
        module: skyBoxModule,
        targets: [{
            format: canvasFormat
        }],
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
    },
});

const numMipLevels = (...sizes) => {
    const maxSize = Math.max(...sizes);
    return 1 + Math.log2(maxSize) | 0;
};

function copySourcesToTexture(device, texture, sources, {flipY} = {}) {
    sources.forEach((source, layer) => {
        device.queue.copyExternalImageToTexture(
        { source, flipY, },
        {
            texture,
            origin: [0, 0, layer]
        },
        {   width: source.width,
            height: source.height
        },
        );
    });
    if (texture.mipLevelCount > 1) {
        generateMips(device, texture);
    }
}

function createTextureFromSources(device, sources, options = {}) {
    const source = sources[0];
    const texture = device.createTexture({
        format: 'rgba8unorm',
        mipLevelCount: options.mips ? numMipLevels(source.width, source.height) : 1,
        size: [source.width, source.height, sources.length],
        usage:  GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
    });
    copySourcesToTexture(device, texture, sources, options);
    return texture;
}

const generateMips = (() => {
    let sampler;
    let module;
    const pipelineByFormat = {};

    return function generateMips(device, texture) {
    if (!module) {
    module = device.createShaderModule({
    label: 'textured quad shaders for mip level generation',
    code: `
                struct VSOutput {
                  @builtin(position) position: vec4f,
                  @location(0) texcoord: vec2f,
                };

                @vertex fn vs(
                  @builtin(vertex_index) vertexIndex : u32
                ) -> VSOutput {
                  let pos = array(

                    vec2f( 0.0,  0.0),  // center
                    vec2f( 1.0,  0.0),  // right, center
                    vec2f( 0.0,  1.0),  // center, top

                    // 2st triangle
                    vec2f( 0.0,  1.0),  // center, top
                    vec2f( 1.0,  0.0),  // right, center
                    vec2f( 1.0,  1.0),  // right, top
                  );

                  var vsOutput: VSOutput;
                  let xy = pos[vertexIndex];
                  vsOutput.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
                  vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
                  return vsOutput;
                }

                @group(0) @binding(0) var ourSampler: sampler;
                @group(0) @binding(1) var ourTexture: texture_2d<f32>;

                @fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
                  return textureSample(ourTexture, ourSampler, fsInput.texcoord);
                }
              `,
});

    sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
});
}

if (!pipelineByFormat[texture.format]) {
    pipelineByFormat[texture.format] = device.createRenderPipeline({
        label: 'mip level generator pipeline',
        layout: 'auto',
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format: texture.format }],
        },
    });
}
    const pipeline = pipelineByFormat[texture.format];

    const encoder = device.createCommandEncoder({
    label: 'mip gen encoder',
});

let width = texture.width;
let height = texture.height;
let baseMipLevel = 0;

while (width > 1 || height > 1) {
    width = Math.max(1, width / 2 | 0);
    height = Math.max(1, height / 2 | 0);

    for (let layer = 0; layer < texture.depthOrArrayLayers; ++layer) {
            const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sampler
                },
                {
                    binding: 1,
                    resource: texture.createView(
                        {   dimension: '2d',
                            baseMipLevel,
                            mipLevelCount: 1,
                            baseArrayLayer: layer,
                            arrayLayerCount: 1,
                    }),
                },
            ],
            });

        const renderPassDescriptor = {
            label: 'our basic canvas renderPass',
            colorAttachments: [
                {
                view: texture.createView({
                    dimension: '2d',
                    baseMipLevel: baseMipLevel + 1,
                    mipLevelCount: 1,
                    baseArrayLayer: layer,
                    arrayLayerCount: 1,
                }),
                loadOp: 'clear',
                storeOp: 'store',
                },
            ],
        };

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
        pass.end();
        }
        ++baseMipLevel;
}

const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
};
})();

async function loadImageBitmap(filename) {
    var img = new Image();
    img.src = filename;
    await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load image: ${filename}`));
    });
    return createImageBitmap(img, { colorSpaceConversion: 'none' });
}

async function createTextureFromImages(device, filenames, options) {
    const images = await Promise.all(filenames.map(loadImageBitmap));
    return createTextureFromSources(device, images, options);
}

const texture = await createTextureFromImages(
    device,
    [
        'images/xp.png',
        'images/xn.png',
        'images/yp.png',
        'images/yn.png',
        'images/zp.png',
        'images/zn.png',
    ],
    {mips: true, flipY: false},
);

const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
});

    // viewDirectionProjectionInverse
const uniformBufferSize = (16) * 4;
const uniformBuffer = device.createBuffer({
    label: 'uniforms',
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uniformValues = new Float32Array(uniformBufferSize / 4);


const kViewDirectionProjectionInverseOffset = 0;

const viewDirectionProjectionInverseValue = uniformValues.subarray(
kViewDirectionProjectionInverseOffset,
kViewDirectionProjectionInverseOffset + 16);

const bindGroup = device.createBindGroup(
    {
        label: 'bind group for skybox',
        layout: skyboxPipeline.getBindGroupLayout(0),
        entries: [
            {   binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {   binding: 1,
                resource: sampler
            },
            {   binding: 2,
                resource: texture.createView({
                    dimension: 'cube'
                })
            },
        ],
    });

const renderPassDescriptor = {
    label: 'our basic canvas renderPass',
    colorAttachments: [{
        loadOp: 'clear',
        storeOp: 'store',
    },
    ],
    depthStencilAttachment: {
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

let depthTexture;

function render(time) {
    time *= 0.0001;

    const canvasTexture = context.getCurrentTexture();
    renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();

    if (!depthTexture ||
    depthTexture.width !== canvasTexture.width ||
    depthTexture.height !== canvasTexture.height) {
    if (depthTexture) {
        depthTexture.destroy();
    }
    depthTexture = device.createTexture({
        size: [canvasTexture.width, canvasTexture.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(skyboxPipeline);

    const aspect = canvas.clientWidth / canvas.clientHeight;
    const projection = mat4.perspective(
        60 * Math.PI / 180,
        aspect,
        0.1,      // zNear
        10,      // zFar
    );

    const cameraPosition = [Math.cos(time * .1), 0, Math.sin(time * .1)];
    const view = mat4.lookAt(
        cameraPosition,
        [0, 0, 0],  // target
        [0, 1, 0],  // up
    );
    
        // We only care about direction so remove the translation
    view[12] = 0;
    view[13] = 0;
    view[14] = 0;

    const viewProjection = mat4.multiply(projection, view);
    mat4.inverse(viewProjection, viewDirectionProjectionInverseValue);

    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);

    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    requestAnimationFrame(render);
}
    requestAnimationFrame(render);

    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
    });
    observer.observe(canvas);
}

function fail(msg) {
    alert(msg);
}

    main();



