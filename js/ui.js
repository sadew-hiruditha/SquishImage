/**
 * SquishPNG - UI Controller and State Management
 */

class UIManager {
  constructor(app) {
    this.app = app;
    this.queueContainer = document.getElementById('queue-list');
    this.dropzone = document.getElementById('dropzone');
    this.fileInput = document.getElementById('file-input');
    this.statsTotalOrig = document.getElementById('stats-total-orig');
    this.statsTotalComp = document.getElementById('stats-total-comp');
    this.statsTotalSavings = document.getElementById('stats-total-savings');
    this.statsContainer = document.getElementById('batch-summary-bar');
    this.btnDownloadAll = document.getElementById('btn-download-all');
    this.btnClearAll = document.getElementById('btn-clear-all');

    // Bulk Progress Bar
    this.bulkProgressCard = document.getElementById('bulk-progress-card');
    this.bulkSpinner = document.getElementById('bulk-spinner');
    this.bulkStatusTitle = document.getElementById('bulk-status-title');
    this.bulkPercentBadge = document.getElementById('bulk-percent-badge');
    this.bulkProgressFill = document.getElementById('bulk-progress-fill');
    this.bulkSubText = document.getElementById('bulk-sub-text');
    this.bulkSpeedText = document.getElementById('bulk-speed-text');

    // Modal
    this.modal = document.getElementById('inspector-modal');
    this.modalBackdrop = document.getElementById('modal-backdrop');
    this.modalClose = document.getElementById('modal-close');
    this.modalTitle = document.getElementById('modal-title');
    this.modalDownloadBtn = document.getElementById('modal-download-btn');
    this.modalPrevBtn = document.getElementById('modal-prev-btn');
    this.modalNextBtn = document.getElementById('modal-next-btn');
    this.currentInspectedIndex = -1;

    // Toast Container
    this.toastContainer = document.getElementById('toast-container');

    this.initComparator();
    this.bindEvents();
  }

  initComparator() {
    const compContainer = document.getElementById('comparator-mount');
    if (compContainer) {
      this.comparator = new ImageComparator(compContainer);
    }
  }

  bindEvents() {
    // Whole window drag & drop support
    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        this.dropzone.classList.remove('drag-active');
      });
    });

    // Drop handler
    const handleDroppedFiles = (filesList) => {
      const files = Array.from(filesList).filter(f => {
        // Accept all images, PNGs with any casing, or any file with valid size
        return f.type.startsWith('image/') ||
               /\.(png|jpe?g|webp|bmp|gif|svg|ico|tiff?|avif)$/i.test(f.name) ||
               (f.size > 0 && (!f.type || f.type === 'application/octet-stream'));
      });
      if (files.length > 0) {
        this.app.addFiles(files);
      } else {
        this.showToast('Please drop valid PNG image files', 'warning');
      }
    };

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropzone.classList.remove('drag-active');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleDroppedFiles(e.dataTransfer.files);
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files) {
        handleDroppedFiles(e.dataTransfer.files);
      }
    });

    this.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.app.addFiles(files);
      }
      this.fileInput.value = '';
    });

    // Clipboard Paste anywhere on page
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pngFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            // Give pasted image a clean name
            const renamed = new File([file], `Pasted-Image-${new Date().toLocaleTimeString().replace(/:/g, '-')}.png`, { type: 'image/png' });
            pngFiles.push(renamed);
          }
        }
      }
      if (pngFiles.length > 0) {
        this.showToast(`Pasted ${pngFiles.length} image from clipboard`, 'success');
        this.app.addFiles(pngFiles);
      }
    });

    // Select Files Button
    const selectBtn = document.getElementById('btn-select-files');
    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fileInput.click();
      });
    }

    // Dropzone card click (clicking anywhere on card opens picker unless clicking buttons)
    this.dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-try-sample') || e.target.closest('#btn-select-files')) return;
      this.fileInput.click();
    });

    // Sample Image Button
    const sampleBtn = document.getElementById('btn-try-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.generateAndLoadSampleImage();
      });
    }

    // Download All ZIP
    this.btnDownloadAll.addEventListener('click', () => {
      this.app.downloadAllAsZip();
    });

    // Clear All
    this.btnClearAll.addEventListener('click', () => {
      this.app.clearAll();
    });

    // Modal Close
    this.modalClose.addEventListener('click', () => this.closeInspector());
    this.modalBackdrop.addEventListener('click', () => this.closeInspector());

    // Modal Prev / Next
    this.modalPrevBtn.addEventListener('click', () => this.navigateInspector(-1));
    this.modalNextBtn.addEventListener('click', () => this.navigateInspector(1));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('active')) {
        this.closeInspector();
      }
    });

    // Dark / Light Mode Toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Mode Segmented Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.app.setMode(mode);

        const customPanel = document.getElementById('custom-controls-panel');
        if (customPanel) {
          customPanel.classList.toggle('hidden', mode !== 'custom');
        }
      });
    });

    // Custom Slider Controls
    const colorSlider = document.getElementById('slider-colors');
    const colorValBadge = document.getElementById('val-colors');
    if (colorSlider && colorValBadge) {
      colorSlider.addEventListener('input', (e) => {
        colorValBadge.textContent = e.target.value;
        this.app.updateCustomSetting('colors', parseInt(e.target.value));
      });
    }

    const ditherToggle = document.getElementById('toggle-dither');
    const ditherSlider = document.getElementById('slider-dither');
    const ditherValBadge = document.getElementById('val-dither');
    if (ditherToggle) {
      ditherToggle.addEventListener('change', (e) => {
        this.app.updateCustomSetting('dither', e.target.checked);
        if (ditherSlider) ditherSlider.disabled = !e.target.checked;
      });
    }
    if (ditherSlider && ditherValBadge) {
      ditherSlider.addEventListener('input', (e) => {
        const val = Math.round(e.target.value * 100);
        ditherValBadge.textContent = `${val}%`;
        this.app.updateCustomSetting('ditherStrength', parseFloat(e.target.value));
      });
    }

    // Resize Controls
    const resizeToggle = document.getElementById('toggle-resize');
    const resizeOptions = document.getElementById('resize-options');
    const resizeScale = document.getElementById('select-scale');
    if (resizeToggle) {
      resizeToggle.addEventListener('change', (e) => {
        if (resizeOptions) resizeOptions.classList.toggle('hidden', !e.target.checked);
        this.app.updateCustomSetting('resize', {
          enabled: e.target.checked,
          scale: parseFloat(resizeScale?.value || 1.0)
        });
      });
    }
    if (resizeScale) {
      resizeScale.addEventListener('change', (e) => {
        this.app.updateCustomSetting('resize', {
          enabled: resizeToggle?.checked || false,
          scale: parseFloat(e.target.value)
        });
      });
    }

    // Target Size
    const targetSizeInput = document.getElementById('input-target-kb');
    if (targetSizeInput) {
      targetSizeInput.addEventListener('input', (e) => {
        const kb = parseInt(e.target.value) || 0;
        this.app.updateCustomSetting('targetSizeKB', kb);
      });
    }
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('squishpng-theme', isDark ? 'dark' : 'light');
  }

  loadInitialTheme() {
    const saved = localStorage.getItem('squishpng-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-theme');
    }
  }

  renderQueue(items) {
    if (items.length === 0) {
      this.queueContainer.innerHTML = '';
      this.dropzone.classList.remove('has-items');
      this.statsContainer.classList.add('hidden');
      if (this.bulkProgressCard) this.bulkProgressCard.classList.add('hidden');
      return;
    }

    this.dropzone.classList.add('has-items');
    this.statsContainer.classList.remove('hidden');
    this.updateBulkProgress(items);

    this.queueContainer.innerHTML = items.map((item, index) => {
      const isDone = item.status === 'done';
      const isError = item.status === 'error';
      const isCompressing = item.status === 'compressing';

      let savingsHtml = '';
      if (isDone && item.result) {
        const savedBytes = Math.max(0, item.originalSize - item.result.compressedSize);
        const percent = Math.round((savedBytes / item.originalSize) * 100);
        savingsHtml = `
          <div class="card-metric-badge ${percent > 0 ? 'badge-green' : 'badge-neutral'}">
            <span class="badge-saving">-${percent}%</span>
            <span class="badge-sub">${CompressorEngine.formatBytes(savedBytes)} saved</span>
          </div>
        `;
      }

      return `
        <div class="queue-card ${item.status}" data-id="${item.id}" data-index="${index}">
          <div class="card-thumb-wrapper" onclick="app.inspectItem(${index})">
            <img class="card-thumb" src="${item.previewUrl}" alt="Thumbnail" />
            <div class="thumb-hover-overlay">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
          </div>

          <div class="card-info">
            <div class="card-header-row">
              <span class="card-filename" title="${item.file.name}">${item.file.name}</span>
              ${savingsHtml}
            </div>

            <div class="card-meta-row">
              <span class="card-size-orig">${CompressorEngine.formatBytes(item.originalSize)}</span>
              ${isDone ? `<span class="size-arrow">→</span><span class="card-size-comp">${CompressorEngine.formatBytes(item.result.compressedSize)}</span>` : ''}
              ${item.result ? `<span class="card-timing">• ${item.result.durationMs}ms</span>` : ''}
            </div>

            ${isCompressing ? `
              <div class="card-progress-bar">
                <div class="progress-fill indeterminate"></div>
              </div>
            ` : ''}

            ${isError ? `<div class="card-error-msg">Compression failed: ${item.errorMessage || 'Unknown error'}</div>` : ''}
          </div>

          <div class="card-actions">
            ${isDone ? `
              <button class="action-btn btn-inspect" onclick="app.inspectItem(${index})" title="Compare Before & After">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                <span>Inspect</span>
              </button>
              <a class="action-btn btn-download-single" href="${item.result.blobUrl}" download="${this.getOutputFilename(item.file.name)}" title="Download Compressed PNG">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Save</span>
              </a>
            ` : ''}
            <button class="action-btn btn-remove" onclick="app.removeItem('${item.id}')" title="Remove">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.updateAggregateStats(items);
  }

  updateBulkProgress(items) {
    if (!this.bulkProgressCard) return;

    const total = items.length;
    if (total === 0) {
      this.bulkProgressCard.classList.add('hidden');
      return;
    }

    const completed = items.filter(i => i.status === 'done' || i.status === 'error').length;
    const inProgress = items.some(i => i.status === 'compressing' || i.status === 'queued');

    this.bulkProgressCard.classList.remove('hidden');

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (this.bulkProgressFill) this.bulkProgressFill.style.width = `${percent}%`;
    if (this.bulkPercentBadge) this.bulkPercentBadge.textContent = `${percent}%`;

    if (inProgress) {
      this.bulkProgressCard.classList.remove('completed');
      if (this.bulkStatusTitle) this.bulkStatusTitle.textContent = `Compressing ${completed + 1 > total ? total : completed + 1} of ${total} images...`;
      if (this.bulkSubText) this.bulkSubText.textContent = `${completed} of ${total} completed • ${total - completed} remaining`;
      const threads = this.app.compressor?.concurrency || 4;
      if (this.bulkSpeedText) this.bulkSpeedText.textContent = `${threads} parallel worker threads active`;
    } else {
      this.bulkProgressCard.classList.add('completed');
      if (this.bulkStatusTitle) this.bulkStatusTitle.textContent = `✓ All ${total} images compressed successfully`;
      if (this.bulkSubText) this.bulkSubText.textContent = `Batch processing finished • Ready for download`;
      if (this.bulkSpeedText) this.bulkSpeedText.textContent = `100% complete`;
    }
  }

  updateAggregateStats(items) {
    let totalOrig = 0;
    let totalComp = 0;
    let completedCount = 0;

    items.forEach(item => {
      if (item.status === 'done' && item.result) {
        totalOrig += item.originalSize;
        totalComp += item.result.compressedSize;
        completedCount++;
      }
    });

    if (this.statsTotalOrig) this.statsTotalOrig.textContent = CompressorEngine.formatBytes(totalOrig);
    if (this.statsTotalComp) this.statsTotalComp.textContent = CompressorEngine.formatBytes(totalComp);

    if (this.statsTotalSavings) {
      if (totalOrig > 0 && completedCount > 0) {
        const saved = Math.max(0, totalOrig - totalComp);
        const percent = Math.round((saved / totalOrig) * 100);
        this.statsTotalSavings.innerHTML = `<strong>${CompressorEngine.formatBytes(saved)}</strong> (${percent}% saved)`;
      } else {
        this.statsTotalSavings.textContent = '0 B';
      }
    }
  }

  getOutputFilename(origName) {
    if (origName.toLowerCase().endsWith('.png')) {
      return origName;
    }
    const base = origName.replace(/\.[^/.]+$/, '');
    return `${base}.png`;
  }

  openInspector(index, item) {
    this.currentInspectedIndex = index;
    this.modalTitle.textContent = item.file.name;
    this.modalDownloadBtn.href = item.result.blobUrl;
    this.modalDownloadBtn.download = this.getOutputFilename(item.file.name);

    this.modalPrevBtn.disabled = index <= 0;
    this.modalNextBtn.disabled = index >= this.app.items.length - 1;

    this.modal.classList.add('active');
    this.modalBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';

    this.comparator.loadImages(item.previewUrl, item.result.blobUrl, {
      originalSize: item.originalSize,
      compressedSize: item.result.compressedSize,
      width: item.result.width,
      height: item.result.height,
      colors: item.result.colors
    });
  }

  navigateInspector(direction) {
    const newIndex = this.currentInspectedIndex + direction;
    if (newIndex >= 0 && newIndex < this.app.items.length) {
      const item = this.app.items[newIndex];
      if (item.status === 'done') {
        this.openInspector(newIndex, item);
      }
    }
  }

  closeInspector() {
    this.modal.classList.remove('active');
    this.modalBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `apple-toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-msg">${message}</span>
      </div>
    `;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // Generates a rich, high-detail sample PNG with gradients, transparency, and geometric elements for testing
  generateAndLoadSampleImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    // Vibrant Apple-style mesh gradient background
    const grad = ctx.createRadialGradient(400, 300, 50, 600, 400, 600);
    grad.addColorStop(0, '#FF375F');
    grad.addColorStop(0.3, '#FF9F0A');
    grad.addColorStop(0.6, '#BF5AF2');
    grad.addColorStop(1, '#0A84FF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 800);

    // Translucent glass rounded card
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(150, 120, 900, 560, 40);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Graphic circles with alpha blending
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(${Math.round(255 - i * 20)}, ${Math.round(100 + i * 15)}, 255, ${0.4 + i * 0.05})`;
      ctx.beginPath();
      ctx.arc(300 + i * 80, 400 + Math.sin(i) * 80, 50 + i * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Typography
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 54px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SquishPNG Sample', 600, 320);

    ctx.font = '500 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('High-Fidelity Offline PNG Compression with Alpha & Mesh Gradients', 600, 380);

    canvas.toBlob((blob) => {
      const sampleFile = new File([blob], 'SquishPNG-MeshGradient-Demo.png', { type: 'image/png' });
      this.app.addFiles([sampleFile]);
      this.showToast('Loaded Apple mesh gradient sample image', 'success');
    }, 'image/png');
  }
}

window.UIManager = UIManager;
