//---LET'S MAKE SOME NOISE

function noiseIndex(x, y, z, noiseHeight, noiseDepth) {
    return x * (noiseHeight * noiseDepth) + y * noiseDepth + z;
}

function smooth(zoom, x1, y1, z1, noiseData, noiseHeight, noiseWidth, noiseDepth) {

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
    value += fractX * fractY * fractZ * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z1), noiseHeight, noiseDepth)];
    value += (1.0 - fractX) * fractY * fractZ * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z1), noiseHeight, noiseDepth)];
    value += fractX * (1.0 - fractY) * fractZ * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z1), noiseHeight, noiseDepth)];
    value += (1.0 - fractX) * (1.0 - fractY) * fractZ * noiseData[noiseIndex(Math.floor(x2), Math.floor(y2), Math.floor(z1), noiseHeight, noiseDepth)];

    value += fractX * fractY * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y1), Math.floor(z2), noiseHeight, noiseDepth)];
    value += (1.0 - fractX) * fractY * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x2), Math.floor(y1), Math.floor(z2), noiseHeight, noiseDepth)];
    value += fractX * (1.0 - fractY) * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x1), Math.floor(y2), Math.floor(z2), noiseHeight, noiseDepth)];
    value += (1.0 - fractX) * (1.0 - fractY) * (1.0 - fractZ) * noiseData[noiseIndex(Math.floor(x2), Math.floor(y2), Math.floor(z2), noiseHeight, noiseDepth)];

    return value;
}


function turbulence(x, y, z, maxZoom, data, noiseHeight, noiseWidth, noiseDepth) {
    let sum = (Math.sin((1.0 / 512.0) * (8 * Math.PI) * (x + z - 4 * y)) + 1) * 8.0;
    let zoom = maxZoom;

    while (zoom >= 0.9) {
        sum += smooth(zoom, x / zoom, y / zoom, z / zoom, data, noiseHeight, noiseWidth, noiseDepth) * zoom;
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
                let turbulenceValue = turbulence(i, j, k, maxZoom, data, noiseHeight, noiseWidth, noiseDepth); // Ensure this function is defined
                data[index] = data[index + 1] = data[index + 2] = Math.floor(turbulenceValue);
                data[index + 3] = 255;
            }
        }
    }
}

