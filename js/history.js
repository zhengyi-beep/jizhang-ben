import { getAllSessions, deleteSession } from './storage.js';
import { totalAmount } from './calculator.js';
import { syncFromSessions } from './members.js';

export async function renderHistory(container) {
  const sessions = await getAllSessions();
  // 从已有账单同步成员到全局记忆
  syncFromSessions(sessions);

  let html = `
    <div class="header">
      <div>
        <h1>记账本</h1>
        <div class="header-subtitle">AA分账，轻松算清</div>
      </div>
    </div>
  `;

  if (sessions.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">📒</div>
        <div class="empty-state-text">还没有账单，创建一个试试吧</div>
        <button class="btn btn-primary" onclick="location.hash='#/create'">+ 新建账单</button>
      </div>
    `;
  } else {
    html += `<button class="btn btn-primary" style="margin-bottom:16px" onclick="location.hash='#/create'">+ 新建账单</button>`;

    for (const s of sessions) {
      const total = totalAmount(s.expenses);
      const date = new Date(s.createdAt).toLocaleDateString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      html += `
        <div class="card card-clickable" onclick="location.hash='#/session/${s.id}'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:600;font-size:15px">${escapeHtml(s.title)}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
                ${s.peopleCount}人 · ${s.expenses.length}笔消费 · ${date}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:600;font-size:16px">¥${total.toFixed(2)}</span>
              <button class="btn-icon" onclick="event.stopPropagation();deleteSessionConfirm('${s.id}')" title="删除">✕</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;

  window.deleteSessionConfirm = (id) => {
    if (confirm('确定删除这个账单吗？')) {
      deleteSession(id).then(() => renderHistory(container));
    }
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
