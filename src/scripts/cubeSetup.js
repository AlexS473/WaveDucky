import { mat4, vec3 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount,
} from '../verticies/cube2.js';

let response = await fetch("../shaders/cube.vert.wgsl");
const cubeVertWGSL = await response.text();

response = await fetch("../shaders/cube.frag.wgsl");
const cubeFragWGSL = await response.text();

const canvas = document.querySelector('canvas');
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const context = canvas.getContext('webgpu');

const devicePixelRatio = window.devicePixelRatio;
//canvas.width = canvas.clientWidth * devicePixelRatio;
//canvas.height = canvas.clientHeight * devicePixelRatio;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device,
    format: presentationFormat,
});

// Create a vertex buffer from the cube data.
const verticesBuffer = device.createBuffer({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

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

const uniformBufferSize = 4 * 16; // 4x4 matrix
const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: uniformBuffer,
            },
        },
    ],
});

const renderPassDescriptor= {
    colorAttachments: [
        {
            view: undefined, // Assigned later

            clearValue: [0.5, 0.5, 0.5, 1.0],
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

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective(60 * (Math.PI / 180), aspect, 0.1, 1000);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
    const viewMatrix = mat4.identity();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, 0, -14),
        viewMatrix
    );
    const now = Date.now() / 1000;
    mat4.rotate(
        viewMatrix,
        vec3.fromValues(Math.sin(now), Math.cos(now), 0),
        1,
        viewMatrix
    );

    mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

    return modelViewProjectionMatrix;
}


function frame() {
    const transformationMatrix = getTransformationMatrix();
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        transformationMatrix.buffer,
        transformationMatrix.byteOffset,
        transformationMatrix.byteLength
    );
    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

