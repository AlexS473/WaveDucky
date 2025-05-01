import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

import {MatrixStack} from "./MatrixStack.js";

import {
    skyBoxVertexPositions,
    skyBoxVertexSize,
    skyBoxPositionOffset,
    skyBoxVertexCount,
} from '../verticies/cube.js';

import {
    planeVertexSize,
    planeTexSize,
    planeVertexCount,
    planePositions,
    planeTexCoords,
    planeNormals
} from '../verticies/plane.js';

let response = await fetch("./shaders/skyBox.vert.wgsl");
const skyBoxVertWGSL = await response.text();

response = await fetch("./shaders/skyBox.frag.wgsl");
const skyBoxFragWGSL = await response.text();

response = await fetch("./shaders/floor.vert.wgsl");
const floorVertWGSL = await response.text();

response = await fetch("./shaders/floor.frag.wgsl");
const floorFragWGSL = await response.text();

response = await fetch("./shaders/waterSurface.vert.wgsl");
const surfaceVertWGSL = await response.text();

response = await fetch("./shaders/waterSurface.frag.wgsl");
const surfaceFragWGSL = await response.text();

response = await fetch("./shaders/duck.vert.wgsl");
const duckVertWGSL = await response.text();

response = await fetch("./shaders/duck.frag.wgsl");
const duckFragWGSL = await response.text();


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

//----Vertex Buffers

const cubeVerticesBuffer = device.createBuffer({
    size: skyBoxVertexPositions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
new Float32Array(cubeVerticesBuffer.getMappedRange()).set(skyBoxVertexPositions);
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

let {
    positionBuffer,
    normalBuffer,
    indexBuffer,
    indexSize,
    materials,
    matIdBuffer
} = await loadObj2(device, '../objects/ducky.obj');


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

let duckDepthTexture;

let noiseHeight = 256;
let noiseWidth = 256;
let noiseDepth = 256;

const noiseData = new Float32Array(noiseWidth * noiseHeight * noiseDepth);
fillDataArray(noiseData, noiseHeight, noiseWidth, noiseDepth);
for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.pow(noiseData[i] / 255.0, 2.2);
}

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

const { textureBindGroupLayout1,
        textureBindGroupLayout2,
        textureBindGroupLayout3,
        lightMaterialBindGroupLayout,
        matrixBindGroupLayout,
        materialBindGroupLayout
} = createBindLayouts(device);

const {
    floorPipelineLayout,
    skyBoxPipelineLayout,
    surfacePipelineLayout,
    duckPipelineLayout
} = createPipelineLayouts(device);

//----Pipelines----
const reflectionPipeline = device.createRenderPipeline({
    label: 'skybox reflection pipeline',
    layout: skyBoxPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'sky box vert shader',
            code: skyBoxVertWGSL,
        }),
        buffers: [
            {
                arrayStride: skyBoxVertexSize,
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: skyBoxPositionOffset,
                        format: 'float32x4',
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'sky box frag shader',
            code: skyBoxFragWGSL,
        }),
        targets: [
            {
                format: 'rgba8unorm',
            },
        ],
    },
    primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
    },
    depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const refractionPipeline = device.createRenderPipeline({
    label: 'floor refraction pipeline',
    layout: floorPipelineLayout,
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

const skyBoxPipeline = device.createRenderPipeline({
    label: 'skybox pipeline',
    layout: skyBoxPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            label: 'cube map vert shader',
            code: skyBoxVertWGSL,
        }),
        buffers: [
            {
                arrayStride: skyBoxVertexSize,
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: skyBoxPositionOffset,
                        format: 'float32x4',
                    },
                ],
            },
        ],
    },
    fragment: {
        module: device.createShaderModule({
            label: 'cube map frag shader',
            code: skyBoxFragWGSL,
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
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
    },
});

const floorPipeline = device.createRenderPipeline({
    label: 'floor pipeline',
    layout: floorPipelineLayout,
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

const duckPipeline = device.createRenderPipeline({
    label: 'duck pipeline',
    layout: duckPipelineLayout,
    vertex: {
        module: device.createShaderModule({
            code: duckVertWGSL,
        }),
        buffers: [
            {
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x3'
                    }
                ],
                arrayStride: 4 * 3,
                stepMode: 'vertex'
            },
            {
                attributes: [
                    {
                        shaderLocation: 1,
                        offset: 0,
                        format: 'float32x3'
                    }
                ],
                arrayStride: 4 * 3,
                stepMode: 'vertex'
            },
            {
                attributes: [
                    {
                        shaderLocation: 2,
                        offset: 0,
                        format: 'uint32'
                    }
                ],
                arrayStride: 4,
                stepMode: 'vertex'
            }
        ]
    },
    fragment: {
        module: device.createShaderModule({
            code: duckFragWGSL,
        }),
        targets: [
            {
                format: 'bgra8unorm',
            }
        ]
    },
    primitive: {
        topology: 'triangle-list',
        frontFace: 'ccw',
        cullMode: 'none'
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
    }
});

let skyBoxTexture;
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

    skyBoxTexture = device.createTexture({
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
            { texture: skyBoxTexture, origin: [0, 0, i] },
            [imageBitmap.width, imageBitmap.height]
        );
    }
}

let depthTexture;

//----Uniforms and Uniform Buffers
const matrixBufferSize = 80;//4 * 16;

function createMatrixBuffer(){
    return device.createBuffer({
        size: matrixBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

const projectionMatBuffer = createMatrixBuffer();
const viewMatrixBuffer = createMatrixBuffer();

//Model Matrices
const reflectModelMatBuffer = createMatrixBuffer();
const refractModelMatBuffer = createMatrixBuffer();
const skyBoxModelMatBuffer = createMatrixBuffer();
const surfaceModelMatBuffer = createMatrixBuffer();
const floorModelMatBuffer = createMatrixBuffer();
const duckModelMatBuffer = createMatrixBuffer();

//Normal Matrices
const reflectNormMatBuffer = createMatrixBuffer();
const refractNormMatBuffer = createMatrixBuffer();
const skyBoxNormMatBuffer = createMatrixBuffer();
const surfaceNormMatBuffer = createMatrixBuffer();
const floorNormMatBuffer = createMatrixBuffer();
const duckNormMatBuffer = createMatrixBuffer();

const depthBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const materialBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const matArray = Object.values(materials);
const materialUniformValues = new Float32Array(16 * matArray.length);

function padded(arr) {
    return [...arr.map(parseFloat), 1.0];
}

matArray.forEach((mat, mIndex) => {
    const base = mIndex * 16;

    const ambient  = padded(mat.Ka || [0, 0, 0]);
    const diffuse  = padded(mat.Kd || [0, 0, 0]);
    const specular = padded(mat.Ks || [0, 0, 0]);
    const shininess = parseFloat(mat.Ns ?? 1);

    materialUniformValues.set(ambient, base);
    materialUniformValues.set(diffuse, base + 4);
    materialUniformValues.set(specular, base + 8);
    materialUniformValues[base + 12] = shininess;
});

device.queue.writeBuffer(
    materialBuffer,
    0,
    materialUniformValues
);

// Light properties
let initialLightLoc = [-10.0, 10.0, -50.0];
initialLightLoc = new Float32Array(initialLightLoc);

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
    4 * 4 + // shininess is 1 32bit float (4bytes) plus 3 bytes for padding
    4 * 4 + // 16 bytes for padding
    4 * 4;  // 16 bytes for padding

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
const skyBoxTextureBindGroup = device.createBindGroup({
    label: 'cube map texture bind group',
    layout: textureBindGroupLayout1,
    entries: [
        {
            binding: 0,
            resource: sampler,
        },
        {
            binding: 1,
            resource: skyBoxTexture.createView({
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
            }
        },
        {
            binding: 1,
            resource: {
                buffer: matUniformBuffer,
            }
        },
    ],
});

function createMatrixBindGroup(label, modelMatBuffer, normMatBuffer) {
    return device.createBindGroup({
        label: label,
        layout: matrixBindGroupLayout,
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
                    buffer: viewMatrixBuffer,
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

const reflectMatrixBindGroup = createMatrixBindGroup(
    'reflection matrix bind group',
    reflectModelMatBuffer,
    reflectNormMatBuffer
);

const refractMatrixBindGroup = createMatrixBindGroup(
    'refraction matrix bind group',
    refractModelMatBuffer,
    refractNormMatBuffer
);

const skyBoxMatrixBindGroup = createMatrixBindGroup(
    'sky box matrix bind group',
    skyBoxModelMatBuffer,
    skyBoxNormMatBuffer
);

const surfaceMatrixBindGroup = createMatrixBindGroup(
    'surface matrix bind group',
    surfaceModelMatBuffer,
    surfaceNormMatBuffer
);

const floorMatrixBindGroup = createMatrixBindGroup(
    'floor matrix bind group',
    floorModelMatBuffer,
    floorNormMatBuffer
);

const duckMatrixBindGroup = createMatrixBindGroup(
    'duck matrix bind group',
    duckModelMatBuffer,
    duckNormMatBuffer
);

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

let materialBindGroup = device.createBindGroup({
    layout: materialBindGroupLayout,
    entries: [
        {
            binding: 0,
            resource: {
                buffer: materialBuffer,
            }
        },
    ]
});

//---- Render Pass Descriptors
const reflectRenderPassDescriptor = {
    colorAttachments: [
        {
            view: reflectTexture.createView(),
            loadOp: 'load',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: reflectDepthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

const refractRenderPassDescriptor = {
    colorAttachments: [
        {
            view: refractTexture.createView(),
            loadOp: 'load',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: refractDepthTexture.createView(),
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
        view: undefined,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
    },
};

const duckRenderPassDescriptor= {
    colorAttachments: [
        {
            view: undefined,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'load',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: undefined,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        stencilClearValue: 0,
    },
};

//-----MATRIX OPERATIONS------
const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective(Math.PI/3, aspect, 1, 1000);

var viewMatrix = mat4.identity();
var degree =0;

mat4.lookAt(
    vec3.fromValues(0, 70, -15),
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(0, 0, 1),
    viewMatrix
);

const stack = new MatrixStack();

device.queue.writeBuffer(
    projectionMatBuffer,
    0,
    projectionMatrix,
);

function updateDepthLookup() {
    const now = Date.now() / 800;
    const elapsedTime = now - lastTime;
    lastTime = now;
    return depthLookup += elapsedTime * .001;
}

//Reflection Matrix Setup
function getReflectionMatrices(stack) {
    var normMatrix = mat4.create();

    stack.scale(vec3.fromValues(130, 1, 130));

    return {
        modelMatrixRf: stack.get(),
        normMatrixRf: normMatrix,
    }
}

function getRefractionMatrices(stack) {
    var normMatrix = mat4.create();

    stack.rotateX(-1.340000000000001);
    mat4.invert(stack.get(), normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixRf: stack.get(),
        normMatrixRf: normMatrix,
    }
}

function getSkyBoxMatrices(stack) {
    var normMatrix = mat4.create();

    stack.rotateX(Math.PI / 3);
    stack.scale(vec3.fromValues(100, 100, 100));
    stack.translate(vec3.fromValues(0, 0, 0));

    return {
        modelMatrixSb: stack.get(),
        normMatrixSb: normMatrix,
    }
}

function getSurfaceMatrices(stack) {
    var normMatrix = mat4.create();

    stack.rotateX(Math.PI / 3);

    mat4.invert(stack.get(), normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixS: stack.get(),
        normMatrixS: normMatrix,
    }
}

function getFloorMatrices(stack) {
    var normMatrix = mat4.identity();

    stack.rotateX(Math.PI / 3);
    stack.translate(vec3.fromValues(0, -60, 0));

    mat4.invert(stack.get(), normMatrix);
    mat4.transpose(normMatrix, normMatrix);
    
    return {
        modelMatrixF: stack.get(),
        normMatrixF: normMatrix,
    }
}

function getDuckMatrices(stack) {
    var normMatrix = mat4.create();

    const time = Date.now() / 800;
    const bob = Math.sin(time * 1.5) * 0.5;

    const tiltX = Math.sin(time * 1.1) * 0.1;
    const tiltZ = Math.cos(time * 1.3) * 0.1;


    stack.translate(vec3.fromValues(0, bob, 0));
    stack.rotateX(-0.2800000000000001);
    stack.rotateX(tiltX);
    stack.rotateZ(tiltZ);
    stack.scale(vec3.fromValues(50, 50, 50));
    stack.rotateY(Math.PI);

    mat4.invert(stack.get(), normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    return {
        modelMatrixD: stack.get(),
        normMatrixD: normMatrix,
    }
}

//Render Pass Functions
function reflectRenderPass(commandEncoder){

    stack.save();

    const {modelMatrixRf, normMatrixRf} = getReflectionMatrices(stack);

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

    const rPassEncoder = commandEncoder.beginRenderPass(reflectRenderPassDescriptor);
    rPassEncoder.setPipeline(reflectionPipeline);
    rPassEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    rPassEncoder.setBindGroup(0, skyBoxTextureBindGroup);
    rPassEncoder.setBindGroup(1, reflectMatrixBindGroup);
    rPassEncoder.draw(skyBoxVertexCount);
    rPassEncoder.end();
    stack.restore();
}

function refractRenderPass(commandEncoder){

    stack.save();
    const {modelMatrixRf, normMatrixRf} = getRefractionMatrices(stack);

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
    stack.restore();
}

function skyBoxRenderPass(commandEncoder){

    stack.save();
    const {modelMatrixSb, normMatrixSb} = getSkyBoxMatrices(stack);

    device.queue.writeBuffer(
        skyBoxModelMatBuffer,
        0,
        modelMatrixSb,
    );
    device.queue.writeBuffer(
        skyBoxNormMatBuffer,
        0,
        normMatrixSb,
    );

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    if (!depthTexture ||
        depthTexture.width !== context
            .getCurrentTexture().width ||
        depthTexture.height !== context
            .getCurrentTexture().height) {
        if (depthTexture) {
            depthTexture.destroy();
        }
        depthTexture = device.createTexture({
            size: [context
                .getCurrentTexture().width, context
                .getCurrentTexture().height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

    const skyBoxPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    skyBoxPassEncoder.setPipeline(skyBoxPipeline);
    skyBoxPassEncoder.setVertexBuffer(0, cubeVerticesBuffer);
    skyBoxPassEncoder.setBindGroup(0, skyBoxTextureBindGroup);
    skyBoxPassEncoder.setBindGroup(1, skyBoxMatrixBindGroup);
    skyBoxPassEncoder.draw(skyBoxVertexCount);
    skyBoxPassEncoder.end();
    stack.restore();
}

function surfaceRenderPass(commandEncoder){

    stack.save();
    const {modelMatrixS, normMatrixS} = getSurfaceMatrices(stack);

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

    if (!depthTexture ||
        depthTexture.width !== context
            .getCurrentTexture().width ||
        depthTexture.height !== context
            .getCurrentTexture().height) {
        if (depthTexture) {
            depthTexture.destroy();
        }
        depthTexture = device.createTexture({
            size: [context
                .getCurrentTexture().width, context
                .getCurrentTexture().height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

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
    stack.restore();
}

function floorRenderPass(commandEncoder){

    stack.save();
    const {modelMatrixF, normMatrixF} = getFloorMatrices(stack);

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

    if (!depthTexture ||
        depthTexture.width !== context
            .getCurrentTexture().width ||
        depthTexture.height !== context
            .getCurrentTexture().height) {
        if (depthTexture) {
            depthTexture.destroy();
        }
        depthTexture = device.createTexture({
            size: [context
                .getCurrentTexture().width, context
                .getCurrentTexture().height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

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
    stack.restore();
}

function duckRenderPass(commandEncoder){

    stack.save();
    const {modelMatrixD, normMatrixD} = getDuckMatrices(stack);

    device.queue.writeBuffer(
        duckModelMatBuffer,
        0,
        modelMatrixD,
    );
    device.queue.writeBuffer(
        duckNormMatBuffer,
        0,
        normMatrixD,
    );

    const colorTexture = context.getCurrentTexture();
    duckRenderPassDescriptor.colorAttachments[0].view = colorTexture.createView();

    if (!duckDepthTexture ||
        duckDepthTexture.width !== context
            .getCurrentTexture().width ||
        duckDepthTexture.height !== context
            .getCurrentTexture().height) {
        if (duckDepthTexture) {
            duckDepthTexture.destroy();
        }
        duckDepthTexture = device.createTexture({
            size: [context
                .getCurrentTexture().width, context
                .getCurrentTexture().height],
            dimension: '2d',
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    duckRenderPassDescriptor.depthStencilAttachment.view = duckDepthTexture.createView();

    const duckPassEncoder = commandEncoder.beginRenderPass(duckRenderPassDescriptor);
    duckPassEncoder.setPipeline(duckPipeline);
    duckPassEncoder.setBindGroup(0, duckMatrixBindGroup);
    duckPassEncoder.setBindGroup(1, materialBindGroup);
    duckPassEncoder.setVertexBuffer(0, positionBuffer);
    duckPassEncoder.setVertexBuffer(1, normalBuffer);
    duckPassEncoder.setVertexBuffer(2, matIdBuffer);
    duckPassEncoder.setIndexBuffer(indexBuffer, 'uint16');
    duckPassEncoder.drawIndexed(indexSize);
    duckPassEncoder.end();
    stack.restore();
}

function frame() {
    device.queue.writeBuffer(
        viewMatrixBuffer,
        0,
        viewMatrix,
    );

    depthLookup = updateDepthLookup();
    device.queue.writeBuffer(
        depthBuffer,
        0,
        new Float32Array([depthLookup]),
    );

    const commandEncoder = device.createCommandEncoder();

    skyBoxRenderPass(commandEncoder);
    floorRenderPass(commandEncoder);
    reflectRenderPass(commandEncoder);
    refractRenderPass(commandEncoder);
    surfaceRenderPass(commandEncoder);
    duckRenderPass(commandEncoder);

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
        const canvas = entry.target;
        const width = entry.contentBoxSize[0].inlineSize;
        const height = entry.contentBoxSize[0].blockSize;
        canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
        canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        frame();
    }
});
observer.observe(canvas);