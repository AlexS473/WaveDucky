


/*
    // Upload data to the texture
    const noiseBuffer = device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
    });

    new Uint8Array(noiseBuffer.getMappedRange()).set(data);
    noiseBuffer.unmap();

    // Copy buffer to texture
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToTexture(
        {
            buffer: noiseBuffer,
            bytesPerRow: noiseWidth * 4,
            rowsPerImage: noiseHeight
        },
        {
            texture: noiseTexture
        },
        [noiseWidth, noiseHeight, noiseDepth]
    );
    */