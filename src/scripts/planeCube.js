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
    planeVertexSize,
    planeTexSize,
    planeVertexCount,
    planePositions,
    planeTexCoords
} from '../verticies/plane.js';

let response = await fetch("../shaders/cubeMap.vert.wgsl");
const cubeMapVertWGSL = await response.text();

response = await fetch("../shaders/cubeMap.frag.wgsl");
const cubeMapFragWGSL = await response.text();

response = await fetch("../shaders/plane.vert.wgsl");
const planeVertWGSL = await response.text();

response = await fetch("../shaders/plane-tex.frag.wgsl");
const planeFragWGSL = await response.text();


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

const kTextureWidth = 14;
const kTextureHeight = 16;
const b = [0,   0,   0, 0];  // red
const w = [  255,   255, 255, 255];  // blue
const textureData = new Uint8Array([
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
    w, b, w, b, w, b, w, b, w, b, w, b, w, b,
    b, w, b, w, b, w, b, w, b, w, b, w, b, w,
].flat());

const texture = device.createTexture({
    label: 'yellow F on red',
    size: [kTextureWidth, kTextureHeight],
    format: 'rgba8unorm',
    usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture(
    { texture },
    textureData,
    { bytesPerRow: kTextureWidth * 4 },
    { width: kTextureWidth, height: kTextureHeight },
);

const planeSampler = device.createSampler(
    {
        mipmapFilter: "linear",
    });

// Create a vertex buffer from the cube data.
const cubeVerticesBuffer = device.createBuffer({
    size: cubeMapVertexPositions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(cubeVerticesBuffer.getMappedRange()).set(cubeMapVertexPositions);
cubeVerticesBuffer.unmap();

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

// Fetch the 6 separate images for negative/positive x, y, z axis of a cubemap
// and upload it into a GPUTexture.
let cubemapTexture;
{
    // The order of the array layers is [+X, -X, +Y, -Y, +Z, -Z]
    /*const imgSrcs = [
        '../images/xp.png',
        '../images/xn.png',
        '../images/yp.png',
        '../images/yn.png',
        '../images/zp.png',
        '../images/zn.png',
    ];*/
    const imgSrcs = [
        '../images/posx.jpg',
        '../images/negx.jpg',
        '../images/posx.jpg',
        '../images/negy.jpg',
        '../images/posz.jpg',
        '../images/negz.jpg',
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

const pUniformBuffer = device.createBuffer({
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

const pUniformBindGroup = device.createBindGroup({
    layout: planePipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: {
                buffer: pUniformBuffer,
                offset: 0,
                size: uniformBufferSize,
            },
        },
        {
            binding: 1,
            resource: planeSampler
        },
        {   binding: 2,
            resource: texture.createView()
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

const pRenderPassDescriptor = {
    colorAttachments: [
        {
            view: undefined, // Assigned later
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

const modelMatrix = mat4.scaling(vec3.fromValues(100, 100, 100));
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
        now * 0.2,
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

const projectionMatrixP = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 3000);
const modelViewProjectionMatrixP = mat4.create();

function getTransformationMatrixP() {
    var viewMatrixP = mat4.identity();
    mat4.translate(
        viewMatrixP,
        vec3.fromValues(0, -35, 10),
        viewMatrixP
    );
    mat4.rotate(
        viewMatrixP,
        vec3.fromValues(1, 0, 0),
        (3 * (Math.PI / 180)),
        viewMatrixP
    );

    mat4.multiply(projectionMatrixP, viewMatrixP, modelViewProjectionMatrixP);

    return modelViewProjectionMatrixP;
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

    const modelViewProjectionMatrixP = getTransformationMatrixP();
    device.queue.writeBuffer(
        pUniformBuffer,
        0,
        modelViewProjectionMatrixP.buffer,
        modelViewProjectionMatrixP.byteOffset,
        modelViewProjectionMatrixP.byteLength
    );

    pRenderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const pPassEncoder = commandEncoder.beginRenderPass(pRenderPassDescriptor);
    pPassEncoder.setPipeline(planePipeline);
    pPassEncoder.setVertexBuffer(0, planeVerticesBuffer);
    pPassEncoder.setVertexBuffer(1, planeTexBuffer);
    pPassEncoder.setBindGroup(0, pUniformBindGroup);
    pPassEncoder.draw(planeVertexCount);
    pPassEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);