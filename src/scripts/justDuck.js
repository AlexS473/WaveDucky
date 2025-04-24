import {mat4, vec3,} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

let response = await fetch("./shaders/duck.vert.wgsl");
const duckVertWGSL = await response.text();

response = await fetch("./shaders/duck.frag.wgsl");
const duckFragWGSL = await response.text();

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

let { positionBuffer, normalBuffer, indexBuffer, indexSize, materials, matIdBuffer } = await loadObj2(device, '../objects/ducky.obj');

const matrixBindGroupLayout = device.createBindGroupLayout({
    label: 'matrix bind group layout ',
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
    ],
});

const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' }
    }]
});

const duckPipelineLayout = device.createPipelineLayout(
        {
            bindGroupLayouts: [matrixBindGroupLayout, materialBindGroupLayout],
        }
    );

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
                format: 'bgra8unorm'
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
        format: 'depth24plus-stencil8'
    }
});

let duckDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    dimension: '2d',
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
});


const duckRenderPassDescriptor= {
    colorAttachments: [
        {
            view: undefined,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        }
    ],
    depthStencilAttachment: {
        view: duckDepthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        stencilClearValue: 0,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store'
    },
};

const aspect = canvas.width / canvas.height;
var direction = 0;
var lastAxis = 0;
var logicalTime = 0;
var lastFrameTime = Date.now() / 1000;

const matrixBufferSize = 4 * 16;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 3000);

function createMatrixBuffer(){
    return device.createBuffer({
        size: matrixBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

const projectionMatBuffer = createMatrixBuffer();

const duckModelMatBuffer = createMatrixBuffer();

const duckViewMatBuffer = createMatrixBuffer();

const duckNormMatBuffer = createMatrixBuffer();

const materialBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});


const matArray = Object.values(materials);
const matUniformValues = new Float32Array(16 * matArray.length);

function padded(arr) {
    return [...arr.map(parseFloat), 1.0];
}

matArray.forEach((mat, mIndex) => {
    const base = mIndex * 16;

    const ambient  = padded(mat.Ka || [0, 0, 0]);
    const diffuse  = padded(mat.Kd || [0, 0, 0]);
    const specular = padded(mat.Ks || [0, 0, 0]);
    const shininess = parseFloat(mat.Ns ?? 1);

    matUniformValues.set(ambient, base);
    matUniformValues.set(diffuse, base + 4);
    matUniformValues.set(specular, base + 8);
    matUniformValues[base + 12] = shininess;
});

console.log(matUniformValues);
device.queue.writeBuffer(
    materialBuffer,
    0,
    matUniformValues
);

function getDuckMatrices(direction) {
    var modelMatrix = mat4.identity();
    var viewMatrix = mat4.identity();
    var normMatrix = mat4.create();

    mat4.lookAt(
        vec3.fromValues(1, 1, 0),
        vec3.fromValues(0, 0, 0),
        vec3.fromValues(0.0, 0, -1),
        viewMatrix
    );

    mat4.invert(modelMatrix, normMatrix);
    mat4.transpose(normMatrix, normMatrix);

    const now = Date.now() / 1000;
    const elapsedTime = now - lastFrameTime;
    lastFrameTime = now;

    if (direction !== 0){
        logicalTime -= elapsedTime;
        lastAxis = logicalTime * direction;
    }

    mat4.rotateZ(
        viewMatrix,
        lastAxis,
        viewMatrix
    );

    return {
        modelMatrixD: modelMatrix,
        viewMatrixD: viewMatrix,
        normMatrixD: normMatrix,
    }
}

let matrixBindGroup = device.createBindGroup({
    layout: matrixBindGroupLayout,
    entries: [
        {
            binding: 0,
            resource: {
                buffer: duckModelMatBuffer,
                offset: 0,
                size: matrixBufferSize,
            }
        },
        {
            binding: 1,
            resource: {
                buffer: duckViewMatBuffer,
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
                buffer: duckNormMatBuffer,
                offset: 0,
                size: matrixBufferSize,
            }
        },
    ]
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



window.addEventListener("keydown", (event) => {

    if (event.code == 'ArrowLeft') {
        direction = -1;
    }
    if (event.code == 'ArrowRight') {
        direction = 1;
    }
});

window.addEventListener("keyup", (event) => {

    if (event.code == 'ArrowLeft'|| event.code == 'ArrowRight'){
        direction = 0;
    }
});

function frame() {

    const commandEncoder = device.createCommandEncoder();
    const colorTexture = context.getCurrentTexture();

    const {modelMatrixD, viewMatrixD, normMatrixD} = getDuckMatrices(direction);

    device.queue.writeBuffer(
        projectionMatBuffer,
        0,
        projectionMatrix,
    );
    device.queue.writeBuffer(
        duckViewMatBuffer,
        0,
        viewMatrixD,
    );
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


    duckRenderPassDescriptor.colorAttachments[0].view = colorTexture.createView();

    const duckPassEncoder = commandEncoder.beginRenderPass(duckRenderPassDescriptor);
    duckPassEncoder.setPipeline(duckPipeline);
    duckPassEncoder.setBindGroup(0, matrixBindGroup);
    duckPassEncoder.setBindGroup(1, materialBindGroup);
    duckPassEncoder.setVertexBuffer(0, positionBuffer);
    duckPassEncoder.setVertexBuffer(1, normalBuffer);
    duckPassEncoder.setVertexBuffer(2, matIdBuffer);
    duckPassEncoder.setIndexBuffer(indexBuffer, 'uint16');
    duckPassEncoder.drawIndexed(indexSize);
    duckPassEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);