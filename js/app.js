/**
 * SquishPNG - Application Coordinator
 * State management, queue processing, ZIP export, and PWA registration
 */

class SquishPNGApp {
  constructor() {
    this.compressor = new CompressorEngine();
    this.items = []; // Array of { id, file, originalSize, previewUrl, status, result, errorMessage }
    this.options = {
      mode: 'balanced', // 'lossless', 'balanced', 'aggressive', 'ultra', 'custom'
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
      targetSizeKB: 0
    };

    this.ui = new UIManager(this);
    this.ui.loadInitialTheme();
    this.registerServiceWorker();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          reg.update();
          console.log('SquishPNG Service Worker registered and updated:', reg.scope);
        })
        .catch((err) => {
          console.log('Service Worker registration skipped:', err);
        });
    }
  }

  async addFiles(files) {
    const newItems = [];

    for (const file of files) {
      // Be permissive: accept all images, png extensions, or files with size > 0
      const isImage = file.type.startsWith('image/') ||
                      /\.(png|jpe?g|webp|bmp|gif|svg|ico|tiff?|avif)$/i.test(file.name) ||
                      file.size > 0;
      if (!isImage) {
        continue;
      }

      const id = 'item_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      const previewUrl = URL.createObjectURL(file);

      const item = {
        id,
        file,
        originalSize: file.size,
        previewUrl,
        status: 'queued', // queued | compressing | done | error
        result: null,
        errorMessage: null
      };

      this.items.push(item);
      newItems.push(item);
    }

    if (newItems.length > 0) {
      this.ui.renderQueue(this.items);
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      const concurrency = this.compressor.concurrency || 4;

      while (true) {
        const queuedItems = this.items.filter(i => i.status === 'queued');
        if (queuedItems.length === 0) break;

        // Take batch of items up to concurrency limit
        const batch = queuedItems.slice(0, concurrency);
        batch.forEach(i => i.status = 'compressing');
        this.ui.renderQueue(this.items);

        await Promise.all(batch.map(async (item) => {
          try {
            const result = await this.compressor.compress(item.file, this.options, item.id);
            const blob = new Blob([result.compressedBuffer], { type: 'image/png' });
            const blobUrl = URL.createObjectURL(blob);

            item.status = 'done';
            item.result = {
              ...result,
              blob,
              blobUrl
            };
          } catch (err) {
            console.error('Compression error on file ' + item.file.name, err);
            item.status = 'error';
            item.errorMessage = err.message || 'Compression failed';
          }

          this.ui.renderQueue(this.items);
        }));
      }
    } finally {
      this.isProcessingQueue = false;
      this.ui.renderQueue(this.items);
    }
  }

  setMode(mode) {
    this.options.mode = mode;
    this.recompressAll();
  }

  updateCustomSetting(key, value) {
    this.options[key] = value;
    this.recompressAll();
  }

  recompressAll() {
    if (this.items.length === 0) return;

    this.items.forEach(item => {
      if (item.result && item.result.blobUrl) {
        URL.revokeObjectURL(item.result.blobUrl);
      }
      item.status = 'queued';
      item.result = null;
      item.errorMessage = null;
    });

    this.ui.renderQueue(this.items);
    this.processQueue();
  }

  inspectItem(index) {
    if (index >= 0 && index < this.items.length) {
      const item = this.items[index];
      if (item.status === 'done' && item.result) {
        this.ui.openInspector(index, item);
      }
    }
  }

  removeItem(id) {
    const index = this.items.findIndex(i => i.id === id);
    if (index !== -1) {
      const item = this.items[index];
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.result && item.result.blobUrl) URL.revokeObjectURL(item.result.blobUrl);
      this.items.splice(index, 1);
      this.ui.renderQueue(this.items);
    }
  }

  clearAll() {
    this.items.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item.result && item.result.blobUrl) URL.revokeObjectURL(item.result.blobUrl);
    });
    this.items = [];
    this.ui.renderQueue(this.items);
    this.ui.showToast('Cleared all files', 'info');
  }

  async downloadAllAsZip() {
    const doneItems = this.items.filter(item => item.status === 'done' && item.result);
    if (doneItems.length === 0) {
      this.ui.showToast('No compressed files ready to download', 'warning');
      return;
    }

    if (typeof JSZip === 'undefined') {
      this.ui.showToast('ZIP library not loaded', 'error');
      return;
    }

    this.ui.showToast(`Packaging ${doneItems.length} images into ZIP...`, 'info');

    const zip = new JSZip();
    const folder = zip.folder('compressed-pngs');

    for (const item of doneItems) {
      const filename = this.ui.getOutputFilename(item.file.name);
      folder.file(filename, item.result.compressedBuffer);
    }

    try {
      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `SquishPNG-Batch-${new Date().toISOString().substring(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);

      this.ui.showToast('ZIP archive downloaded successfully', 'success');
    } catch (err) {
      console.error('ZIP generation failed:', err);
      this.ui.showToast('Failed to create ZIP archive', 'error');
    }
  }
}

// Bootstrap app immediately or on DOM ready
function bootstrapSquishPNG() {
  if (!window.app) {
    try {
      window.app = new SquishPNGApp();
      console.log('SquishPNG app initialized successfully');
    } catch (err) {
      console.error('SquishPNG init error:', err);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapSquishPNG);
} else {
  bootstrapSquishPNG();
}
