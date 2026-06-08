// js/ocr.js
// 截图识别模块：Tesseract.js OCR 引擎封装
// 支持上传/粘贴/拖拽图片 → 自动提取文字
// Tesseract 通过 index.html CDN 引入，挂载在 window.Tesseract

let _worker = null;
let _workerBusy = false;

/**
 * 初始化 OCR Worker（懒加载，首次创建后缓存复用）
 * @param {function} onProgress - 进度回调 ({ status, progress })
 * @returns {Promise<Tesseract.Worker>}
 */
async function initOCRWorker(onProgress) {
  if (_worker) return _worker;

  _worker = await Tesseract.createWorker('chi_sim', 1, {
    logger: (m) => {
      if (onProgress) {
        let status = 'loading';
        if (m.status === 'loading tesseract core') status = 'loading-core';
        else if (m.status === 'loading language traineddata') status = 'loading-lang';
        else if (m.status === 'initializing api') status = 'init-api';
        else if (m.status === 'recognizing text') status = 'recognizing';
        onProgress({ status, progress: Math.round(m.progress * 100) });
      }
    }
  });

  return _worker;
}

/**
 * 使用 OCR 识别图片中的文字
 * @param {File|Blob|string} image - 图片文件、Blob 或 data URL
 * @param {function} onProgress - 进度回调 ({ status, progress })
 * @returns {Promise<string>} 识别出的文本
 */
export async function recognizeImage(image, onProgress) {
  if (_workerBusy) {
    throw new Error('OCR 引擎正忙，请等待当前识别完成');
  }

  _workerBusy = true;
  try {
    const worker = await initOCRWorker(onProgress);
    const result = await worker.recognize(image);
    return result.data.text || '';
  } finally {
    _workerBusy = false;
  }
}

/**
 * 终止 OCR Worker 释放内存
 */
export async function terminateOCR() {
  if (_worker) {
    try {
      await _worker.terminate();
    } catch {}
    _worker = null;
  }
}

/**
 * 创建图片的 data URL（用于预览）
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function readImageAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 处理粘贴板中的图片
 * @param {ClipboardEvent} event
 * @returns {File|null}
 */
export function getImageFromClipboard(event) {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

/**
 * 检查 OCR 引擎是否可用
 */
export function isOCRAvailable() {
  return !!(window.Tesseract);
}
