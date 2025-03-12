import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {
    cubeMapVertexPositions,
    cubeMapVertexSize,
    cubeUVOffset,
    cubeMapPositionOffset,
    cubeMapVertexCount,
} from '../verticies/cube.js';

let response = await fetch("../shaders/cubeMap.vert.wgsl");
const cubeMapVertWGSL = await response.text();

response = await fetch("../shaders/cubeMap.frag.wgsl");
const cubeMapFragWGSL = await response.text();

const canvas = document.querySelector('canvas');
const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter?.requestDevice();

const context = canvas.getContext('webgpu');

const devicePixelRatio = window.devicePixelRatio;
//canvas.width = canvas.clientWidth * devicePixelRatio;
//canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device,
    format: presentationFormat,
});

// Create a vertex buffer from the cube data.
const cubeVerticesBuffer = device.createBuffer({
    size: cubeMapVertexPositions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(cubeVerticesBuffer.getMappedRange()).set(cubeMapVertexPositions);
cubeVerticesBuffer.unmap();

const cubeMapPipeline = device.createRenderPipeline({
    label: 'Cube Map',
    layout: 'auto',
    vertex: {
        module: device.createShaderModule({
            code: cubeMapVertWGSL,
        }),
        buffers: [
            {
                arrayStride: cubeMapVertexSize,
                attributes: [
                    {
                        // position
                        shaderLocation: 0,
                        offset: cubeMapPositionOffset,
                        format: 'float32x4',
                    },
                    {
                        // uv
                        shaderLocation: 1,
                        offset: cubeUVOffset,
                        format: 'float32x2',
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            code: cubeMapFragWGSL,
        }),
        targets: [
            {
                format: presentationFormat,
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',

        // Since we are seeing from inside of the cube
        // and we are using the regular cube geomtry data with outward-facing normals,
        // the cullMode should be 'front' or 'none'.
        cullMode: 'none',
    },

    // Enable depth testing so that the fragment closest to the camera
    // is rendered in front.
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// Fetch the 6 separate images for negative/positive x, y, z axis of a cubemap
// and upload it into a GPUTexture.
let cubemapTexture;
{
    // The order of the array layers is [+X, -X, +Y, -Y, +Z, -Z]
    const imgSrcs = [
        '../images/xp.png',
        '../images/xn.png',
        '../images/yp.png',
        '../images/yn.png',
        '../images/zp.png',
        '../images/zn.png',
    ];
    const promises = imgSrcs.map(async (src) => {
        const response = await fetch(src);
        return createImageBitmap(await response.blob());
    });
    const imageBitmaps = await Promise.all(promises);

    cubemapTexture = device.createTexture({
        dimension: '2d',
        // Create a 2d array texture.
        // Assume each image has the same size.
        size: [imageBitmaps[0].width, imageBitmaps[0].height, 6],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
    });

    for (let i = 0; i < imageBitmaps.length; i++) {
        const imageBitmap = imageBitmaps[i];
        device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: cubemapTexture, origin: [0, 0, i] },
            [imageBitmap.width, imageBitmap.height]
        );
    }
}

const uniformBufferSize = 4 * 16; // 4x4 matrix
const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
});

const uniformBindGroup = device.createBindGroup({
    layout: cubeMapPipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: uniformBuffer,
                offset: 0,
                size: uniformBufferSize,
            },
        },
        {
            binding: 1,
            resource: sampler,
        },
        {
            binding: 2,
            resource: cubemapTexture.createView({
                dimension: 'cube',
            }),
        },
    ],
});

const renderPassDescriptor = {
    colorAttachments: [
        {
            view: undefined, // Assigned later
            loadOp: 'clear',
            storeOp: 'store',
        },
    ],
    depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

console.log("Pipeline Layout:", cubeMapPipeline.getBindGroupLayout(0));
console.log("Uniform Bind Group:", uniformBindGroup);

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 3000);

const modelMatrix = mat4.scaling(vec3.fromValues(1000, 1000, 1000));
const modelViewProjectionMatrix = mat4.create();
const viewMatrix = mat4.identity();

const tmpMat4 = mat4.create();

// Compute camera movement:
// It rotates around Y axis with a slight pitch movement.
function updateTransformationMatrix() {
    const now = Date.now() / 800;

    mat4.rotate(
        viewMatrix,
        vec3.fromValues(1, 0, 0),
        (Math.PI / 10) * Math.sin(now),
        tmpMat4
    );
    mat4.rotate(
        tmpMat4,
        vec3.fromValues(0, 1, 0),
        now * 0.2,
        tmpMat4
    );

    mat4.multiply(tmpMat4, modelMatrix, modelViewProjectionMatrix);
    mat4.multiply(
        projectionMatrix,
        modelViewProjectionMatrix,
        modelViewProjectionMatrix
    );
}

function frame() {
    updateTransformationMatrix();
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        modelViewProjectionMatrix.buffer,
        modelViewProjectionMatrix.byteOffset,
        modelViewProjectionMatrix.byteLength
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(cubeMapPipeline);
    passEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(cubeMapVertexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);