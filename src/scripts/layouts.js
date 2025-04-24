//----BindGroupLayouts

let textureBindGroupLayout1 = null;
let textureBindGroupLayout2 = null;
let textureBindGroupLayout3 = null;
let lightMaterialBindGroupLayout = null;
let matrixBindGroupLayout = null;

function createBindLayouts(device){

    textureBindGroupLayout1 = device.createBindGroupLayout({
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

    textureBindGroupLayout2 = device.createBindGroupLayout({
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

    textureBindGroupLayout3 = device.createBindGroupLayout({
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

    lightMaterialBindGroupLayout = device.createBindGroupLayout({
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

    matrixBindGroupLayout = device.createBindGroupLayout({
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

    return {
        textureBindGroupLayout1: textureBindGroupLayout1,
        textureBindGroupLayout2: textureBindGroupLayout2,
        textureBindGroupLayout3: textureBindGroupLayout3,
        lightMaterialBindGroupLayout: lightMaterialBindGroupLayout,
        matrixBindGroupLayout: matrixBindGroupLayout,
    }
}

//----Pipeline Layouts

function createPipelineLayouts(device) {

    const refractPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [
            textureBindGroupLayout2,
            lightMaterialBindGroupLayout,
            matrixBindGroupLayout
        ],
    });

    const cubeMapPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [textureBindGroupLayout1, matrixBindGroupLayout],
    });

    const surfacePipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [textureBindGroupLayout3, lightMaterialBindGroupLayout, matrixBindGroupLayout],
    });

    const floorPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [textureBindGroupLayout2, lightMaterialBindGroupLayout, matrixBindGroupLayout],
    });

    return{
        refractPipelineLayout: refractPipelineLayout,
        cubeMapPipelineLayout: cubeMapPipelineLayout,
        surfacePipelineLayout: surfacePipelineLayout,
        floorPipelineLayout: floorPipelineLayout
    }
}

