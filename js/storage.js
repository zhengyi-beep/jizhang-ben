const API = '/api/sessions';
const STORAGE_KEY = 'jzb_sessions';
let _cache = null;

// ─── 从服务器读取 ───

export async function getAllSessions() {
  try {
    const res = await fetch(API);
    if (res.ok) {
      const data = await res.json();
      _cache = data;
      // 同步到 localStorage 作为备份
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  // 降级：从 localStorage 读取
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export async function getSession(id) {
  const sessions = await getAllSessions();
  return sessions.find(s => s.id === id) || null;
}

export async function saveSession(session) {
  const sessions = await getAllSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await saveAll(sessions);
}

export async function deleteSession(id) {
  const sessions = (await getAllSessions()).filter(s => s.id !== id);
  await saveAll(sessions);
}

// ─── 内部：保存全部到服务器 ───

async function saveAll(sessions) {
  _cache = sessions;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessions)
    });
  } catch {
    // 离线时数据已在 localStorage，下次联网会以最后一次写入为准
  }
}

// ─── 工具函数（同步，不需要改） ───

export function createSession(title, peopleCount) {
  return {
    id: 's_' + Date.now(),
    title: title || '未命名账单',
    peopleCount: Math.max(2, peopleCount || 2),
    names: {},
    createdAt: new Date().toISOString(),
    expenses: []
  };
}

let _eid = 0;

export function createExpense(description, amount, paidBy, participants) {
  return {
    id: 'e_' + Date.now() + '_' + (++_eid),
    description: description || '消费',
    amount: parseFloat(amount) || 0,
    paidBy: parseInt(paidBy) || 1,
    participants: participants || []
  };
}
