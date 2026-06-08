// js/members.js
// 全局成员记忆模块：记住所有用过的成员名称（跨账单）
// 存储在 localStorage key: jzb_members

const MEMBERS_KEY = 'jzb_members';

// 数据结构：[{ name: "小c", lastUsed: timestamp }, ...]

/**
 * 获取所有已记忆的成员（按最近使用排序）
 * @returns {Array<{name: string, lastUsed: number}>}
 */
export function getMembers() {
  try {
    return JSON.parse(localStorage.getItem(MEMBERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMembers(members) {
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
}

/**
 * 获取排序后的成员名称列表
 * @returns {string[]}
 */
export function getMemberNames() {
  return getMembers()
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .map(m => m.name);
}

/**
 * 添加成员（去重，已存在则更新 lastUsed）
 * @param {string} name
 */
export function addMember(name) {
  if (!name || !name.trim()) return;
  name = name.trim();
  const members = getMembers();
  const existing = members.find(m => m.name === name);
  if (existing) {
    existing.lastUsed = Date.now();
  } else {
    members.push({ name, lastUsed: Date.now() });
  }
  saveMembers(members);
}

/**
 * 批量添加成员
 * @param {string[]} names
 */
export function addMembers(names) {
  if (!names || !names.length) return;
  const members = getMembers();
  const now = Date.now();
  let changed = false;
  for (const name of names) {
    if (!name || !name.trim()) continue;
    const trimmed = name.trim();
    const existing = members.find(m => m.name === trimmed);
    if (existing) {
      existing.lastUsed = now;
    } else {
      members.push({ name: trimmed, lastUsed: now });
      changed = true;
    }
  }
  if (changed) saveMembers(members);
}

/**
 * 删除成员
 * @param {string} name
 */
export function removeMember(name) {
  const members = getMembers().filter(m => m.name !== name);
  saveMembers(members);
}

/**
 * 从所有账单同步成员名称
 * @param {Array} sessions
 */
export function syncFromSessions(sessions) {
  if (!sessions || !sessions.length) return;
  const members = getMembers();
  const now = Date.now();
  let changed = false;

  for (const session of sessions) {
    if (!session.names) continue;
    for (const name of Object.values(session.names)) {
      if (!name || !name.trim()) continue;
      const trimmed = name.trim();
      const existing = members.find(m => m.name === trimmed);
      if (existing) {
        existing.lastUsed = now;
      } else {
        members.push({ name: trimmed, lastUsed: now });
        changed = true;
      }
    }
  }

  if (changed) saveMembers(members);
}

/**
 * 更新成员最后使用时间
 * @param {string[]} names
 */
export function touchMembers(names) {
  if (!names || !names.length) return;
  const members = getMembers();
  const now = Date.now();
  let changed = false;
  for (const name of names) {
    const existing = members.find(m => m.name === name);
    if (existing) {
      existing.lastUsed = now;
      changed = true;
    }
  }
  if (changed) saveMembers(members);
}

/**
 * 检查是否有已记忆的成员
 * @returns {boolean}
 */
export function hasMembers() {
  return getMembers().length > 0;
}
