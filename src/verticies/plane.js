export const planeVertexSize = 4 * 3; // Byte size of one cube vertex.
export const planeTexSize = 4 * 2;
export const planeVertexCount = 6;

// prettier-ignore
export const planePositions = new Float32Array([
    // float3 position
    -128.0, 0.0, -128.0,
    -128.0, 0.0, 128.0,
    128.0, 0.0, -128.0,

    128.0, 0.0, -128.0,
    -128.0, 0.0, 128.0,
    128.0, 0.0, 128.0,
]);

export const planeTexCoords = new Float32Array([
    // float2 tex_coord
    0.0, 0.0,
    0.0, 1.0,
    1.0, 0.0,

    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0,
]);

export const planeNormals = new Float32Array([
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0
]);

