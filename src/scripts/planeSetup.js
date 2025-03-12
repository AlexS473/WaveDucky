import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {
    planeVertexSize,
    planeTexSize,
    planeVertexCount,
    planePositions,
    planeTexCoords
} from '../verticies/plane.js';

let response = await fetch("../shaders/plane.vert.wgsl");
const planeVertWGSL = await response.text();

response = await fetch("../shaders/plane.frag.wgsl");
const planeFragWGSL = await response.text();

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
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device: device,
    format: presentationFormat,
});

console.log("Plane Positions:", planePositions);
console.log("Plane Texture Coordinates:", planeTexCoords);
console.log("Plane Vertex Count:", planeVertexCount);

// Create a vertex buffer from the cube data.
const planeVerticesBuffer = device.createBuffer({
    label: 'plane vertices',
    size: planePositions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(planeVerticesBuffer.getMappedRange()).set(planePositions);
planeVerticesBuffer.unmap();

// Create a vertex buffer from the cube data.
const planeTexBuffer = device.createBuffer({
    label: 'plane texture coordinates',
    size: planeTexCoords.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(planeTexBuffer.getMappedRange()).set(planeTexCoords);
planeTexBuffer.unmap();

const planeBufferLayout = {
    arrayStride: planeVertexSize,
    attributes: [
        {
            offset: 0,
            shaderLocation: 0,
            format: "float32x3",
        },
    ],
};

const texBufferLayout = {
    arrayStride: planeTexSize,
    attributes: [
        {
            offset: 0,
            shaderLocation: 1,
            format: "float32x2",
        },
    ],
};

const planePipeline = device.createRenderPipeline({
    label: 'plane pipeline',
    layout: 'auto',
    vertex: {
        module: device.createShaderModule({
            code: planeVertWGSL,
        }),
        buffers: [ planeBufferLayout, texBufferLayout],
    },
    fragment: {
        module: device.createShaderModule({
            code: planeFragWGSL,
        }),
        targets: [
            {
                format: presentationFormat,
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },

    // Enable depth testing so that the fragment closest to the camera
    // is rendered in front.
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
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
    layout: planePipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: uniformBuffer,
                offset: 0,
                size: uniformBufferSize,
            },
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

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective(60 * (Math.PI / 180), aspect, 0.1, 1000);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
    var viewMatrix = mat4.identity();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, -2, -100),
        viewMatrix
    );
    mat4.rotate(
        viewMatrix,
        vec3.fromValues(1, 0, 0),
        (15 * (Math.PI / 180)),
        viewMatrix
    );

    mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

    return modelViewProjectionMatrix;
}

function frame() {
    const modelViewProjectionMatrix = getTransformationMatrix();
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
    //renderPassDescriptor.colorAttachments[0].clearValue = { r: 0.2, g: 0.2, b: 0.2, a: 1.0 };

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(planePipeline);
    passEncoder.setVertexBuffer(0, planeVerticesBuffer);
    passEncoder.setVertexBuffer(1, planeTexBuffer);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(planeVertexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
