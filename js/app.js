import { renderHistory } from './history.js';
import { renderCreate, renderSession } from './session.js';
import { renderSettle } from './settle.js';

// OCR 插件接口（预留，后续接入图片识别）
window.ocrPlugin = window.ocrPlugin || null;

const app = document.getElementById('app');

async function route() {
  const hash = location.hash || '#/';
  const parts = hash.replace('#/', '').split('/');

  // Clear global handlers
  window.showExpenseModal = null;
  window.editExpense = null;
  window.closeModal = null;
  window.deleteSessionConfirm = null;

  switch (parts[0]) {
    case '':
    case 'home':
      await renderHistory(app);
      break;
    case 'create':
      renderCreate(app);
      break;
    case 'session':
      if (parts[1]) await renderSession(app, parts[1]);
      break;
    case 'settle':
      if (parts[1]) await renderSettle(app, parts[1]);
      break;
    default:
      await renderHistory(app);
  }

  // Scroll to top on route change
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
