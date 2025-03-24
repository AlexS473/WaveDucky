import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {
    planeVertexSize,
    planeTexSize,
    planeVertexCount,
    planePositions,
    planeTexCoords,
    planeNormals
} from '../verticies/plane.js';

let response = await fetch("shaders/waterSurface.vert.wgsl");
const surfaceVertWGSL = await response.text();

response = await fetch("shaders/waterSurface.frag.wgsl");
const surfaceFragWGSL = await response.text();

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
    device: device,
    format: presentationFormat,
});

// Light properties
let initialLightLoc = [-10.0, 10.0, -50.0];
initialLightLoc = new Float32Array(initialLightLoc);
let currentLightPos = initialLightLoc;
let lightPos = new Float32Array(3);

// Light components
let globalAmbient = new Float32Array([0.7, 0.7, 0.7, 1.0]);
let lightAmbient = new Float32Array([0.0, 0.0, 0.0, 1.0]);
let lightDiffuse = new Float32Array([1.0, 1.0, 1.0, 1.0]);
let lightSpecular = new Float32Array([1.0, 1.0, 1.0, 1.0]);

// Material properties (Gold-like)
let matAmb = new Float32Array([0.5, 0.6, 0.8, 1.0]);
let matDif = new Float32Array([0.8, 0.9, 1.0, 1.0]);
let matSpe = new Float32Array([1.0, 1.0, 1.0, 1.0]);
let matShi = 250.0;

const globalAmbientBuffer = device.createBuffer({
    size: globalAmbient.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const lightAmbientBuffer = device.createBuffer({
    size: lightAmbient.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const lightDiffuseBuffer = device.createBuffer({
    size: lightDiffuse.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const lightSpecularBuffer = device.createBuffer({
    size: lightSpecular.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const lightPositionBuffer = device.createBuffer({
    size: initialLightLoc.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const matAmbientBuffer = device.createBuffer({
    size: matAmb.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const matDiffuseBuffer = device.createBuffer({
    size: matDif.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const matSpecularBuffer = device.createBuffer({
    size: matSpe.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const matShininessBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Camera properties
let cameraHeight = -2.0;
let cameraPitch = 15.0;

// Screen dimensions
let width = 800;
let height = 800;

// Plane heights
let surfacePlaneHeight = 0.0;

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

const planeNormBuffer = device.createBuffer({
    label: 'plane texture coordinates',
    size: planeNormals.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(planeNormBuffer.getMappedRange()).set(planeTexCoords);
planeNormBuffer.unmap();

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

const normBufferLayout = {
    arrayStride: planeVertexSize,
    attributes: [
        {
            offset: 0,
            shaderLocation: 2,
            format: "float32x3",
        },
    ],
};

let noiseHeight = 256;
let noiseWidth = 256;
let noiseDepth = 256;
// Create a buffer with noise data
const noiseData = new Float32Array(noiseWidth * noiseHeight * noiseDepth);

function noiseIndex(x, y, z) {
    return x * (noiseHeight * noiseDepth) + y * noiseDepth + z;
}


function smooth(zoom, x1, y1, z1) {
    // Get fractional part of x, y, and z
    let fractX = x1 - Math.floor(x1);
    let fractY = y1 - Math.floor(y1);
    let fractZ = z1 - Math.floor(z1);

    // Neighbor values that wrap
    let x2 = x1 - 1;
    if (x2 < 0) x2 = Math.round(noiseWidth / zoom) - 1;
    let y2 = y1 - 1;
    if (y2 < 0) y2 = Math.round(noiseHeight / zoom) - 1;
    let z2 = z1 - 1;
    if (z2 < 0) z2 = Math.round(noiseDepth / zoom) - 1;

    // Convert 3D coordinates to flat array index

    // Smooth the noise by interpolating
    let value = 0.0;
    value += fractX       * fractY       * fractZ       * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z1))];
    value += (1.0 - fractX) * fractY       * fractZ       * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z1))];
    value += fractX       * (1.0 - fractY) * fractZ       * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z1))];
    value += (1.0 - fractX) * (1.0 - fractY) * fractZ       * noiseData[noiseIndex(Math.floor(x2), Math.floor(y2), Math.floor(z1))];

    value += fractX       * fractY       * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z2))];
    value += (1.0 - fractX) * fractY       * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z2))];
    value += fractX       * (1.0 - fractY) * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z2))];
    value += (1.0 - fractX) * (1.0 - fractY) * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x2), Math.floor(y2), Math.floor(z2))];

    return value;
}


function turbulence(x, y, z, maxZoom) {
    let sum = (Math.sin((1.0 / 512.0) * (8 * Math.PI) * (x + z - 4 * y)) + 1) * 8.0;
    let zoom = maxZoom;

    while (zoom >= 0.9) {
        sum += smooth(zoom, x / zoom, y / zoom, z / zoom) * zoom;
        zoom /= 2.0;
    }

    return (128.0 * sum) / maxZoom;
}

function fillDataArray(data, noiseHeight, noiseWidth, noiseDepth) {
    let maxZoom = 32.0;
    let noise = new Float32Array(noiseWidth * noiseHeight * noiseDepth);

    for (let i = 0; i < noiseWidth; i++) {
        for (let j = 0; j < noiseHeight; j++) {
            for (let k = 0; k < noiseDepth; k++) {
                let index = i * (noiseHeight * noiseDepth) + j * noiseDepth + k;
                noise[index] = Math.random();
            }
        }
    }

    for (let i = 0; i < noiseHeight; i++) {
        for (let j = 0; j < noiseWidth; j++) {
            for (let k = 0; k < noiseDepth; k++) {
                let index = i * (noiseWidth * noiseDepth * 4) + j * (noiseDepth * 4) + k * 4;
                let turbulenceValue = turbulence(i, j, k, maxZoom); // Ensure this function is defined
                data[index] = data[index + 1] = data[index + 2] = Math.floor(turbulenceValue);
                data[index + 3] = 255;
            }
        }
    }
}

fillDataArray(noiseData, noiseHeight, noiseWidth, noiseDepth); // Implement this function to fill the noise data

// Create a GPU texture
const noiseTexture = device.createTexture({
    label: 'noise texture',
    size: [noiseWidth, noiseHeight, noiseDepth],
    format: "rgba8unorm",
    usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
});

device.queue.writeTexture(
    { texture: noiseTexture },
    noiseData,
    {
        bytesPerRow: noiseWidth * 4,
        rowPerImage: noiseHeight
    },
    {
        width: noiseWidth,
        height: noiseHeight,
        depthOrArrayLayers:noiseDepth,
    },
);
const noiseSampler = device.createSampler();
const noiseRenderView = noiseTexture.createView();

// Create Reflect Framebuffer (Texture and Depth Buffer)
    const reflectTexture = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    const reflectSampler = device.createSampler();

    const reflectDepthTexture = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const reflectRenderView = reflectTexture.createView();
    const reflectDepthView = reflectDepthTexture.createView();

    // Create Refract Framebuffer (Texture and Depth Buffer)
    const refractTexture = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
const refractSampler = device.createSampler();

    const refractDepthTexture = device.createTexture({
        size: [canvas.width, canvas.height, 1],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const refractRenderView = refractTexture.createView();
    const refractDepthView = refractDepthTexture.createView();


const sampler = device.createSampler();

const surfacePipeline = device.createRenderPipeline({
    label: 'water surface pipeline',
    layout: 'auto',
    vertex: {
        module: device.createShaderModule({
            code: surfaceVertWGSL,
        }),
        buffers: [ planeBufferLayout, texBufferLayout, normBufferLayout ],
    },
    fragment: {
        module: device.createShaderModule({
            code: surfaceFragWGSL,
        }),
        targets: [
            {
                format: 'bgra8unorm'
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

const uniformBindGroup = device.createBindGroup({
    layout: surfacePipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: reflectSampler
        },
        {
            binding: 1,
            resource: reflectRenderView
        },
        {
            binding: 2,
            resource: refractSampler
        },
        {
            binding: 3,
            resource: refractRenderView
        },
        {
            binding: 4,
            resource: noiseSampler
        },
        {
            binding: 5,
            resource: noiseRenderView
        },
        {
            binding: 6,
            resource: {
                buffer: globalAmbientBuffer
            }
        },
        {
            binding: 7,
            resource: {
                buffer: lightAmbientBuffer
            }
        },
        {
            binding: 8,
            resource: {
                buffer: lightDiffuseBuffer
            }
        },
        {
            binding: 9,
            resource: {
                buffer: lightSpecularBuffer
            }
        },
        {
            binding: 10,
            resource: {
                buffer: lightPositionBuffer
            }
        },
        {
            binding: 11,
            resource: {
                buffer: matAmbientBuffer
            }
        },
        {
            binding: 12,
            resource: {
                buffer: matDiffuseBuffer
            }
        },
        {
            binding: 13,
            resource: {
                buffer: matSpecularBuffer
            }
        },
        {
            binding: 14,
            resource: {
                buffer: matShininessBuffer
            }
        },
    ],
});


const refractRenderPassDescriptor = {
    colorAttachments: [{
        view: refractRenderView, // Use reflect or refract renderView based on camera height
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
    }],
    depthStencilAttachment: {
        view: refractDepthView, // Use reflect or refract depthView
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store"
    }
};

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective(60 * (Math.PI / 180), aspect, 0.1, 1000);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
    var viewMatrix = mat4.identity();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, -2, -175),
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
        uniformBuffer, //TODO: Add matries and buffers
        0,
        modelViewProjectionMatrix.buffer,
        modelViewProjectionMatrix.byteOffset,
        modelViewProjectionMatrix.byteLength
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
        refractRenderPassDescriptor
    });

    passEncoder.setPipeline(surfacePipeline);
    passEncoder.setVertexBuffer(0, planeVerticesBuffer);
    passEncoder.setVertexBuffer(1, planeTexBuffer);
    passEncoder.setVertexBuffer(2,planeNormBuffer);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(planeVertexCount);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
