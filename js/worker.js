/**
 * SquishPNG - Web Worker for PNG Compression
 * Runs compression in background thread for 60fps UI performance
 */

// Polyfill window/self for vendor scripts inside WebWorker
if (typeof window === 'undefined') {
  self.window = self;
}

try {
  importScripts('vendor/pako.min.js', 'vendor/upng.min.js');
} catch (e) {
  console.warn('Worker importScripts fallback:', e);
}

/**
 * Floyd-Steinberg error diffusion dithering on RGBA buffer given a quantized palette
 */
function applyDithering(rgba, width, height, paletteRgba, strength = 0.8) {
  const ditherBuf = new Float32Array(rgba);
  const numPixels = width * height;
  const out = new Uint8Array(rgba.length);

  // Convert palette to quick lookup array of [r, g, b, a]
  const pal = [];
  for (let i = 0; i < paletteRgba.length; i++) {
    const val = paletteRgba[i];
    pal.push([
      val & 0xFF,
      (val >> 8) & 0xFF,
      (val >> 16) & 0xFF,
      (val >> 24) & 0xFF
    ]);
  }

  function findNearestPaletteIndex(r, g, b, a) {
    let minDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i];
      // Weighted euclidean distance (human eye is most sensitive to green, then red, then blue)
      const dr = r - p[0];
      const dg = g - p[1];
      const db = b - p[2];
      const da = a - p[3];
      const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114 + da * da * 0.5;
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = Math.min(255, Math.max(0, ditherBuf[idx]));
      const oldG = Math.min(255, Math.max(0, ditherBuf[idx + 1]));
      const oldB = Math.min(255, Math.max(0, ditherBuf[idx + 2]));
      const oldA = Math.min(255, Math.max(0, ditherBuf[idx + 3]));

      // If fully transparent, preserve transparent black
      if (oldA < 2) {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
        continue;
      }

      const pIdx = findNearestPaletteIndex(oldR, oldG, oldB, oldA);
      const newP = pal[pIdx];

      out[idx] = newP[0];
      out[idx + 1] = newP[1];
      out[idx + 2] = newP[2];
      out[idx + 3] = newP[3];

      const errR = (oldR - newP[0]) * strength;
      const errG = (oldG - newP[1]) * strength;
      const errB = (oldB - newP[2]) * strength;
      const errA = (oldA - newP[3]) * strength;

      // Distribute error
      if (x + 1 < width) {
        const rightIdx = (y * width + (x + 1)) * 4;
        ditherBuf[rightIdx] += errR * (7 / 16);
        ditherBuf[rightIdx + 1] += errG * (7 / 16);
        ditherBuf[rightIdx + 2] += errB * (7 / 16);
        ditherBuf[rightIdx + 3] += errA * (7 / 16);
      }
      if (y + 1 < height) {
        if (x - 1 >= 0) {
          const dlIdx = ((y + 1) * width + (x - 1)) * 4;
          ditherBuf[dlIdx] += errR * (3 / 16);
          ditherBuf[dlIdx + 1] += errG * (3 / 16);
          ditherBuf[dlIdx + 2] += errB * (3 / 16);
          ditherBuf[dlIdx + 3] += errA * (3 / 16);
        }
        const dIdx = ((y + 1) * width + x) * 4;
        ditherBuf[dIdx] += errR * (5 / 16);
        ditherBuf[dIdx + 1] += errG * (5 / 16);
        ditherBuf[dIdx + 2] += errB * (5 / 16);
        ditherBuf[dIdx + 3] += errA * (5 / 16);

        if (x + 1 < width) {
          const drIdx = ((y + 1) * width + (x + 1)) * 4;
          ditherBuf[drIdx] += errR * (1 / 16);
          ditherBuf[drIdx + 1] += errG * (1 / 16);
          ditherBuf[drIdx + 2] += errB * (1 / 16);
          ditherBuf[drIdx + 3] += errA * (1 / 16);
        }
      }
    }
  }

  return out;
}

/**
 * Resample RGBA buffer to new dimensions
 */
function resampleRGBA(srcBuf, srcW, srcH, dstW, dstH) {
  if (srcW === dstW && srcH === dstH) {
    return new Uint8Array(srcBuf);
  }

  const src = new Uint8Array(srcBuf);
  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const yWeight = srcY - y0;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const xWeight = srcX - x0;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;
      const dstIdx = (y * dstW + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = src[idx00 + c] * (1 - xWeight) + src[idx10 + c] * xWeight;
        const bottom = src[idx01 + c] * (1 - xWeight) + src[idx11 + c] * xWeight;
        dst[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }

  return dst;
}

/**
 * Main compression logic
 */
function processCompression(data) {
  const { id, rawBuffer, options } = data;
  const startTime = performance.now();

  const upng = typeof UPNG !== 'undefined' ? UPNG : self.UPNG;
  if (!upng) {
    throw new Error('UPNG library is not loaded');
  }

  // 1. Decode PNG or RGBA buffer
  let img;
  let rgbaBuffer;
  let width;
  let height;

  if (data.isRgbaArray) {
    rgbaBuffer = rawBuffer;
    width = data.width;
    height = data.height;
  } else {
    img = upng.decode(rawBuffer);
    const rgbaFrames = upng.toRGBA8(img);
    rgbaBuffer = rgbaFrames[0];
    width = img.width;
    height = img.height;
  }

  let finalWidth = width;
  let finalHeight = height;
  let currentRgba = new Uint8Array(rgbaBuffer);

  // 2. Handle Resizing / Downscaling if specified
  if (options.resize && options.resize.enabled) {
    if (options.resize.scale && options.resize.scale < 1.0) {
      finalWidth = Math.max(1, Math.round(width * options.resize.scale));
      finalHeight = Math.max(1, Math.round(height * options.resize.scale));
    } else if (options.resize.maxWidth || options.resize.maxHeight) {
      const maxW = options.resize.maxWidth || width;
      const maxH = options.resize.maxHeight || height;
      const scale = Math.min(1.0, Math.min(maxW / width, maxH / height));
      finalWidth = Math.max(1, Math.round(width * scale));
      finalHeight = Math.max(1, Math.round(height * scale));
    }

    if (finalWidth !== width || finalHeight !== height) {
      currentRgba = resampleRGBA(currentRgba.buffer, width, height, finalWidth, finalHeight);
    }
  }

  // 3. Matte background color (if user requested flattening transparency)
  if (options.matteColor) {
    const hex = options.matteColor.replace('#', '');
    const mr = parseInt(hex.substring(0, 2), 16) || 255;
    const mg = parseInt(hex.substring(2, 4), 16) || 255;
    const mb = parseInt(hex.substring(4, 6), 16) || 255;

    for (let i = 0; i < currentRgba.length; i += 4) {
      const alpha = currentRgba[i + 3] / 255;
      if (alpha < 1.0) {
        currentRgba[i] = Math.round(currentRgba[i] * alpha + mr * (1 - alpha));
        currentRgba[i + 1] = Math.round(currentRgba[i + 1] * alpha + mg * (1 - alpha));
        currentRgba[i + 2] = Math.round(currentRgba[i + 2] * alpha + mb * (1 - alpha));
        currentRgba[i + 3] = 255;
      }
    }
  }

  // 4. Color count determination based on mode & preset
  let cnum = 0; // 0 = lossless RGBA 32-bit
  const mode = options.mode || 'balanced';

  if (mode === 'lossless') {
    cnum = 0;
  } else if (mode === 'balanced') {
    cnum = 128; // TinyPNG sweetspot
  } else if (mode === 'aggressive') {
    cnum = 64;
  } else if (mode === 'ultra') {
    cnum = 32;
  } else if (mode === 'custom') {
    cnum = parseInt(options.colors) || 0;
  }

  // Cap cnum between 0 and 256, and ensure cnum never exceeds pixel count for tiny images
  if (cnum < 0) cnum = 0;
  if (cnum > 256) cnum = 256;
  const totalPixels = finalWidth * finalHeight;
  if (cnum > 0 && cnum > totalPixels) {
    cnum = Math.max(2, totalPixels);
  }

  // 5. Quantization & Dithering
  let encodedBuffer;
  let usedPalette = [];

  if (cnum > 0 && cnum <= 256) {
    if (options.dither && options.ditherStrength > 0) {
      // Perform quantize step to get optimal palette, then apply Floyd-Steinberg error diffusion
      try {
        const qRes = upng.quantize([currentRgba.buffer], cnum, false);
        const paletteRgba = qRes.plte.map(item => item.est.rgba);
        const ditheredRgba = applyDithering(currentRgba, finalWidth, finalHeight, paletteRgba, options.ditherStrength || 0.7);
        // Encode with palette
        encodedBuffer = upng.encode([ditheredRgba.buffer], finalWidth, finalHeight, cnum);
        currentRgba = ditheredRgba;
      } catch (e) {
        // Fallback to standard UPNG quantize & encode
        encodedBuffer = upng.encode([currentRgba.buffer], finalWidth, finalHeight, cnum);
      }
    } else {
      encodedBuffer = upng.encode([currentRgba.buffer], finalWidth, finalHeight, cnum);
    }
  } else {
    // Lossless encode
    encodedBuffer = upng.encode([currentRgba.buffer], finalWidth, finalHeight, 0);
  }

  // Target size binary search optimization if requested
  if (options.targetSizeKB && options.targetSizeKB > 0 && encodedBuffer.byteLength > options.targetSizeKB * 1024) {
    const targetBytes = options.targetSizeKB * 1024;
    let minColors = 16;
    let maxColors = Math.min(256, cnum || 256);
    let bestBuffer = encodedBuffer;

    for (let step = 0; step < 4; step++) {
      const midColors = Math.floor((minColors + maxColors) / 2);
      const testBuffer = upng.encode([currentRgba.buffer], finalWidth, finalHeight, midColors);
      if (testBuffer.byteLength <= targetBytes) {
        bestBuffer = testBuffer;
        minColors = midColors + 1;
      } else {
        bestBuffer = testBuffer;
        maxColors = midColors - 1;
      }
      if (minColors > maxColors) break;
    }
    encodedBuffer = bestBuffer;
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    id,
    compressedBuffer: encodedBuffer,
    width: finalWidth,
    height: finalHeight,
    originalWidth: width,
    originalHeight: height,
    durationMs,
    colors: cnum,
    originalSize: data.originalSize || rawBuffer.byteLength,
    compressedSize: encodedBuffer.byteLength
  };
}

// Worker message listener
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = function (event) {
    try {
      const result = processCompression(event.data);
      self.postMessage({ status: 'success', result }, [result.compressedBuffer]);
    } catch (err) {
      self.postMessage({
        status: 'error',
        id: event.data.id,
        message: err.message || 'Compression failed'
      });
    }
  };
}
