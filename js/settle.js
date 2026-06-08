import { getSession } from './storage.js';
import { calculateBalances, calculateSettlements, totalAmount } from './calculator.js';
import { getPersonName } from './session.js';

export async function renderSettle(container, sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">账单不存在</div></div>';
    return;
  }

  const total = totalAmount(session.expenses);
  const { owes, paid, net } = calculateBalances(session.expenses, session.peopleCount);
  const settlements = calculateSettlements(net);

  let html = `
    <div class="header">
      <button class="btn-icon" onclick="location.hash='#/session/${sessionId}'">←</button>
      <h1>结算结果</h1>
      <div style="width:36px"></div>
    </div>
    <div class="stats-card">
      <div class="stats-title">总消费</div>
      <div class="stats-value">¥${total.toFixed(2)}</div>
      <div class="stats-sub">${session.peopleCount}人 · 人均 ¥${(total / session.peopleCount).toFixed(2)}</div>
    </div>
  `;

  // Per-person summary
  html += `<div class="card"><div style="font-weight:600;font-size:15px;margin-bottom:12px">每人明细</div>`;
  for (let i = 1; i <= session.peopleCount; i++) {
    const balance = net[i] || 0;
    const label = balance > 0 ? '应收' : balance < 0 ? '应付' : '已清';
    const cls = balance > 0 ? 'summary-positive' : balance < 0 ? 'summary-negative' : '';
    const sign = balance > 0 ? '+' : '';
    html += `
      <div class="summary-row" onclick="togglePersonDetail(${i})" style="cursor:pointer">
        <span class="summary-label">${getPersonName(session, i)} ▸</span>
        <span class="summary-value ${cls}">${label} ${sign}¥${balance.toFixed(2)}</span>
      </div>
      <div id="person-detail-${i}" style="display:none"></div>
    `;
  }
  html += `</div>`;

  // Settlement plan
  if (settlements.length > 0) {
    html += `<div style="font-weight:600;font-size:15px;margin:16px 0 8px">最优转账方案</div>`;
    for (const s of settlements) {
      html += `
        <div class="settle-item">
          <span class="settle-from">${getPersonName(session, s.from)}</span>
          <span class="settle-arrow">→</span>
          <span class="settle-to">${getPersonName(session, s.to)}</span>
          <span class="settle-amount">¥${s.amount.toFixed(2)}</span>
        </div>
      `;
    }
  } else {
    html += `
      <div class="empty-state" style="padding:30px">
        <div class="empty-state-text">所有人已结清 🎉</div>
      </div>
    `;
  }

  // Share button
  html += `
    <div class="action-bar">
      <button class="btn btn-secondary" onclick="location.hash='#/session/${sessionId}'">返回账单</button>
      <button class="btn btn-primary" id="share-btn">📋 复制分享</button>
    </div>
  `;

  container.innerHTML = html;

  // Toggle per-person detail
  window.togglePersonDetail = (personId) => {
    const el = document.getElementById('person-detail-' + personId);
    if (!el) return;

    if (el.style.display !== 'none') {
      el.style.display = 'none';
      return;
    }

    // Compute detail
    const personExpenses = [];
    for (const e of session.expenses) {
      if (e.participants.includes(personId)) {
        const share = e.amount / e.participants.length;
        personExpenses.push({
          desc: e.description,
          total: e.amount,
          count: e.participants.length,
          share,
          isPayer: e.paidBy === personId
        });
      }
    }

    let detailHtml = '<div style="padding:8px 0 4px;font-size:13px">';
    detailHtml += `<div style="color:var(--text-secondary);margin-bottom:6px">参与了 ${personExpenses.length} 笔消费：</div>`;

    for (const pe of personExpenses) {
      const payerTag = pe.isPayer ? ' <span style="color:var(--primary);font-size:11px">[付款人]</span>' : '';
      detailHtml += `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border)">
          <span>${escapeHtml(pe.desc)}${payerTag} <span style="color:var(--text-secondary);font-size:12px">¥${pe.total.toFixed(2)}÷${pe.count}人</span></span>
          <span style="font-weight:500">¥${pe.share.toFixed(2)}</span>
        </div>
      `;
    }

    detailHtml += `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:600;font-size:14px;border-top:1px solid var(--border);margin-top:4px">
        <span>本人应付</span>
        <span>¥${owes[personId].toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)">
        <span>实际已付</span>
        <span>¥${paid[personId].toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary);padding-top:2px">
        <span>差额</span>
        <span>¥${paid[personId].toFixed(2)} - ¥${owes[personId].toFixed(2)} = ${net[personId] > 0 ? '+' : ''}¥${net[personId].toFixed(2)}</span>
      </div>
    `;
    detailHtml += '</div>';

    el.innerHTML = detailHtml;
    el.style.display = 'block';
  };

  document.getElementById('share-btn').onclick = () => {
    const text = generateShareText(session, total, net, owes, paid, settlements);
    copyToClipboard(text);
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function generateShareText(session, total, net, owes, paid, settlements) {
  let text = `📒 ${session.title}\n`;
  text += `总消费: ¥${total.toFixed(2)} · ${session.peopleCount}人参与\n`;
  text += `人均: ¥${(total / session.peopleCount).toFixed(2)}\n\n`;

  // 每人明细
  for (let i = 1; i <= session.peopleCount; i++) {
    const name = getPersonName(session, i);
    const balance = net[i] || 0;
    const label = balance > 0 ? '应收' : balance < 0 ? '应付' : '已清';

    text += `👤 ${name}\n`;

    // 参与的消费
    for (const e of session.expenses) {
      if (e.participants.includes(i)) {
        const share = e.amount / e.participants.length;
        const payerTag = e.paidBy === i ? ' [付]' : '';
        text += `  ${e.description} ¥${e.amount.toFixed(2)}÷${e.participants.length}人 → ¥${share.toFixed(2)}${payerTag}\n`;
      }
    }

    text += `  应付: ¥${owes[i].toFixed(2)} | 已付: ¥${paid[i].toFixed(2)} | ${label} ${balance > 0 ? '+' : ''}¥${balance.toFixed(2)}\n\n`;
  }

  // 转账方案
  if (settlements.length > 0) {
    text += `💰 转账方案:\n`;
    for (const s of settlements) {
      text += `  ${getPersonName(session, s.from)} → ${getPersonName(session, s.to)}: ¥${s.amount.toFixed(2)}\n`;
    }
  } else {
    text += `所有人已结清 🎉\n`;
  }

  text += `\n— 来自「记账本」AA分账`;
  return text;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板');
  }
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
