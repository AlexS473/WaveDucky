import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

//----Imports
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
    planeTexCoords,
    planeNormals
} from '../verticies/plane.js';

let response = await fetch("./shaders/cubeMap.vert.wgsl");
const cubeMapVertWGSL = await response.text();

response = await fetch("./shaders/cubeMap.frag.wgsl");
const cubeMapFragWGSL = await response.text();

response = await fetch("./shaders/floor.vert.wgsl");
const floorVertWGSL = await response.text();

response = await fetch("./shaders/floor.frag.wgsl");
const floorFragWGSL = await response.text();

response = await fetch("./shaders/waterSurface.vert.wgsl");
const surfaceVertWGSL = await response.text();

response = await fetch("./shaders/waterSurface.frag.wgsl");
const surfaceFragWGSL = await response.text();

//WebGPU + Canvas Setup
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
    alphaMode: 'premultiplied',
});

//Random Variables

var depthLookup = 0.0;
let lastTime = Date.now() / 800;

//----Shader Buffers

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
new Float32Array(planeNormBuffer.getMappedRange()).set(planeNormals);
planeNormBuffer.unmap();


//Textures
const reflectTexture = device.createTexture({
    label: 'Reflect texture',
    size: [canvas.width, canvas.height, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
});

const reflectDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT
});

const refractTexture = device.createTexture({
    label: 'Refract texture',
    size: [canvas.width, canvas.height, 1],
    format: "rgba8unorm",
    usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
});

const refractDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT
});

//---LET'S MAKE SOME NOISE

let noiseHeight = 256;
let noiseWidth = 256;
let noiseDepth = 256;

const noiseData = new Float32Array(noiseWidth * noiseHeight * noiseDepth);

function noiseIndex(x, y, z) {
    return x * (noiseHeight * noiseDepth) + y * noiseDepth + z;
}

function smooth(zoom, x1, y1, z1) {

    let fractX = x1 - Math.floor(x1);
    let fractY = y1 - Math.floor(y1);
    let fractZ = z1 - Math.floor(z1);

    let x2 = x1 - 1;
    if (x2 < 0) x2 = Math.round(noiseWidth / zoom) - 1;
    let y2 = y1 - 1;
    if (y2 < 0) y2 = Math.round(noiseHeight / zoom) - 1;
    let z2 = z1 - 1;
    if (z2 < 0) z2 = Math.round(noiseDepth / zoom) - 1;

    let value = 0.0;
    value += fractX * fractY * fractZ * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z1))];
    value += (1.0 - fractX) * fractY * fractZ * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z1))];
    value += fractX * (1.0 - fractY) * fractZ * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z1))];
    value += (1.0 - fractX) * (1.0 - fractY) * fractZ * noiseData[noiseIndex(Math.floor(x2), Math.floor(y2), Math.floor(z1))];

    value += fractX * fractY * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z2))];
    value += (1.0 - fractX) * fractY * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z2))];
    value += fractX * (1.0 - fractY) * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z2))];
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

fillDataArray(noiseData, noiseHeight, noiseWidth, noiseDepth);

const noiseTexture = device.createTexture({
    label: 'noise texture',
    size: [noiseWidth, noiseHeight, noiseDepth],
    format: "rgba8unorm",
    usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    dimension: "3d",
});

device.queue.writeTexture(
    { texture: noiseTexture },
    noiseData,
    {
        bytesPerRow: noiseWidth * 4,
        rowsPerImage: noiseHeight
    },
    {
        width: noiseWidth,
        height: noiseHeight,
        depthOrArrayLayers:noiseDepth,
    },
);

//----BindGroupLayouts
const textureBindGroupLayout1 = device.createBindGroupLayout({
    label: 'texture bind group layout 1',
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            sampler: {},
        },
        {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: {
                sampleType: 'float',
                viewDimension: 'cube',
                multisampled: false,
            },
        },
    ],
});

const textureBindGroupLayout2 = device.createBindGroupLayout({
    label: 'texture bind group layout 2',
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            sampler: {},
        },
        {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: {
                sampleType: 'float',
                viewDimension: '3d',
                multisampled: false,
            },
        },
    ],
});

const textureBindGroupLayout3 = device.createBindGroupLayout({
    label: 'texture bind group layout 3',
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            sampler: {},
        },
        {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: {
                sampleType: 'float',
                viewDimension: '3d',
                multisampled: false,
            },
        },
        {
            binding: 2,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: {
                sampleType: 'float',
                viewDimension: '2d',
                multisampled: false,
            },
        },
        {
            binding: 3,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            texture: {
                sampleType: 'float',
                viewDimension: '2d',
                multisampled: false,
            },
        },
    ],
});

const lightMaterialBindGroupLayout = device.createBindGroupLayout({
    label: 'light mat bind group layout',
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
    ],
});

const matrixBindGroupLayout1 = device.createBindGroupLayout({
    label: 'matrix bind group layout 1',
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
        {
            binding: 2,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
        {
            binding: 3,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
        {
            binding: 4,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
        },
    ],
});

//----Pipeline Layouts

const refractPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [textureBindGroupLayout2, lightMaterialBindGroupLayout, matrixBindGroupLayout1],
});

const CubeMapPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [textureBindGroupLayout1, matrixBindGroupLayout1],
});

const surfacePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [textureBindGroupLayout3, lightMaterialBindGroupLayout, matrixBindGroupLayout1],
});

const floorPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [textureBindGroupLayout2, lightMaterialBindGroupLayout, matrixBindGroupLayout1],
});

//----Pipelines----
const reflectionPipeline = device.createRenderPipeline({
    label: 'skybox reflection pipeline',
    layout: CubeMapPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'cube map vert shader',
            code: cubeMapVertWGSL,
        }),
        buffers: [
            {
                arrayStride: cubeMapVertexSize,
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: cubeMapPositionOffset,
                        format: 'float32x4',
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'cube map frag shader',
            code: cubeMapFragWGSL,
        }),
        targets: [
            {
                format: 'rgba8unorm',
                //format: presentationFormat,
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const refractionPipeline = device.createRenderPipeline({
    label: 'floor refraction pipeline',
    layout: refractPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'floor vert shader',
            code: floorVertWGSL,
        }),
        buffers: [
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 0,
                        format: "float32x3",
                    },
                ],
            },
            {
                arrayStride: planeTexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 1,
                        format: "float32x2",
                    },
                ],
            },
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 2,
                        format: "float32x3",
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'floor frag shader',
            code: floorFragWGSL,
        }),
        targets: [
            {
                format: 'rgba8unorm',
                //format: presentationFormat,
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const cubeMapPipeline = device.createRenderPipeline({
    label: 'skybox pipeline',
    layout: CubeMapPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'cube map vert shader',
            code: cubeMapVertWGSL,
        }),
        buffers: [
            {
                arrayStride: cubeMapVertexSize,
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: cubeMapPositionOffset,
                        format: 'float32x4',
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'cube map frag shader',
            code: cubeMapFragWGSL,
        }),
        targets: [
            {
                format: presentationFormat
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const surfacePipeline = device.createRenderPipeline({
    label: 'surface pipeline',
    layout: surfacePipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'surface vert shader',
            code: surfaceVertWGSL,
        }),
        buffers: [
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 0,
                        format: "float32x3",
                    },
                ],
            },
            {
                arrayStride: planeTexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 1,
                        format: "float32x2",
                    },
                ],
            },
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 2,
                        format: "float32x3",
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'surface frag shader',
            code: surfaceFragWGSL,
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
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const floorPipeline = device.createRenderPipeline({
    label: 'floor pipeline',
    layout: refractPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'floor vert shader',
            code: floorVertWGSL,
        }),
        buffers: [
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 0,
                        format: "float32x3",
                    },
                ],
            },
            {
                arrayStride: planeTexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 1,
                        format: "float32x2",
                    },
                ],
            },
            {
                arrayStride: planeVertexSize,
                attributes: [
                    {
                        offset: 0,
                        shaderLocation: 2,
                        format: "float32x3",
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'floor frag shader',
            code: floorFragWGSL,
        }),
        targets: [
            {
                format: presentationFormat,
                blend: {
                    color: {
                        srcFactor: "src-alpha",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add",
                    },
                    alpha: {
                        srcFactor: "one",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add",
                    }
                }
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },
    depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
    },
});

let cubemapTexture;
{
    const imgSrcs = [
        '../images/xp.jpg',
        '../images/xn.jpg',
        '../images/yp.jpg',
        '../images/yn.jpg',
        '../images/zp.jpg',
        '../images/zn.jpg',
    ];
    const promises = imgSrcs.map(async (src) => {
        const response = await fetch(src);
        return createImageBitmap(await response.blob());
    });
    const imageBitmaps = await Promise.all(promises);

    cubemapTexture = device.createTexture({
        dimension: '2d',
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

const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
});



//----Uniforms and Uniform Buffers
const matrixBufferSize = 4 * 16;

function createMatrixBuffer(){
    return device.createBuffer({
        size: matrixBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

const projectionMatBuffer = createMatrixBuffer();

const reflectModelMatBuffer = createMatrixBuffer();

const refractModelMatBuffer = createMatrixBuffer();

const cmModelMatBuffer = createMatrixBuffer();

const surfaceModelMatBuffer = createMatrixBuffer();

const floorModelMatBuffer = createMatrixBuffer();

const reflectViewMatBuffer = createMatrixBuffer();

const refractViewMatBuffer = createMatrixBuffer();

const cmViewMatBuffer = createMatrixBuffer();

const surfaceViewMatBuffer = createMatrixBuffer();

const floorViewMatBuffer = createMatrixBuffer();

const reflectNormMatBuffer = createMatrixBuffer();

const refractNormMatBuffer = createMatrixBuffer();

const cmNormMatBuffer = createMatrixBuffer();

const surfaceNormMatBuffer = createMatrixBuffer();

const floorNormMatBuffer = createMatrixBuffer();

const depthBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Light properties
let initialLightLoc = [-10.0, 10.0, -50.0];
initialLightLoc = new Float32Array(initialLightLoc);
let currentLightPos = initialLightLoc;
let lightPos = new Float32Array(4);

// Light components

let globalAmbient = new Float32Array([0.7, 0.7, 0.7, 1.0]);
let lightAmbient = new Float32Array([0.0, 0.0, 0.0, 1.0]);
let lightDiffuse = new Float32Array([1.0, 1.0, 1.0, 1.0]);
let lightSpecular = new Float32Array([1.0, 1.0, 1.0, 1.0]);

const lightUniformBufferSize =
    4 * 4 + //Global Ambient is 4 32bit floats (4bytes each)
    4 * 4 + // ambient is 4 32bit floats (4bytes each)
    4 * 4 + // diffuse is 4 32bit floats (4bytes each)
    4 * 4 + // specular is 4 32bit floats (4bytes each)
    4 * 4; // position is 3 32bit floats (4bytes each) plus a byte for padding.

const lightUniformBuffer = device.createBuffer({
    label: 'Uniforms for Positional light',
    size: lightUniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const lightUniformValues = new Float32Array(lightUniformBufferSize / 4);

const kGAmbientOffset = 0;
const kAmbientOffset = 4;
const kDiffuseOffset = 8;
const kSpecularOffset = 12;
const kPositionOffset = 16;

lightUniformValues.set(globalAmbient, kGAmbientOffset);
lightUniformValues.set(lightAmbient, kAmbientOffset);
lightUniformValues.set(lightDiffuse, kDiffuseOffset);
lightUniformValues.set(lightSpecular, kSpecularOffset);
lightUniformValues.set(initialLightLoc, kPositionOffset);

device.queue.writeBuffer(
    lightUniformBuffer,
    0,
    lightUniformValues
);

// Material properties (Gold-like)
let matAmbient = new Float32Array([0.5, 0.6, 0.8, 1.0]);
let matDiffuse = new Float32Array([0.8, 0.9, 1.0, 1.0]);
let matSpecular = new Float32Array([1.0, 1.0, 1.0, 1.0]);
let matShininess = 250.0;

const matUniformBufferSize =
    4 * 4 + // ambient is 4 32bit floats (4bytes each)
    4 * 4 + // diffuse is 4 32bit floats (4bytes each)
    4 * 4 + // specular is 4 32bit floats (4bytes each)
    4 * 4 + //shininess is 1 32bit float (4bytes) plus 3 bytes for padding
    4 * 4 +
    4 * 4;  // 4 bytes for padding

const matUniformBuffer = device.createBuffer({
    label: 'Uniforms for Material',
    size: matUniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const matUniformValues = new Float32Array(matUniformBufferSize / 4);

const kShininessOffset = 12;

matUniformValues.set(matAmbient, kAmbientOffset);
matUniformValues.set(matDiffuse, kDiffuseOffset);
matUniformValues.set(matSpecular, kSpecularOffset);
matUniformValues.set(matShininess, kShininessOffset);

device.queue.writeBuffer(
    matUniformBuffer,
    0,
    matUniformValues
);

const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
});

//Uniform Bind Groups
const cubeMapTextureBindGroup = device.createBindGroup({
    label: 'cube map texture bind group',
    layout: textureBindGroupLayout1,
    entries: [
        {
            binding: 0,
            resource: sampler,
        },
        {
            binding: 1,
            resource: cubemapTexture.createView({
                dimension: 'cube',
            }),
        },
    ],
});

const noiseTextureBindGroup = device.createBindGroup({
    label: 'noise texture bind group',
    layout: textureBindGroupLayout2,
    entries: [
        {
            binding: 0,
            resource: sampler,
        },
        {
            binding: 1,
            resource: noiseTexture.createView({
                dimension: '3d',
            }),
        },
    ],
});

const LiMatBindGroup = device.createBindGroup({
    label: 'light and material bind group',
    layout: lightMaterialBindGroupLayout,
    entries: [
        {
            binding: 0,
            resource: {
                buffer: lightUniformBuffer,
                offset: 0,
                size: lightUniformBufferSize,
            }
        },
        {
            binding: 1,
            resource: {
                buffer: matUniformBuffer,
                offset: 0,
                size: matUniformBufferSize,
            }
        },
    ],
});

function createMatrixBindGroup(label, modelMatBuffer, viewMatBuffer, normMatBuffer) {
    return device.createBindGroup({
        label: label,
        layout: matrixBindGroupLayout1,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: modelMatBuffer,
                    offset: 0,
                    size: matrixBufferSize,
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: viewMatBuffer,
                    offset: 0,
                    size: matrixBufferSize,
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: projectionMatBuffer,
                    offset: 0,
                    size: matrixBufferSize,
                }
            },
            {
                binding: 3,
                resource: {
                    buffer: normMatBuffer,
                    offset: 0,
                    size: matrixBufferSize,
                }
            },
            {
                binding: 4,
                resource: {
                    buffer: depthBuffer,
                    offset: 0,
                    size: 4,
                }
            },
        ],
    });
}

const reflectMatrixBindGroup = createMatrixBindGroup('reflection matrix bind group', reflectModelMatBuffer,reflectViewMatBuffer, reflectNormMatBuffer);

const refractMatrixBindGroup = createMatrixBindGroup('refraction matrix bind group', refractModelMatBuffer,refractViewMatBuffer, refractNormMatBuffer);

const cmMatrixBindGroup = createMatrixBindGroup('sky box matrix bind group', cmModelMatBuffer,cmViewMatBuffer, cmNormMatBuffer);

const surfaceMatrixBindGroup = createMatrixBindGroup('surface matrix bind group', surfaceModelMatBuffer,surfaceViewMatBuffer, surfaceNormMatBuffer);

const floorMatrixBindGroup = createMatrixBindGroup('floor matrix bind group', floorModelMatBuffer,floorViewMatBuffer, floorNormMatBuffer);

const surfaceTextureBindGroup = device.createBindGroup({
    label: 'surface texture bind group',
    layout: textureBindGroupLayout3,
    entries: [
        {
            binding: 0,
            resource: sampler,
        },
        {
            binding: 1,
            resource: noiseTexture.createView({
                dimension: '3d',
            }),
        },
        {
            binding: 2,
            resource: reflectTexture.createView({
                dimension: '2d',
            }),
        },
        {
            binding: 3,
            resource: refractTexture.createView({
                dimension: '2d',
            }),
        },
    ],
});

//---- Render Pass Descriptors

const reflectRenderPassDescriptor = {
    colorAttachments: [
        {
            view: reflectTexture.createView(),
            //view: undefined,
            loadOp: 'clear',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: reflectDepthTexture.createView(),
        //view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

const refractRenderPassDescriptor = {
    colorAttachments: [
        {
            view: refractTexture.createView(),
            //view: undefined,
            loadOp: 'clear',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: refractDepthTexture.createView(),
        //view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

const renderPassDescriptor = {
    colorAttachments: [
        {
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'load',
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

//-----MATRIX OPERATIONS------
const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 3000);

device.queue.writeBuffer(
    projectionMatBuffer,
    0,
    projectionMatrix,
);

//Reflection Matrix Setup
function getReflectionMatrices() {
    var modelMatrix = mat4.scaling(vec3.fromValues(100, 100, 100));
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();

    mat4.rotate(
        viewMatrix,
        vec3.fromValues(1, 0, 0),
        -15,
        viewMatrix,
    );

    return {
        modelMatrixRf: modelMatrix,
        viewMatrixRf: viewMatrix,
        normMatrixRf: normMatrix,
    }
}

function getRefractionMatrices() {
    var modelMatrix = mat4.identity();
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, -10, 0),
        viewMatrix
    );
    mat4.invert(modelMatrix, normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixRf: modelMatrix,
        viewMatrixRf: viewMatrix,
        normMatrixRf: normMatrix,
    }
}

function updateDepthLookup() {
    const now = Date.now() / 800;
    const elapsedTime = now - lastTime;
    lastTime = now;

    return depthLookup += elapsedTime * .0001;
}

function getCubeMapMatrices() {
    var modelMatrix = mat4.scaling(vec3.fromValues(100, 100, 100));
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();

    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, 0, 0),
        viewMatrix
    );

    return {
        modelMatrixCm: modelMatrix,
        viewMatrixCm: viewMatrix,
        normMatrixCm: normMatrix,
    }
}

function getSurfaceMatrices() {
    var modelMatrix = mat4.identity();
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, 0, 0),
        viewMatrix
    );
    mat4.invert(modelMatrix, normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixS: modelMatrix,
        viewMatrixS: viewMatrix,
        normMatrixS: normMatrix,
    }
}

function getFloorMatrices() {
    var modelMatrix = mat4.identity();
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();
    mat4.translate(
        viewMatrix,
        vec3.fromValues(0, -10, 0),
        viewMatrix
    );
    mat4.invert(modelMatrix, normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixF: modelMatrix,
        viewMatrixF: viewMatrix,
        normMatrixF: normMatrix,
    }
}

//Render Pass Functions
function reflectRenderPass(commandEncoder){
    const {modelMatrixRf, viewMatrixRf, normMatrixRf} = getReflectionMatrices();

    device.queue.writeBuffer(
        reflectViewMatBuffer,
        0,
        viewMatrixRf,
    );
    device.queue.writeBuffer(
        reflectModelMatBuffer,
        0,
        modelMatrixRf,
    );
    device.queue.writeBuffer(
        reflectNormMatBuffer,
        0,
        normMatrixRf,
    );
    /*
    //For Testing
    reflectRenderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
     */

    const rPassEncoder = commandEncoder.beginRenderPass(reflectRenderPassDescriptor);
    rPassEncoder.setPipeline(reflectionPipeline);
    rPassEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    rPassEncoder.setBindGroup(0, cubeMapTextureBindGroup);
    rPassEncoder.setBindGroup(1, reflectMatrixBindGroup);
    rPassEncoder.draw(cubeMapVertexCount);
    rPassEncoder.end();
}

function refractRenderPass(commandEncoder){

    depthLookup = updateDepthLookup();
    device.queue.writeBuffer(
        depthBuffer,
        0,
        new Float32Array([depthLookup]),
    );

    const {modelMatrixRf, viewMatrixRf, normMatrixRf} = getRefractionMatrices();

    device.queue.writeBuffer(
        refractViewMatBuffer,
        0,
        viewMatrixRf,
    );
    device.queue.writeBuffer(
        refractModelMatBuffer,
        0,
        modelMatrixRf,
    );
    device.queue.writeBuffer(
        refractNormMatBuffer,
        0,
        normMatrixRf,
    );

    /*refractRenderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();*/
    const rPassEncoder = commandEncoder.beginRenderPass(refractRenderPassDescriptor);
    rPassEncoder.setPipeline(refractionPipeline);
    rPassEncoder.setVertexBuffer(0, planeVerticesBuffer);
    rPassEncoder.setVertexBuffer(1, planeTexBuffer);
    rPassEncoder.setVertexBuffer(2, planeNormBuffer);
    rPassEncoder.setBindGroup(0, noiseTextureBindGroup);
    rPassEncoder.setBindGroup(1, LiMatBindGroup);
    rPassEncoder.setBindGroup(2, refractMatrixBindGroup);
    rPassEncoder.draw(planeVertexCount);
    rPassEncoder.end();
}

function cmRenderPass(commandEncoder){
    //console.log("Rendering Cubemap...");
    const {modelMatrixCm, viewMatrixCm, normMatrixCm} = getCubeMapMatrices();

    //console.log("model:",modelMatrixCm);
    //console.log("viewMatrixF:",viewMatrixCm);
    //console.log("normMatrix:", normMatrixCm);
    device.queue.writeBuffer(
        cmViewMatBuffer,
        0,
        viewMatrixCm,
    );
    device.queue.writeBuffer(
        cmModelMatBuffer,
        0,
        modelMatrixCm,
    );
    device.queue.writeBuffer(
        cmNormMatBuffer,
        0,
        normMatrixCm,
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const cmPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    cmPassEncoder.setPipeline(cubeMapPipeline);
    cmPassEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    cmPassEncoder.setBindGroup(0, cubeMapTextureBindGroup);
    cmPassEncoder.setBindGroup(1, cmMatrixBindGroup);
    cmPassEncoder.draw(cubeMapVertexCount);
    cmPassEncoder.end();
}

function surfaceRenderPass(commandEncoder){

    depthLookup = updateDepthLookup();
    device.queue.writeBuffer(
        depthBuffer,
        0,
        new Float32Array([depthLookup]),
    );

    const {modelMatrixS, viewMatrixS, normMatrixS} = getSurfaceMatrices();

    device.queue.writeBuffer(
        surfaceViewMatBuffer,
        0,
        viewMatrixS,
    );
    device.queue.writeBuffer(
        surfaceModelMatBuffer,
        0,
        modelMatrixS,
    );
    device.queue.writeBuffer(
        surfaceNormMatBuffer,
        0,
        normMatrixS,
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
    const sPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    sPassEncoder.setPipeline(surfacePipeline);
    sPassEncoder.setVertexBuffer(0, planeVerticesBuffer);
    sPassEncoder.setVertexBuffer(1, planeTexBuffer);
    sPassEncoder.setVertexBuffer(2, planeNormBuffer);
    sPassEncoder.setBindGroup(0, surfaceTextureBindGroup);
    sPassEncoder.setBindGroup(1, LiMatBindGroup);
    sPassEncoder.setBindGroup(2, surfaceMatrixBindGroup);
    sPassEncoder.draw(planeVertexCount);
    sPassEncoder.end();
}

function floorRenderPass(commandEncoder){
    //console.log("Rendering Floor...");
    const {modelMatrixF, viewMatrixF, normMatrixF} = getFloorMatrices();

    //console.log("model:",modelMatrixF);
    //console.log("viewMatrixF:",viewMatrixF);
    //console.log("normMatrixF:",normMatrixF);
    device.queue.writeBuffer(
        floorViewMatBuffer,
        0,
        viewMatrixF,
    );
    device.queue.writeBuffer(
        floorModelMatBuffer,
        0,
        modelMatrixF,
    );
    device.queue.writeBuffer(
        floorNormMatBuffer,
        0,
        normMatrixF,
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const pPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    pPassEncoder.setPipeline(floorPipeline);
    pPassEncoder.setVertexBuffer(0, planeVerticesBuffer);
    pPassEncoder.setVertexBuffer(1, planeTexBuffer);
    pPassEncoder.setVertexBuffer(2, planeNormBuffer);
    pPassEncoder.setBindGroup(0, noiseTextureBindGroup);
    pPassEncoder.setBindGroup(1, LiMatBindGroup);
    pPassEncoder.setBindGroup(2, floorMatrixBindGroup);
    pPassEncoder.draw(planeVertexCount);
    pPassEncoder.end();
}

function frame() {
    const commandEncoder = device.createCommandEncoder();

    reflectRenderPass(commandEncoder);
    refractRenderPass(commandEncoder);
    cmRenderPass(commandEncoder);
    surfaceRenderPass(commandEncoder);
    floorRenderPass(commandEncoder);

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);