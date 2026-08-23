# SquishPNG — Pro Offline PNG Optimizer

> A minimalist, Apple-inspired offline web application to compress PNG images with professional fidelity and significant file size savings directly in your browser.

![SquishPNG Icon](icons/icon.svg)

---

## 🌟 Key Features

- **🍎 Apple-Inspired Glassmorphic UI**: VisionOS & macOS Sequoia aesthetic with SF Pro typography, smooth micro-interactions, responsive card layouts, and Dark/Light mode.
- **⚡ 100% Offline & Private**: Zero server uploads. All compression and processing occur entirely inside your browser using Web Workers, pure JavaScript, and WebAssembly.
- **💎 Lossless & Smart Quantization Modes**:
  - **Lossless (Bit-Exact)**: Preserves 100% bit-exact pixel fidelity while optimizing DEFLATE line filters and stripping redundant metadata chunks.
  - **Balanced (TinyPNG Style)**: 128-color intelligent perceptual quantization with Floyd-Steinberg dithering for **60% to 85% file size reductions**.
  - **Aggressive & Ultra**: 64-color and 32-color high-compression modes for graphics and web icons.
  - **Custom Mode**: Fine-grained sliders for palette color count (2–256), Floyd-Steinberg dither strength (0–100%), resolution downscaling (25%, 50%, 75%), and target max file size cap (KB).
- **🔬 Interactive Comparison Inspector**:
  - **Before vs After Split Slider**: Smooth drag bar to compare original and compressed results in real time.
  - **Pixel Difference Heatmap**: Highlights modified pixels and calculates exact delta percentages.
  - **Pan & Zoom**: Inspect fine details and transparency edges up to 800% magnification.
- **📦 Batch Processing & ZIP Export**:
  - Drag-and-drop multiple PNG files or paste directly from clipboard (`Ctrl+V` / `⌘V`).
  - Concurrent multi-threaded processing via background Web Worker pool.
  - Single-click **"Download All (.ZIP)"** powered by JSZip.
- **📱 Installable PWA**: Includes Service Worker caching (`sw.js`) and Web App Manifest (`manifest.json`) for standalone desktop/mobile installation.

---

## 🚀 Getting Started

Simply open `index.html` in any modern web browser (Safari, Chrome, Edge, Firefox, Brave):

```bash
# Double-click index.html or serve locally:
npx serve .
# or
python -m http.server 8080
```

---

## 📂 Project Architecture

```
├── index.html             # Main Apple-style UI markup
├── manifest.json          # PWA configuration
├── sw.js                  # Offline caching Service Worker
├── css/
│   └── style.css          # Cupertino design system & glassmorphism
├── js/
│   ├── app.js             # App coordinator, state & queue manager
│   ├── compressor.js      # Compressor engine & Web Worker pool
│   ├── worker.js          # Dedicated background compression thread
│   ├── compare.js         # Interactive split view, zoom/pan & pixel diff
│   ├── ui.js              # UI controller, drag & drop, toasts, modals
│   └── vendor/
│       ├── upng.min.js    # PNG encoder, decoder & neuquant engine
│       ├── pako.min.js    # High-performance DEFLATE / zlib
│       └── jszip.min.js   # Client-side ZIP archive generator
└── icons/
    └── icon.svg           # SquishPNG vector icon
```
