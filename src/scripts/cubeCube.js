import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {
    cubeMapVertexPositions,
    cubeMapVertexSize,
    cubeMapUVOffset,
    cubeMapPositionOffset,
    cubeMapVertexCount,
} from '../verticies/cube.js';

import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount,
} from '../verticies/cube2.js';




let response = await fetch("../shaders/cubeMap.vert.wgsl");
const cubeMapVertWGSL = await response.text();

response = await fetch("../shaders/cubeMap.frag.wgsl");
const cubeMapFragWGSL = await response.text();

response = await fetch("../shaders/cube.vert.wgsl");
const cubeVertWGSL = await response.text();

response = await fetch("../shaders/cube.frag.wgsl");
const cubeFragWGSL = await response.text();


const canvas = document.querySelector('canvas');
const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter?.requestDevice();

const context = canvas.getContext('webgpu');

const devicePixelRatio = window.devicePixelRatio;
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
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

const verticesBuffer = device.createBuffer({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

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
                        offset: cubeMapUVOffset,
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

const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: device.createShaderModule({
            code: cubeVertWGSL,
            entryPoint: "main"
        }),
        buffers: [
            {
                arrayStride: cubeVertexSize,
                attributes: [
                    {
                        // position
                        shaderLocation: 0,
                        offset: cubePositionOffset,
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
            code: cubeFragWGSL,
            entryPoint: "main"
        }),
        targets: [
            {
                format: presentationFormat,
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
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
const cmUniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const cUniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});


const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
});

const cmUniformBindGroup = device.createBindGroup({
    layout: cubeMapPipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: cmUniformBuffer,
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

const cUniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: cUniformBuffer,
            },
        },
    ],
});

const cmRenderPassDescriptor = {
    colorAttachments: [
        {
            view: undefined,
            loadOp: 'clear',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

const cRenderPassDescriptor= {
    colorAttachments: [
        {
            view: undefined, // Assigned later

            clearValue: [0.5, 0.5, 0.5, 1.0],
            loadOp: 'load',
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
        vec3.fromValues(0, 1, 0),
        0,
        tmpMat4
    );
    mat4.multiply(
        tmpMat4,
        modelMatrix,
        modelViewProjectionMatrix
    );
    mat4.multiply(
        projectionMatrix,
        modelViewProjectionMatrix,
        modelViewProjectionMatrix
    );
}

const projectionMatrixC = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 3000);
const modelViewProjectionMatrixC = mat4.create();

function getTransformationMatrixC() {
    const viewMatrixC = mat4.identity();
    mat4.translate(
        viewMatrixC,
        vec3.fromValues(0, 0, -15),
        viewMatrixC
    );
    const now = Date.now() / 1000;
    mat4.rotate(
        viewMatrixC,
        vec3.fromValues(Math.sin(now), Math.cos(now), 0),
        1,
        viewMatrixC
    );

    mat4.multiply(projectionMatrixC, viewMatrixC, modelViewProjectionMatrixC);

    return modelViewProjectionMatrixC;
}

function frame() {
    updateTransformationMatrix();
    device.queue.writeBuffer(
        cmUniformBuffer,
        0,
        modelViewProjectionMatrix.buffer,
        modelViewProjectionMatrix.byteOffset,
        modelViewProjectionMatrix.byteLength
    );

    cmRenderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const commandEncoder = device.createCommandEncoder();

    const cmPassEncoder = commandEncoder.beginRenderPass(cmRenderPassDescriptor);
    cmPassEncoder.setPipeline(cubeMapPipeline);
    cmPassEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    cmPassEncoder.setBindGroup(0, cmUniformBindGroup);
    cmPassEncoder.draw(cubeMapVertexCount);
    cmPassEncoder.end();

    const modelViewProjectionMatrixC = getTransformationMatrixC();
    device.queue.writeBuffer(
        cUniformBuffer,
        0,
        modelViewProjectionMatrixC.buffer,
        modelViewProjectionMatrixC.byteOffset,
        modelViewProjectionMatrixC.byteLength
    );

    cRenderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const cPassEncoder = commandEncoder.beginRenderPass(cRenderPassDescriptor);
    cPassEncoder.setPipeline(pipeline);
    cPassEncoder.setVertexBuffer(0, verticesBuffer);
    cPassEncoder.setBindGroup(0, cUniformBindGroup);
    cPassEncoder.draw(cubeVertexCount);
    cPassEncoder.end();



    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);