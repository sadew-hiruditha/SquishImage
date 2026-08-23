/**
 * SquishPNG - Interactive Visual Inspector & Comparison Module
 * Apple-style split slider, pixel-diff heatmap, and synchronized pan/zoom
 */

class ImageComparator {
  constructor(containerElement) {
    this.container = containerElement;
    this.origImg = null;
    this.compImg = null;
    this.diffCanvas = null;
    this.splitPosition = 50; // percentage (0 to 100)
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDraggingSplit = false;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;
    this.currentViewMode = 'split'; // 'split' | 'side' | 'diff'
    this.diffStats = null;

    this.renderDOM();
    this.bindEvents();
  }

  renderDOM() {
    this.container.innerHTML = `
      <div class="comparator-wrapper">
        <!-- Top Toolbar -->
        <div class="comparator-toolbar">
          <div class="view-mode-selector segmented-control">
            <button class="seg-btn active" data-mode="split">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              Split View
            </button>
            <button class="seg-btn" data-mode="side">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="9" height="16" rx="2"/><rect x="13" y="4" width="9" height="16" rx="2"/></svg>
              Side by Side
            </button>
            <button class="seg-btn" data-mode="diff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 14l7-7"/></svg>
              Pixel Diff
            </button>
          </div>

          <div class="zoom-controls">
            <button class="icon-btn" id="btn-zoom-out" title="Zoom Out (Ctrl -)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <span class="zoom-badge" id="zoom-badge">100%</span>
            <button class="icon-btn" id="btn-zoom-in" title="Zoom In (Ctrl +)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button class="icon-btn" id="btn-zoom-reset" title="Fit to Screen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
          </div>
        </div>

        <!-- Viewport Container -->
        <div class="comparator-viewport" id="comp-viewport">
          <div class="viewport-stage" id="viewport-stage">
            <!-- Split View Container -->
            <div class="split-view-container" id="split-view">
              <!-- Compressed (Underneath) -->
              <div class="layer layer-compressed">
                <img id="img-comp-split" alt="Compressed" draggable="false" />
                <span class="image-label right-label">Compressed</span>
              </div>

              <!-- Original (Clipped on top) -->
              <div class="layer layer-original" id="layer-original">
                <img id="img-orig-split" alt="Original" draggable="false" />
                <span class="image-label left-label">Original</span>
              </div>

              <!-- Split Handle / Divider -->
              <div class="split-divider" id="split-divider">
                <div class="divider-line"></div>
                <div class="divider-handle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="15 18 9 12 15 6" />
                    <polyline points="9 18 3 12 9 6" />
                  </svg>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="9 18 15 12 9 6" />
                    <polyline points="15 18 21 12 15 6" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Side by Side Container -->
            <div class="side-view-container hidden" id="side-view">
              <div class="side-panel">
                <div class="side-label-bar">Original</div>
                <div class="side-img-wrapper"><img id="img-orig-side" alt="Original" draggable="false" /></div>
              </div>
              <div class="side-panel">
                <div class="side-label-bar">Compressed</div>
                <div class="side-img-wrapper"><img id="img-comp-side" alt="Compressed" draggable="false" /></div>
              </div>
            </div>

            <!-- Diff View Container -->
            <div class="diff-view-container hidden" id="diff-view">
              <div class="diff-canvas-wrapper" id="diff-canvas-wrapper"></div>
              <div class="diff-telemetry-badge" id="diff-telemetry">Calculating differences...</div>
            </div>
          </div>
        </div>

        <!-- Bottom Status & Telemetry Bar -->
        <div class="comparator-bottom-bar" id="comparator-bottom">
          <div class="telemetry-item" id="tele-orig">
            <span class="tele-label">Original:</span>
            <span class="tele-val" id="val-orig-size">--</span>
          </div>
          <div class="telemetry-arrow">→</div>
          <div class="telemetry-item" id="tele-comp">
            <span class="tele-label">Compressed:</span>
            <span class="tele-val highlight" id="val-comp-size">--</span>
          </div>
          <div class="telemetry-badge-saving" id="val-saving-badge">0% Saved</div>
          <div class="telemetry-meta" id="val-meta">1920 × 1080 • PNG</div>
        </div>
      </div>
    `;

    this.viewport = this.container.querySelector('#comp-viewport');
    this.stage = this.container.querySelector('#viewport-stage');
    this.splitDivider = this.container.querySelector('#split-divider');
    this.layerOrig = this.container.querySelector('#layer-original');
    this.imgOrigSplit = this.container.querySelector('#img-orig-split');
    this.imgCompSplit = this.container.querySelector('#img-comp-split');
    this.imgOrigSide = this.container.querySelector('#img-orig-side');
    this.imgCompSide = this.container.querySelector('#img-comp-side');
    this.diffCanvasWrapper = this.container.querySelector('#diff-canvas-wrapper');
    this.zoomBadge = this.container.querySelector('#zoom-badge');
  }

  loadImages(originalUrl, compressedUrl, itemData = {}) {
    this.imgOrigSplit.src = originalUrl;
    this.imgCompSplit.src = compressedUrl;
    this.imgOrigSide.src = originalUrl;
    this.imgCompSide.src = compressedUrl;

    this.itemData = itemData;
    this.updateTelemetry(itemData);
    this.updateSplitPosition(50);
    this.resetZoom();

    // Prepare pixel diff
    this.computePixelDiff(originalUrl, compressedUrl);
  }

  updateTelemetry(data) {
    if (!data) return;
    const origVal = this.container.querySelector('#val-orig-size');
    const compVal = this.container.querySelector('#val-comp-size');
    const savingBadge = this.container.querySelector('#val-saving-badge');
    const metaVal = this.container.querySelector('#val-meta');

    if (origVal && data.originalSize) origVal.textContent = CompressorEngine.formatBytes(data.originalSize);
    if (compVal && data.compressedSize) compVal.textContent = CompressorEngine.formatBytes(data.compressedSize);

    if (savingBadge && data.originalSize && data.compressedSize) {
      const savedBytes = Math.max(0, data.originalSize - data.compressedSize);
      const percent = Math.round((savedBytes / data.originalSize) * 100);
      savingBadge.textContent = `-${percent}% (${CompressorEngine.formatBytes(savedBytes)} saved)`;
      savingBadge.className = percent > 0 ? 'telemetry-badge-saving' : 'telemetry-badge-neutral';
    }

    if (metaVal && data.width && data.height) {
      metaVal.textContent = `${data.width} × ${data.height} px • ${data.colors ? (data.colors + ' colors') : 'Lossless 24-bit'}`;
    }
  }

  async computePixelDiff(originalUrl, compressedUrl) {
    const diffTelemetry = this.container.querySelector('#diff-telemetry');
    if (diffTelemetry) diffTelemetry.textContent = 'Computing visual delta...';

    try {
      const [origImg, compImg] = await Promise.all([
        this.loadImageElement(originalUrl),
        this.loadImageElement(compressedUrl)
      ]);

      const width = origImg.naturalWidth;
      const height = origImg.naturalHeight;

      const canvas1 = document.createElement('canvas');
      canvas1.width = width;
      canvas1.height = height;
      const ctx1 = canvas1.getContext('2d');
      ctx1.drawImage(origImg, 0, 0);
      const data1 = ctx1.getImageData(0, 0, width, height);

      const canvas2 = document.createElement('canvas');
      canvas2.width = width;
      canvas2.height = height;
      const ctx2 = canvas2.getContext('2d');
      ctx2.drawImage(compImg, 0, 0);
      const data2 = ctx2.getImageData(0, 0, width, height);

      const diffResult = CompressorEngine.generateDiffCanvas(data1, data2, width, height, 8);
      this.diffCanvasWrapper.innerHTML = '';
      this.diffCanvasWrapper.appendChild(diffResult.canvas);
      diffResult.canvas.className = 'diff-render-canvas';

      if (diffTelemetry) {
        if (diffResult.diffPixels === 0) {
          diffTelemetry.innerHTML = `✨ <strong>100% Bit-Exact Match</strong> (0 altered pixels)`;
        } else {
          diffTelemetry.innerHTML = `Visual Delta: <strong>${diffResult.diffPercentage}%</strong> altered pixels (Max Δ: ${Math.round(diffResult.maxDelta)})`;
        }
      }
    } catch (e) {
      console.warn('Diff compute error:', e);
      if (diffTelemetry) diffTelemetry.textContent = 'Pixel diff unavailable for this image';
    }
  }

  loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  updateSplitPosition(percent) {
    this.splitPosition = Math.max(0, Math.min(100, percent));
    this.splitDivider.style.left = `${this.splitPosition}%`;
    this.layerOrig.style.clipPath = `polygon(0 0, ${this.splitPosition}% 0, ${this.splitPosition}% 100%, 0 100%)`;
  }

  setZoom(zoom, centerX = null, centerY = null) {
    const prevZoom = this.zoomLevel;
    this.zoomLevel = Math.max(0.2, Math.min(8.0, zoom));
    this.zoomBadge.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    this.applyTransform();
  }

  resetZoom() {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.zoomBadge.textContent = '100%';
    this.applyTransform();
  }

  applyTransform() {
    this.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    const splitView = this.container.querySelector('#split-view');
    const sideView = this.container.querySelector('#side-view');
    const diffView = this.container.querySelector('#diff-view');

    splitView.classList.toggle('hidden', mode !== 'split');
    sideView.classList.toggle('hidden', mode !== 'side');
    diffView.classList.toggle('hidden', mode !== 'diff');

    this.container.querySelectorAll('.view-mode-selector .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  bindEvents() {
    // Mode Buttons
    this.container.querySelectorAll('.view-mode-selector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setViewMode(btn.dataset.mode);
      });
    });

    // Zoom Buttons
    this.container.querySelector('#btn-zoom-in').addEventListener('click', () => {
      this.setZoom(this.zoomLevel * 1.25);
    });
    this.container.querySelector('#btn-zoom-out').addEventListener('click', () => {
      this.setZoom(this.zoomLevel / 1.25);
    });
    this.container.querySelector('#btn-zoom-reset').addEventListener('click', () => {
      this.resetZoom();
    });

    // Split Divider Dragging
    const onSplitMove = (e) => {
      if (!this.isDraggingSplit) return;
      const rect = this.viewport.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left;
      const percent = (x / rect.width) * 100;
      this.updateSplitPosition(percent);
    };

    const onSplitEnd = () => {
      this.isDraggingSplit = false;
      document.removeEventListener('mousemove', onSplitMove);
      document.removeEventListener('mouseup', onSplitEnd);
      document.removeEventListener('touchmove', onSplitMove);
      document.removeEventListener('touchend', onSplitEnd);
    };

    this.splitDivider.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isDraggingSplit = true;
      document.addEventListener('mousemove', onSplitMove);
      document.addEventListener('mouseup', onSplitEnd);
    });

    this.splitDivider.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      this.isDraggingSplit = true;
      document.addEventListener('touchmove', onSplitMove, { passive: true });
      document.addEventListener('touchend', onSplitEnd);
    });

    // Viewport Pan & Zoom with Wheel / Pointer
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 0.85;
      this.setZoom(this.zoomLevel * delta);
    }, { passive: false });

    this.viewport.addEventListener('mousedown', (e) => {
      if (this.isDraggingSplit) return;
      this.isPanning = true;
      this.startPanX = e.clientX - this.panX;
      this.startPanY = e.clientY - this.panY;
      this.viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startPanX;
      this.panY = e.clientY - this.startPanY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.viewport.style.cursor = 'grab';
      }
    });

    // Keyboard navigation (Left / Right arrow for split slider)
    window.addEventListener('keydown', (e) => {
      if (this.currentViewMode !== 'split') return;
      if (e.key === 'ArrowLeft') {
        this.updateSplitPosition(this.splitPosition - 5);
      } else if (e.key === 'ArrowRight') {
        this.updateSplitPosition(this.splitPosition + 5);
      }
    });
  }
}

window.ImageComparator = ImageComparator;
