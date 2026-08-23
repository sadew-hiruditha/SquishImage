/**
 * SquishImage - Core Compressor Engine & Worker Pool Manager
 * Supports intelligent format-aware PNG, JPG, and WebP compression
 */

class CompressorEngine {
  constructor() {
    this.concurrency = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
    this.workers = [];
    this.idleWorkers = [];
    this.jobQueue = [];
    this.activeJobs = new Map();
    this.initWorkerPool();
  }

  initWorkerPool() {
    for (let i = 0; i < this.concurrency; i++) {
      try {
        const worker = new Worker('js/worker.js');
        worker.onmessage = (e) => this.handleWorkerMessage(worker, e.data);
        worker.onerror = (e) => this.handleWorkerError(worker, e);
        this.workers.push(worker);
        this.idleWorkers.push(worker);
      } catch (err) {
        console.warn('Worker initialization error, falling back to direct mode:', err);
        break;
      }
    }
  }

  handleWorkerMessage(worker, data) {
    this.idleWorkers.push(worker);
    const { status, result, id, message } = data;

    if (this.activeJobs.has(id || (result && result.id))) {
      const { resolve, reject } = this.activeJobs.get(id || result.id);
      this.activeJobs.delete(id || result.id);

      if (status === 'success') {
        resolve(result);
      } else {
        reject(new Error(message || 'Compression failed'));
      }
    }

    this.processNextJob();
  }

  handleWorkerError(worker, error) {
    console.error('Worker error:', error);
    for (const [id, job] of this.activeJobs.entries()) {
      job.reject(new Error('Worker encountered an error during compression'));
      this.activeJobs.delete(id);
    }
    if (!this.idleWorkers.includes(worker)) {
      this.idleWorkers.push(worker);
    }
    this.processNextJob();
  }

  processNextJob() {
    if (this.jobQueue.length === 0 || this.idleWorkers.length === 0) {
      return;
    }

    const worker = this.idleWorkers.pop();
    const job = this.jobQueue.shift();
    this.activeJobs.set(job.data.id, job);

    try {
      if (job.data.rawBuffer) {
        worker.postMessage(job.data, [job.data.rawBuffer]);
      } else {
        worker.postMessage(job.data);
      }
    } catch (e) {
      worker.postMessage(job.data);
    }
  }

  /**
   * Universal Image Decoder: Decodes any PNG, JPG, WebP, BMP, GIF, SVG
   */
  async decodeImageToRGBA(fileOrBlob, rawBuffer) {
    // 1. Try UPNG fast decode if rawBuffer is PNG
    if (rawBuffer && typeof UPNG !== 'undefined') {
      try {
        const header = new Uint8Array(rawBuffer.slice(0, 8));
        const isPngSignature = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
        if (isPngSignature) {
          const img = UPNG.decode(rawBuffer);
          const rgba = UPNG.toRGBA8(img)[0];
          return {
            rgbaBuffer: rgba,
            width: img.width,
            height: img.height
          };
        }
      } catch (e) {
        // Fallback to Canvas decoder
      }
    }

    // 2. Fallback: Browser Native ImageBitmap / Canvas decoder
    if (typeof createImageBitmap === 'function') {
      try {
        const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([rawBuffer]);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return {
          rgbaBuffer: imgData.data.buffer,
          width: bitmap.width,
          height: bitmap.height
        };
      } catch (e) {
        // Continue to Image fallback
      }
    }

    // 3. Fallback: HTMLImageElement via blob URL
    return new Promise((resolve, reject) => {
      const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([rawBuffer]);
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({
          rgbaBuffer: imgData.data.buffer,
          width: canvas.width,
          height: canvas.height
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Failed to decode image data'));
      };
      img.src = blobUrl;
    });
  }

  /**
   * Fast Perceptual JPEG/WebP Compression for Photography
   */
  async compressJPEGorWebP(fileOrBlob, targetMime = 'image/jpeg', quality = 0.80, options = {}) {
    const startTime = performance.now();
    const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob]);
    const bitmap = await createImageBitmap(blob);

    let finalWidth = bitmap.width;
    let finalHeight = bitmap.height;

    // Handle resizing if requested
    if (options.resize && options.resize.enabled) {
      if (options.resize.scale && options.resize.scale < 1.0) {
        finalWidth = Math.max(1, Math.round(bitmap.width * options.resize.scale));
        finalHeight = Math.max(1, Math.round(bitmap.height * options.resize.scale));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = finalWidth;
    canvas.height = finalHeight;
    const ctx = canvas.getContext('2d');

    // Fill white background for JPEG (in case of any alpha channel)
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = options.matteColor || '#FFFFFF';
      ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    ctx.drawImage(bitmap, 0, 0, finalWidth, finalHeight);

    return new Promise((resolve, reject) => {
      canvas.toBlob((outBlob) => {
        if (!outBlob) {
          reject(new Error('Canvas export failed'));
          return;
        }
        outBlob.arrayBuffer().then((buf) => {
          const durationMs = Math.round(performance.now() - startTime);
          resolve({
            compressedBuffer: buf,
            blob: outBlob,
            blobUrl: URL.createObjectURL(outBlob),
            width: finalWidth,
            height: finalHeight,
            originalWidth: bitmap.width,
            originalHeight: bitmap.height,
            durationMs,
            originalSize: blob.size,
            compressedSize: buf.byteLength,
            format: targetMime === 'image/jpeg' ? 'jpg' : 'webp',
            mimeType: targetMime
          });
        });
      }, targetMime, quality);
    });
  }

  /**
   * Main entrypoint for compressing images
   */
  async compress(fileOrBuffer, options = {}, id = null) {
    const jobId = id || 'job_' + Math.random().toString(36).substring(2, 9);

    let rawBuffer;
    let originalSize;
    let fileName = '';
    let mimeType = '';

    if (fileOrBuffer instanceof File) {
      originalSize = fileOrBuffer.size;
      fileName = fileOrBuffer.name || '';
      mimeType = fileOrBuffer.type || '';
      rawBuffer = await fileOrBuffer.arrayBuffer();
    } else if (fileOrBuffer instanceof Blob) {
      originalSize = fileOrBuffer.size;
      mimeType = fileOrBuffer.type || '';
      rawBuffer = await fileOrBuffer.arrayBuffer();
    } else if (fileOrBuffer instanceof ArrayBuffer) {
      originalSize = fileOrBuffer.byteLength;
      rawBuffer = fileOrBuffer;
    } else {
      throw new Error('Unsupported input type for compression');
    }

    // Determine input format
    const isJPEG = mimeType.includes('jpeg') || mimeType.includes('jpg') || /\.(jpe?g|jfif)$/i.test(fileName);
    const targetFormat = options.outputFormat || 'auto'; // 'auto' | 'png' | 'jpg' | 'webp'

    // Determine whether to compress as JPEG / WebP or PNG
    const shouldCompressAsJPEG = (targetFormat === 'jpg') || (targetFormat === 'auto' && isJPEG);
    const shouldCompressAsWebP = (targetFormat === 'webp');

    if (shouldCompressAsJPEG || shouldCompressAsWebP) {
      const mode = options.mode || 'balanced';
      let quality = 0.80; // 80% Balanced

      if (mode === 'lossless') quality = 0.92;
      else if (mode === 'balanced') quality = 0.80;
      else if (mode === 'aggressive') quality = 0.65;
      else if (mode === 'ultra') quality = 0.50;
      else if (mode === 'custom') quality = (parseInt(options.jpgQuality) || 80) / 100;

      const outMime = shouldCompressAsWebP ? 'image/webp' : 'image/jpeg';
      const result = await this.compressJPEGorWebP(fileOrBuffer, outMime, quality, options);
      result.id = jobId;
      return result;
    }

    // Otherwise, compress as PNG
    const decoded = await this.decodeImageToRGBA(fileOrBuffer, rawBuffer);

    // Default compression options
    const mergedOptions = {
      mode: 'balanced', // lossless | balanced | aggressive | ultra | custom
      colors: 128,
      dither: true,
      ditherStrength: 0.7,
      stripMetadata: true,
      matteColor: null,
      resize: {
        enabled: false,
        scale: 1.0,
        maxWidth: null,
        maxHeight: null
      },
      ...options
    };

    // If workers are available, queue the job
    if (this.workers.length > 0) {
      return new Promise((resolve, reject) => {
        this.jobQueue.push({
          data: {
            id: jobId,
            isRgbaArray: true,
            rawBuffer: decoded.rgbaBuffer.slice(0), // clone for transfer
            width: decoded.width,
            height: decoded.height,
            originalSize,
            options: mergedOptions
          },
          resolve,
          reject
        });
        this.processNextJob();
      });
    }

    // Direct main-thread execution fallback
    return this.compressDirectRGBA(decoded.rgbaBuffer, decoded.width, decoded.height, mergedOptions, jobId, originalSize);
  }

  /**
   * Direct execution on main thread (fallback)
   */
  compressDirectRGBA(rgbaBuffer, width, height, options, id, originalSize) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof UPNG === 'undefined') {
          throw new Error('UPNG encoder is not available.');
        }

        let cnum = 128;
        if (options.mode === 'lossless') cnum = 0;
        else if (options.mode === 'balanced') cnum = 128;
        else if (options.mode === 'aggressive') cnum = 64;
        else if (options.mode === 'ultra') cnum = 32;
        else if (options.mode === 'custom') cnum = parseInt(options.colors) || 0;

        const maxColorsPossible = width * height;
        if (cnum > maxColorsPossible) cnum = Math.max(2, maxColorsPossible);

        const startTime = performance.now();
        const compressed = UPNG.encode([rgbaBuffer], width, height, cnum);
        const durationMs = Math.round(performance.now() - startTime);

        resolve({
          id,
          compressedBuffer: compressed,
          width,
          height,
          originalWidth: width,
          originalHeight: height,
          durationMs,
          colors: cnum,
          originalSize,
          compressedSize: compressed.byteLength,
          format: 'png',
          mimeType: 'image/png'
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates a Pixel Difference Heatmap Canvas to visually inspect compression artifacts
   */
  static generateDiffCanvas(origImageData, compImageData, width, height, amplification = 5) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const diffData = ctx.createImageData(width, height);

    const oData = origImageData.data;
    const cData = compImageData.data;
    const dData = diffData.data;

    let diffCount = 0;
    let maxDiff = 0;

    for (let i = 0; i < oData.length; i += 4) {
      const dr = Math.abs(oData[i] - cData[i]);
      const dg = Math.abs(oData[i + 1] - cData[i + 1]);
      const db = Math.abs(oData[i + 2] - cData[i + 2]);
      const da = Math.abs(oData[i + 3] - cData[i + 3]);

      const delta = (dr + dg + db + da) / 4;

      if (delta > 0) {
        diffCount++;
        if (delta > maxDiff) maxDiff = delta;

        // Amplified difference in electric cyan/red heatmap
        const amp = Math.min(255, delta * amplification);
        dData[i] = Math.min(255, amp * 2);     // Red
        dData[i + 1] = 255 - amp;             // Green
        dData[i + 2] = 255;                   // Blue
        dData[i + 3] = Math.max(140, Math.min(255, amp * 3)); // Alpha
      } else {
        // Unchanged pixels: subtle darkened original for context
        dData[i] = oData[i] * 0.2;
        dData[i + 1] = oData[i + 1] * 0.2;
        dData[i + 2] = oData[i + 2] * 0.2;
        dData[i + 3] = oData[i + 3] * 0.4;
      }
    }

    ctx.putImageData(diffData, 0, 0);
    return {
      canvas,
      diffPixels: diffCount,
      totalPixels: width * height,
      diffPercentage: ((diffCount / (width * height)) * 100).toFixed(2),
      maxDelta: maxDiff
    };
  }

  /**
   * Format bytes into human-readable string (KB, MB)
   */
  static formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

window.CompressorEngine = CompressorEngine;
