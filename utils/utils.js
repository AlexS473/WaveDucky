//cs_start: utils_create_gpu_buffer
function createGPUBuffer(device, buffer, usage) {
    const bufferDesc = {
        size: buffer.byteLength,
        usage: usage,
        mappedAtCreation: true
    };
    //console.log('buffer size', buffer.byteLength);
    let gpuBuffer = device.createBuffer(bufferDesc);
    if (buffer instanceof Float32Array) {
        const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
        writeArrayNormal.set(buffer);
    }
    else if (buffer instanceof Uint16Array) {
        const writeArrayNormal = new Uint16Array(gpuBuffer.getMappedRange());
        writeArrayNormal.set(buffer);
    }
    else if (buffer instanceof Uint8Array) {
        const writeArrayNormal = new Uint8Array(gpuBuffer.getMappedRange());
        writeArrayNormal.set(buffer);
    }
    else if (buffer instanceof Uint32Array) {
        const writeArrayNormal = new Uint32Array(gpuBuffer.getMappedRange());
        writeArrayNormal.set(buffer);
    }
    else {
        const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
        writeArrayNormal.set(buffer);
        console.error("Unhandled buffer format ", typeof gpuBuffer);
    }
    gpuBuffer.unmap();
    return gpuBuffer;
}

async function loadObj2(device, url) {
    const objResponse = await fetch(url);
    const objBody = await objResponse.text();

    let obj = await (async () => {
        return new Promise((resolve, reject) => {
            let obj = new OBJFile(objBody);
            obj.parse();
            resolve(obj);
        })
    })();

    let positions = [];
    let normals = [];

    let minX = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;

    let minY = Number.MAX_VALUE;
    let maxY = Number.MIN_VALUE;

    let minZ = Number.MAX_VALUE;
    let maxZ = Number.MIN_VALUE;
    for (let v of obj.result.models[0].vertices) {
        positions.push(v.x);
        positions.push(v.y);
        positions.push(v.z);
        normals.push(0.0);
        normals.push(0.0);
        normals.push(0.0);
    }

    let materialLibraries = obj.result.materialLibraries;
    let materials = await loadMTL('../objects/' + materialLibraries);
    let matArray = Object.keys(materials);

    let i =0;
    let materialIndex = [];
    for (let k of matArray){
        materialIndex[k] = i;
        i++;
    }

    positions = new Float32Array(positions);
    normals = new Float32Array(normals);

    let positionBuffer = createGPUBuffer(device, positions, GPUBufferUsage.VERTEX);
    let indices = [];

    let materialIds = new Uint32Array(obj.result.models[0].vertices.length);

//cs_start: normal_loading

    for (let f of obj.result.models[0].faces) {
        let points = [];
        let facet_indices = [];
        for (let v of f.vertices) {
            const index = v.vertexIndex - 1;
            indices.push(index);

            materialIds[index] = materialIndex[f.material];

            const vertex = glMatrix.vec3.fromValues(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);

            minX = Math.min(positions[index * 3], minX);
            maxX = Math.max(positions[index * 3], maxX);

            minY = Math.min(positions[index * 3 + 1], minY);
            maxY = Math.max(positions[index * 3 + 1], maxY);

            minZ = Math.min(positions[index * 3 + 2], minZ);
            maxZ = Math.max(positions[index * 3 + 2], maxZ);
            points.push(vertex);
            facet_indices.push(index);
        }

        const v1 = glMatrix.vec3.subtract(glMatrix.vec3.create(), points[1], points[0]);
        const v2 = glMatrix.vec3.subtract(glMatrix.vec3.create(), points[2], points[0]);
        const cross = glMatrix.vec3.cross(glMatrix.vec3.create(), v1, v2);
        const normal = glMatrix.vec3.normalize(glMatrix.vec3.create(), cross);

        for (let i of facet_indices) {
            normals[i * 3] += normal[0];
            normals[i * 3 + 1] += normal[1];
            normals[i * 3 + 2] += normal[2];
        }
    }

    let matIdBuffer = createGPUBuffer(device, materialIds, GPUBufferUsage.VERTEX|GPUBufferUsage.FRAGMENT );
    let normalBuffer = createGPUBuffer(device, normals, GPUBufferUsage.VERTEX);
//cs_end: normal_loading

    const indexSize = indices.length;

    indices = new Uint16Array(indices);

    let indexBuffer = createGPUBuffer(device, indices, GPUBufferUsage.INDEX);
    return {
        positionBuffer, normalBuffer, indexBuffer, indexSize, materials, matIdBuffer, center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
        radius: Math.max(Math.max(maxX - minX, maxY - minY), maxZ - minZ) * 0.5
    }
}

async function loadMTL(url) {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");
    const materials = {};
    let currentMaterial = null;

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'newmtl') {
            currentMaterial = parts[1];
            materials[currentMaterial] = {};
        } else if (['Ka', 'Kd', 'Ks'].includes(parts[0])) {
            materials[currentMaterial][parts[0]] = parts.slice(1).map(parseFloat);
        } else if (parts[0] === 'Ns') {
            materials[currentMaterial]['Ns'] = parseFloat(parts[1]);
        }
    }
    return materials;
}