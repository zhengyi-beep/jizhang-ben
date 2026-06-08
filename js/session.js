import { getSession, saveSession, createSession, createExpense } from './storage.js';
import { totalAmount } from './calculator.js';
import { parseExpenses, isSpeechSupported, startSpeechRecognition } from './parser.js';
import { getMembers, getMemberNames, addMember, addMembers, removeMember, syncFromSessions, touchMembers } from './members.js';
import { readImageAsDataURL, recognizeImage } from './ocr.js';

export function getPersonName(session, id) {
  return (session.names && session.names[id]) || '人' + id;
}

// ─── 新建账单页面（成员 tag 选择） ───

let _newMembers = [];   // 当前新建账单的成员名列表
let _newNameInput = ''; // 输入缓存

export function renderCreate(container) {
  // 从记忆中加载成员池
  const knownMembers = getMemberNames();
  _newMembers = knownMembers.length >= 2 ? [...knownMembers] : ['', ''];

  renderCreateUI(container);
}

function renderCreateUI(container, errorMsg) {
  const knownMembers = getMemberNames();

  // 成员 tag 行
  let memberTagsHtml = '';
  _newMembers.forEach((name, idx) => {
    memberTagsHtml += `
      <div class="member-tag">
        <span class="member-tag-num">${idx + 1}</span>
        <input class="member-tag-input" data-idx="${idx}"
          value="${escapeHtml(name)}"
          placeholder="成员${idx + 1}"
          maxlength="10"
          onfocus="this.select()">
        <button class="member-tag-remove" data-idx="${idx}"
          onclick="removeNewMember(${idx})" title="移除">✕</button>
      </div>
    `;
  });

  // 记忆池（可快速添加的已知成员）
  let memoryPoolHtml = '';
  const unusedKnown = knownMembers.filter(n => !_newMembers.includes(n));
  if (unusedKnown.length > 0) {
    memoryPoolHtml = `
      <div class="memory-pool">
        <div class="memory-pool-label">常用成员（点击添加）</div>
        <div class="memory-pool-tags">
          ${unusedKnown.map(n => `
            <button class="memory-chip" onclick="addKnownMember('${escapeHtml(n)}')">+ ${escapeHtml(n)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 添加成员按钮
  const canAddMore = _newMembers.length < 20;

  container.innerHTML = `
    <div class="header">
      <button class="btn-icon" onclick="location.hash='#/'">←</button>
      <h1>新建账单</h1>
      <div style="width:36px"></div>
    </div>
    <div class="card">
      <div class="form-group">
        <label class="form-label">账单名称</label>
        <input class="form-input" id="session-title" placeholder="如：周五聚餐、周末旅行" maxlength="20">
      </div>

      <div class="form-group">
        <label class="form-label">
          参与成员
          <span style="font-weight:400;color:var(--text-secondary);font-size:13px">
            （${_newMembers.length}人）
          </span>
        </label>
        <div class="member-tags" id="member-tags">
          ${memberTagsHtml}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          ${canAddMore ? '<button class="btn btn-secondary btn-small" onclick="addNewMemberSlot()">+ 添加成员</button>' : ''}
          ${_newMembers.length > 2 ? `<button class="btn btn-secondary btn-small" style="background:var(--danger-light);color:var(--danger)" onclick="removeLastMember()">− 移除最后</button>` : ''}
        </div>
      </div>

      ${memoryPoolHtml}

      ${errorMsg ? `<div class="form-error" style="color:var(--danger);font-size:13px;margin-bottom:8px">${errorMsg}</div>` : ''}

      <button class="btn btn-primary" id="create-btn">创建账单</button>
    </div>
    ${knownMembers.length > 0 ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:500;font-size:14px">🗂️ 管理常用成员</span>
          <button class="btn btn-secondary btn-small" onclick="showMemberManager()">管理</button>
        </div>
      </div>
    ` : ''}
  `;

  // 绑定输入事件
  document.querySelectorAll('.member-tag-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      _newMembers[idx] = e.target.value.trim();
    });
    input.addEventListener('blur', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      _newMembers[idx] = e.target.value.trim();
      // 刷新以更新记忆池
      if (_newMembers[idx]) {
        renderCreateUI(container);
      }
    });
  });

  document.getElementById('create-btn').onclick = async () => {
    const title = document.getElementById('session-title').value.trim();
    // 同步最新输入
    document.querySelectorAll('.member-tag-input').forEach(input => {
      _newMembers[parseInt(input.dataset.idx)] = input.value.trim();
    });

    // 过滤空名称
    const names = _newMembers.map((n, i) => n || `人${i + 1}`);
    if (names.filter(n => n).length < 2) {
      renderCreateUI(container, '请至少填写2个成员');
      return;
    }

    const session = createSession(title, names.length);
    // 存储名称映射
    session.names = {};
    names.forEach((n, i) => {
      if (n) session.names[i + 1] = n;
    });

    // 记住所有成员
    addMembers(names.filter(n => n && !n.startsWith('人')));

    await saveSession(session);
    location.hash = '#/session/' + session.id;
  };

  // 全局方法
  window.addNewMemberSlot = () => {
    _newMembers.push('');
    renderCreateUI(container);
  };

  window.removeNewMember = (idx) => {
    if (_newMembers.length <= 2) {
      renderCreateUI(container, '至少需要2个成员');
      return;
    }
    _newMembers.splice(idx, 1);
    renderCreateUI(container);
  };

  window.removeLastMember = () => {
    if (_newMembers.length <= 2) {
      renderCreateUI(container, '至少需要2个成员');
      return;
    }
    _newMembers.pop();
    renderCreateUI(container);
  };

  window.addKnownMember = (name) => {
    if (_newMembers.length >= 20) return;
    // 替换第一个空位，否则追加
    const emptyIdx = _newMembers.findIndex(n => !n);
    if (emptyIdx >= 0) {
      _newMembers[emptyIdx] = name;
    } else {
      _newMembers.push(name);
    }
    renderCreateUI(container);
  };

  window.showMemberManager = () => showMemberManager(container);
}

// ─── 常用成员管理器 ───

function showMemberManager(container) {
  const knownMembers = getMembers();
  const modalEl = document.getElementById('expense-modal');

  let listHtml = '';
  if (knownMembers.length === 0) {
    listHtml = '<div style="text-align:center;color:var(--text-secondary);padding:20px">还没有常用成员</div>';
  } else {
    knownMembers.sort((a, b) => b.lastUsed - a.lastUsed);
    for (const m of knownMembers) {
      listHtml += `
        <div class="member-manager-item">
          <span style="font-weight:500">${escapeHtml(m.name)}</span>
          <button class="btn btn-secondary btn-small" style="background:var(--danger-light);color:var(--danger)"
            onclick="deleteMemberManager('${escapeHtml(m.name)}')">删除</button>
        </div>
      `;
    }
  }

  modalEl.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeMemberManager()">
      <div class="modal">
        <div class="header">
          <h1>常用成员管理</h1>
          <button class="btn-icon" onclick="closeMemberManager()">✕</button>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          常用成员会在新建账单时自动显示为候选
        </div>
        <div class="member-manager-list">${listHtml}</div>
        ${knownMembers.length > 0 ? `
          <button class="btn btn-danger" style="margin-top:12px;width:100%"
            onclick="clearAllMembers()">🗑️ 清空所有常用成员</button>
        ` : ''}
      </div>
    </div>
  `;

  window.closeMemberManager = () => { modalEl.innerHTML = ''; };
  window.deleteMemberManager = (name) => {
    removeMember(name);
    showMemberManager(container);
  };
  window.clearAllMembers = () => {
    if (confirm('确定清空所有常用成员吗？此操作不可撤销。')) {
      localStorage.removeItem('jzb_members');
      modalEl.innerHTML = '';
      renderCreateUI(container);
    }
  };
}

// ─── 账单详情页 ───

export async function renderSession(container, sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">账单不存在</div></div>';
    return;
  }

  const total = totalAmount(session.expenses);

  let html = `
    <div class="header">
      <button class="btn-icon" onclick="location.hash='#/'">←</button>
      <h1>${escapeHtml(session.title)}</h1>
      <div style="width:36px"></div>
    </div>
    <div class="stats-card">
      <div class="stats-title">总消费</div>
      <div class="stats-value">¥${total.toFixed(2)}</div>
      <div class="stats-sub">${session.peopleCount}人参与 · ${session.expenses.length}笔消费</div>
    </div>
  `;

  if (session.expenses.length > 0) {
    for (const e of session.expenses) {
      const participantsText = e.participants.map(p => getPersonName(session, p)).join('、');
      html += `
        <div class="expense-item" onclick="editExpense('${sessionId}','${e.id}')">
          <div class="expense-icon">💰</div>
          <div class="expense-info">
            <div class="expense-desc">${escapeHtml(e.description)}</div>
            <div class="expense-meta">${getPersonName(session, e.paidBy)}付款 · ${participantsText}参与</div>
          </div>
          <div class="expense-amount">¥${e.amount.toFixed(2)}</div>
        </div>
      `;
    }
  } else {
    html += `
      <div class="empty-state" style="padding:30px">
        <div class="empty-state-text">还没有消费记录</div>
      </div>
    `;
  }

  html += `
    <div class="action-bar" style="flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="showOCRModal('${sessionId}')">📸 截图识别</button>
      <button class="btn btn-secondary" onclick="showBatchModal('${sessionId}')">📝 快速记账</button>
      <button class="btn btn-secondary" onclick="showExpenseModal('${sessionId}')">+ 单条添加</button>
    </div>
    <div class="action-bar">
      <button class="btn btn-secondary" onclick="showEditNamesModal('${sessionId}')">✏️ 编辑成员</button>
      <button class="btn btn-primary" onclick="location.hash='#/settle/${sessionId}'" ${session.expenses.length === 0 ? 'disabled style="opacity:0.5"' : ''}>查看结算</button>
    </div>
    <div id="expense-modal"></div>
  `;

  container.innerHTML = html;

  window.showExpenseModal = (sid) => showExpenseModal(container, sid, null);
  window.showBatchModal = (sid) => showBatchModal(container, sid);
  window.showOCRModal = (sid) => showOCRModal(container, sid);
  window.showEditNamesModal = (sid) => showEditNamesModal(container, sid);
  window.editExpense = (sid, eid) => {
    getSession(sid).then(s => {
      const e = s.expenses.find(x => x.id === eid);
      if (e) showExpenseModal(container, sid, e);
    });
  };
}

// ─── 截图识别弹窗 ───

async function showOCRModal(container, sessionId) {
  const session = await getSession(sessionId);
  let imageDataUrl = null;
  let parsedItems = [];
  let recognition = null;

  // 构建参与者checkbox（默认全选）
  let participantChips = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    participantChips += `
      <label class="checkbox-item">
        <input type="checkbox" name="ocr-participant" value="${i}" checked>
        ${getPersonName(session, i)}
      </label>
    `;
  }

  // 构建付款人选项
  let paidOptions = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    paidOptions += `<option value="${i}">${getPersonName(session, i)}</option>`;
  }

  const modalEl = document.getElementById('expense-modal');
  modalEl.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeOCRModal()">
      <div class="modal" style="max-height:95vh">
        <div class="header">
          <h1>📸 截图识别</h1>
          <button class="btn-icon" onclick="closeOCRModal()">✕</button>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          上传或粘贴支付截图，对照图片手动输入消费明细
        </div>

        <!-- 图片预览区 -->
        <div id="ocr-image-area" style="margin-bottom:12px">
          <label for="ocr-file-input" style="display:block;cursor:pointer">
            <div id="ocr-drop-zone" style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;transition:all 0.15s">
              <div style="font-size:32px;margin-bottom:8px">🖼️</div>
              <div style="font-weight:500;font-size:14px">点击上传截图</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                支持粘贴图片（Ctrl+V）或点击上传
              </div>
              <input type="file" id="ocr-file-input" accept="image/*" style="display:none"
                onchange="handleOCRFileSelect(event)">
            </div>
          </label>
          <div id="ocr-image-preview" style="display:none;margin-top:8px;position:relative">
            <img id="ocr-preview-img" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;border:1px solid var(--border)">
            <button class="btn btn-secondary btn-small" style="position:absolute;top:4px;right:4px"
              onclick="clearOCRImage()">✕ 清除</button>
          </div>
        </div>

        <!-- 手动输入区 -->
        <div class="form-group">
          <div class="form-group">
            <label class="form-label">识别结果（可修改）</label>
            <div style="position:relative">
              <textarea class="form-input" id="ocr-input" rows="3"
                placeholder="上传图片后自动识别，或手动输入..."
                style="resize:none;padding-right:${isSpeechSupported() ? '50px' : '14px'}"></textarea>
              ${isSpeechSupported() ? `
                <div style="position:absolute;right:8px;bottom:8px">
                  <button class="btn btn-secondary btn-small" id="ocr-voice-btn" type="button">🎤</button>
                </div>
              ` : ''}
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:-8px;margin-bottom:12px">
            格式：描述+金额，空格/逗号分隔。如"吃饭10 喝水5 打车30"
          </div>
        </div>

        <!-- OCR 进度条 -->
        <div id="ocr-progress" style="display:none;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span id="ocr-progress-text" style="font-size:12px;color:var(--text-secondary)">准备中...</span>
          </div>
          <div class="ocr-progress-track">
            <div class="ocr-progress-bar" id="ocr-progress-bar" style="width:0%"></div>
          </div>
        </div>

        <button class="btn btn-primary" id="ocr-parse-btn" style="margin-bottom:12px">🔍 解析预览</button>
        <div id="ocr-preview"></div>
      </div>
    </div>
  `;

  // 语音按钮
  const voiceBtn = document.getElementById('ocr-voice-btn');
  if (voiceBtn) {
    voiceBtn.onclick = () => {
      if (recognition) {
        recognition.stop();
        recognition = null;
        voiceBtn.textContent = '🎤';
        voiceBtn.style.background = '';
        return;
      }
      voiceBtn.textContent = '⏹';
      voiceBtn.style.background = 'var(--danger-light)';
      voiceBtn.style.color = 'var(--danger)';

      recognition = startSpeechRecognition(
        (text) => { document.getElementById('ocr-input').value = text; },
        () => { voiceBtn.textContent = '🎤'; voiceBtn.style.background = ''; voiceBtn.style.color = ''; recognition = null; },
        (err) => { showToast('语音识别出错: ' + err); voiceBtn.textContent = '🎤'; voiceBtn.style.background = ''; voiceBtn.style.color = ''; recognition = null; }
      );
    };
  }

  // 文件选择
  window.handleOCRFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) await loadOCRImage(file);
  };

  // 粘贴事件
  const pasteHandler = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        await loadOCRImage(file);
        return;
      }
    }
  };
  document.addEventListener('paste', pasteHandler);
  window._ocrPasteHandler = pasteHandler;

  // 拖拽
  const dropZone = document.getElementById('ocr-drop-zone');
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; dropZone.style.background = 'var(--primary-light)'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = ''; dropZone.style.background = ''; };
  dropZone.ondrop = async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await loadOCRImage(file);
    }
  };

  async function loadOCRImage(file) {
    imageDataUrl = await readImageAsDataURL(file);
    document.getElementById('ocr-drop-zone').style.display = 'none';
    const preview = document.getElementById('ocr-image-preview');
    preview.style.display = 'block';
    document.getElementById('ocr-preview-img').src = imageDataUrl;

    // 显示进度条
    const progressEl = document.getElementById('ocr-progress');
    const progressBar = document.getElementById('ocr-progress-bar');
    const progressText = document.getElementById('ocr-progress-text');
    progressEl.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '正在下载中文语言包...';

    try {
      const text = await recognizeImage(file, ({ status, progress }) => {
        progressBar.style.width = progress + '%';
        if (status === 'loading-core') {
          progressText.textContent = '正在加载识别引擎...';
        } else if (status === 'loading-lang') {
          progressText.textContent = '正在下载中文语言包... ' + progress + '%';
        } else if (status === 'init-api') {
          progressText.textContent = '正在初始化...';
        } else if (status === 'recognizing') {
          progressText.textContent = '正在识别文字... ' + progress + '%';
        }
      });

      // OCR 完成
      progressBar.style.width = '100%';
      progressText.textContent = '识别完成 ✅';
      document.getElementById('ocr-input').value = text;

      // 1.5 秒后淡出进度条
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 1500);
    } catch (err) {
      progressText.textContent = '识别失败: ' + (err.message || '未知错误');
      progressBar.style.background = 'var(--danger)';
      console.error('OCR 识别出错:', err);
    }
  }

  window.clearOCRImage = () => {
    imageDataUrl = null;
    document.getElementById('ocr-drop-zone').style.display = '';
    document.getElementById('ocr-image-preview').style.display = 'none';
    document.getElementById('ocr-preview-img').src = '';
    document.getElementById('ocr-file-input').value = '';
    document.getElementById('ocr-input').value = '';
    const progressEl = document.getElementById('ocr-progress');
    if (progressEl) {
      progressEl.style.display = 'none';
      document.getElementById('ocr-progress-bar').style.width = '0%';
      document.getElementById('ocr-progress-bar').style.background = '';
    }
  };

  // 解析按钮
  document.getElementById('ocr-parse-btn').onclick = () => {
    const text = document.getElementById('ocr-input').value.trim();
    if (!text) { showToast('请输入消费内容'); return; }

    parsedItems = parseExpenses(text);
    if (parsedItems.length === 0) { showToast('未能识别出消费项，请检查格式'); return; }

    renderOCRPreview(session);
  };

  function renderOCRPreview(session) {
    let previewHtml = `<div style="font-weight:600;font-size:14px;margin-bottom:8px">识别到 ${parsedItems.length} 项消费（可逐项编辑）：</div>`;

    parsedItems.forEach((item, idx) => {
      // 每项的付款人选项
      let itemPayerOpts = '';
      for (let i = 1; i <= session.peopleCount; i++) {
        const sel = i === 1 ? 'selected' : '';
        itemPayerOpts += `<option value="${i}" ${sel}>${getPersonName(session, i)}</option>`;
      }

      // 每项的参与者选项
      let itemParticipantChips = '';
      for (let i = 1; i <= session.peopleCount; i++) {
        itemParticipantChips += `
          <label class="checkbox-item checkbox-item-sm">
            <input type="checkbox" name="ocr-item-participant-${idx}" value="${i}" checked>
            ${getPersonName(session, i)}
          </label>
        `;
      }

      previewHtml += `
        <div class="ocr-preview-item" style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--bg)">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <span style="font-weight:600;font-size:13px;color:var(--text-secondary);min-width:20px">#${idx + 1}</span>
            <input class="form-input ocr-item-desc" data-idx="${idx}"
              value="${escapeHtml(item.description)}" placeholder="描述"
              style="flex:1;padding:6px 10px;font-size:14px">
            <input class="form-input ocr-item-amount" data-idx="${idx}"
              type="number" step="0.01" min="0"
              value="${item.amount.toFixed(2)}"
              style="width:90px;padding:6px 10px;font-size:14px;text-align:right" inputmode="decimal">
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--text-secondary);white-space:nowrap">付款人</span>
            <select class="form-input ocr-item-payer" data-idx="${idx}"
              style="width:auto;padding:4px 28px 4px 8px;font-size:12px">${itemPayerOpts}</select>
            <span style="font-size:11px;color:var(--text-secondary);margin-left:8px;white-space:nowrap">参与人</span>
            <div class="checkbox-group" style="gap:2px">${itemParticipantChips}</div>
          </div>
        </div>
      `;
    });

    // 合计
    const totalParsed = parsedItems.reduce((s, i) => s + i.amount, 0);
    previewHtml += `
      <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:600;font-size:15px">
        <span>合计</span>
        <span style="color:var(--primary)">¥${totalParsed.toFixed(2)}</span>
      </div>
      <button class="btn btn-primary" id="ocr-confirm-btn">✓ 确认添加 ${parsedItems.length} 笔</button>
    `;

    document.getElementById('ocr-preview').innerHTML = previewHtml;

    document.getElementById('ocr-confirm-btn').onclick = () => {
      // 读取每项的编辑后数据
      const descInputs = document.querySelectorAll('.ocr-item-desc');
      const amountInputs = document.querySelectorAll('.ocr-item-amount');
      const payerSelects = document.querySelectorAll('.ocr-item-payer');

      for (let idx = 0; idx < parsedItems.length; idx++) {
        const desc = descInputs[idx]?.value?.trim() || parsedItems[idx].description;
        const amount = parseFloat(amountInputs[idx]?.value) || parsedItems[idx].amount;
        const paidBy = parseInt(payerSelects[idx]?.value) || 1;

        const participants = Array.from(
          document.querySelectorAll(`input[name="ocr-item-participant-${idx}"]:checked`)
        ).map(el => parseInt(el.value));

        if (participants.length === 0) {
          showToast(`第${idx + 1}项"${desc}"至少需要一个参与者`);
          return;
        }

        if (!amount || amount <= 0) {
          showToast(`第${idx + 1}项"${desc}"金额无效`);
          return;
        }

        session.expenses.push(createExpense(desc, amount, paidBy, participants));
      }

      saveSession(session).then(() => {
        if (recognition) { recognition.stop(); recognition = null; }
        if (window._ocrPasteHandler) {
          document.removeEventListener('paste', window._ocrPasteHandler);
          window._ocrPasteHandler = null;
        }
        modalEl.innerHTML = '';
        renderSession(container, sessionId);
        showToast(`已添加 ${parsedItems.length} 笔消费`);
      });
    };
  }

  window.closeOCRModal = () => {
    if (recognition) { recognition.stop(); recognition = null; }
    if (window._ocrPasteHandler) {
      document.removeEventListener('paste', window._ocrPasteHandler);
      window._ocrPasteHandler = null;
    }
    modalEl.innerHTML = '';
  };
}

// ─── 批量输入弹窗 ───

async function showBatchModal(container, sessionId) {
  const session = await getSession(sessionId);
  let parsedItems = [];
  let recognition = null;

  let paidOptions = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    paidOptions += `<option value="${i}">${getPersonName(session, i)}</option>`;
  }

  let participantChips = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    participantChips += `
      <label class="checkbox-item">
        <input type="checkbox" name="batch-participant" value="${i}" checked>
        ${getPersonName(session, i)}
      </label>
    `;
  }

  const modalEl = document.getElementById('expense-modal');
  modalEl.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeBatchModal()">
      <div class="modal">
        <div class="header">
          <h1>快速记账</h1>
          <button class="btn-icon" onclick="closeBatchModal()">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">输入消费（自动识别多项）</label>
          <div style="position:relative">
            <textarea class="form-input" id="batch-input" rows="3"
              placeholder="如：吃饭10 喝水5 洗澡80 住宿20"
              style="resize:none;padding-right:${isSpeechSupported() ? '50px' : '14px'}"></textarea>
            <div style="position:absolute;right:8px;bottom:8px;display:flex;gap:4px">
              ${isSpeechSupported() ? '<button class="btn btn-secondary btn-small" id="voice-btn" type="button">🎤</button>' : ''}
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
            格式：描述+金额，空格/逗号分隔。如"吃饭10 喝水5 打车30"
          </div>
        </div>
        <button class="btn btn-primary" id="parse-btn" style="margin-bottom:12px">🔍 解析预览</button>
        <div id="batch-preview"></div>
      </div>
    </div>
  `;

  const voiceBtn = document.getElementById('voice-btn');
  if (voiceBtn) {
    voiceBtn.onclick = () => {
      if (recognition) {
        recognition.stop();
        recognition = null;
        voiceBtn.textContent = '🎤';
        voiceBtn.style.background = '';
        return;
      }
      voiceBtn.textContent = '⏹';
      voiceBtn.style.background = 'var(--danger-light)';
      voiceBtn.style.color = 'var(--danger)';

      recognition = startSpeechRecognition(
        (text) => { document.getElementById('batch-input').value = text; },
        () => { voiceBtn.textContent = '🎤'; voiceBtn.style.background = ''; voiceBtn.style.color = ''; recognition = null; },
        (err) => { showToast('语音识别出错: ' + err); voiceBtn.textContent = '🎤'; voiceBtn.style.background = ''; voiceBtn.style.color = ''; recognition = null; }
      );
    };
  }

  document.getElementById('parse-btn').onclick = () => {
    const text = document.getElementById('batch-input').value.trim();
    if (!text) { showToast('请输入消费内容'); return; }

    parsedItems = parseExpenses(text);
    if (parsedItems.length === 0) { showToast('未能识别出消费项，请检查格式'); return; }

    let previewHtml = `<div style="font-weight:600;font-size:14px;margin-bottom:8px">识别到 ${parsedItems.length} 项消费：</div>`;
    let totalParsed = 0;
    parsedItems.forEach((item) => {
      totalParsed += item.amount;
      previewHtml += `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:14px">${escapeHtml(item.description)}</span>
          <span style="font-weight:600">¥${item.amount.toFixed(2)}</span>
        </div>
      `;
    });
    previewHtml += `
      <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:600;font-size:15px">
        <span>合计</span>
        <span style="color:var(--primary)">¥${totalParsed.toFixed(2)}</span>
      </div>
      <div class="form-group">
        <label class="form-label">谁付的款（统一）</label>
        <select class="form-input" id="batch-payer">${paidOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">谁参与了（默认全选）</label>
        <div class="checkbox-group">${participantChips}</div>
      </div>
      <button class="btn btn-primary" id="batch-confirm-btn">✓ 确认添加 ${parsedItems.length} 笔</button>
    `;

    document.getElementById('batch-preview').innerHTML = previewHtml;

    document.getElementById('batch-confirm-btn').onclick = () => {
      const paidBy = parseInt(document.getElementById('batch-payer').value);
      const participants = Array.from(document.querySelectorAll('input[name="batch-participant"]:checked'))
        .map(el => parseInt(el.value));

      if (participants.length === 0) { showToast('请至少选择一个参与者'); return; }

      for (const item of parsedItems) {
        session.expenses.push(createExpense(item.description, item.amount, paidBy, participants));
      }

      saveSession(session).then(() => {
        if (recognition) { recognition.stop(); recognition = null; }
        modalEl.innerHTML = '';
        renderSession(container, sessionId);
        showToast(`已添加 ${parsedItems.length} 笔消费`);
      });
    };
  };

  window.closeBatchModal = () => {
    if (recognition) { recognition.stop(); recognition = null; }
    modalEl.innerHTML = '';
  };
}

// ─── 单条添加/编辑弹窗 ───

async function showExpenseModal(container, sessionId, existingExpense) {
  const session = await getSession(sessionId);
  const isEdit = !!existingExpense;
  const expense = existingExpense || { description: '', amount: '', paidBy: 1, participants: Array.from({length: session.peopleCount}, (_, i) => i + 1) };

  let checkboxesHtml = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    const checked = expense.participants.includes(i) ? 'checked' : '';
    checkboxesHtml += `
      <label class="checkbox-item">
        <input type="checkbox" name="participant" value="${i}" ${checked}>
        ${getPersonName(session, i)}
      </label>
    `;
  }

  let paidOptions = '';
  for (let i = 1; i <= session.peopleCount; i++) {
    const selected = expense.paidBy === i ? ' selected' : '';
    paidOptions += `<option value="${i}"${selected}>${getPersonName(session, i)}</option>`;
  }

  const modalEl = document.getElementById('expense-modal');
  modalEl.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="header">
          <h1>${isEdit ? '编辑消费' : '添加消费'}</h1>
          <button class="btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">金额（元）</label>
          <input class="form-input" id="expense-amount" type="number" step="0.01" min="0" placeholder="0.00" value="${expense.amount}" inputmode="decimal">
        </div>
        <div class="form-group">
          <label class="form-label">描述（选填）</label>
          <input class="form-input" id="expense-desc" placeholder="如：火锅、打车" value="${escapeHtml(expense.description)}" maxlength="20">
        </div>
        <div class="form-group">
          <label class="form-label">谁付的款</label>
          <select class="form-input" id="expense-payer">${paidOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">谁参与了（默认全选）</label>
          <div class="checkbox-group" id="expense-participants">${checkboxesHtml}</div>
        </div>
        <button class="btn btn-primary" id="save-expense-btn">${isEdit ? '保存修改' : '添加'}</button>
        ${isEdit ? '<button class="btn btn-danger" style="margin-top:8px;width:100%" id="delete-expense-btn">删除此消费</button>' : ''}
      </div>
    </div>
  `;

  document.getElementById('save-expense-btn').onclick = () => {
    const amount = parseFloat(document.getElementById('expense-amount').value);
    if (!amount || amount <= 0) {
      showToast('请输入有效金额');
      return;
    }

    const desc = document.getElementById('expense-desc').value.trim();
    const paidBy = parseInt(document.getElementById('expense-payer').value);
    const participants = Array.from(document.querySelectorAll('#expense-participants input:checked'))
      .map(el => parseInt(el.value));

    if (participants.length === 0) {
      showToast('请至少选择一个参与者');
      return;
    }

    if (isEdit) {
      const exp = session.expenses.find(e => e.id === existingExpense.id);
      if (exp) {
        exp.description = desc || '消费';
        exp.amount = amount;
        exp.paidBy = paidBy;
        exp.participants = participants;
      }
    } else {
      session.expenses.push(createExpense(desc, amount, paidBy, participants));
    }

    saveSession(session).then(() => {
      closeModal();
      renderSession(container, sessionId);
    });
  };

  if (isEdit) {
    const deleteBtn = document.getElementById('delete-expense-btn');
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        session.expenses = session.expenses.filter(e => e.id !== existingExpense.id);
        saveSession(session).then(() => {
          closeModal();
          renderSession(container, sessionId);
        });
      };
    }
  }

  window.closeModal = () => {
    modalEl.innerHTML = '';
  };
}

// ─── 编辑成员名称弹窗（支持增删 + 记忆池） ───

async function showEditNamesModal(container, sessionId) {
  const session = await getSession(sessionId);
  if (!session.names) session.names = {};

  // 深拷贝 names 和 expenses 用于编辑（关闭不保存时不影响原数据）
  let editNames = {};
  for (let i = 1; i <= session.peopleCount; i++) {
    editNames[i] = session.names[i] || '';
  }
  let editPeopleCount = session.peopleCount;
  // 深拷贝 expenses
  let editExpenses = session.expenses.map(e => ({
    ...e,
    participants: [...e.participants]
  }));

  function getEditNames() { return editNames; }
  function setEditNames(n) { editNames = n; }
  function getEditPeopleCount() { return editPeopleCount; }
  function setEditPeopleCount(n) { editPeopleCount = n; }
  function getEditExpenses() { return editExpenses; }
  function setEditExpenses(e) { editExpenses = e; }

  // 常用的不在当前账单中的成员
  const knownMembers = getMemberNames();
  const currentNames = [];
  for (let i = 1; i <= editPeopleCount; i++) {
    currentNames.push(editNames[i] || '');
  }
  const unusedKnown = knownMembers.filter(n => !currentNames.includes(n));

  renderEditNamesUI(container, unusedKnown);

  function renderEditNamesUI(container, unusedKnown) {
    let fieldsHtml = '';
    for (let i = 1; i <= editPeopleCount; i++) {
      fieldsHtml += `
        <div class="member-tag" style="margin-bottom:8px">
          <span class="member-tag-num">${i}</span>
          <input class="member-tag-input name-field" data-id="${i}"
            value="${escapeHtml(editNames[i] || '')}"
            placeholder="人${i}"
            maxlength="10"
            onfocus="this.select()">
          ${editPeopleCount > 2 ? `<button class="member-tag-remove" data-idx="${i}" onclick="removeSessionMember(${i})" title="移除此成员">✕</button>` : ''}
        </div>
      `;
    }

    let memoryPoolHtml = '';
    if (unusedKnown.length > 0) {
      memoryPoolHtml = `
        <div class="memory-pool" style="margin-bottom:12px">
          <div class="memory-pool-label">点击添加常用成员</div>
          <div class="memory-pool-tags">
            ${unusedKnown.map(n => `
              <button class="memory-chip" onclick="addMemberToSession('${escapeHtml(n)}')">+ ${escapeHtml(n)}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    const modalEl = document.getElementById('expense-modal');
    modalEl.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeNamesModal()">
        <div class="modal">
          <div class="header">
            <h1>编辑成员</h1>
            <button class="btn-icon" onclick="closeNamesModal()">✕</button>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
            修改名称、添加或移除成员。保存后会自动记录为常用成员。
          </div>
          ${memoryPoolHtml}
          <div id="edit-names-fields">${fieldsHtml}</div>
          <div style="display:flex;gap:8px;margin-bottom:16px">
            ${editPeopleCount < 20 ? '<button class="btn btn-secondary btn-small" onclick="addMemberToSession(\'\')">+ 添加成员</button>' : ''}
          </div>
          <button class="btn btn-primary" id="save-names-btn">保存</button>
        </div>
      </div>
    `;

    document.getElementById('save-names-btn').onclick = () => {
      const fields = document.querySelectorAll('.name-field');
      const names = {};
      fields.forEach(f => {
        const id = f.dataset.id;
        const name = f.value.trim();
        if (name) names[id] = name;
      });

      // 检查是否有空名
      const filledCount = Object.keys(names).length;
      if (filledCount < 2) {
        showToast('请至少填写2个成员名称');
        return;
      }

      // 从输入中更新 editNames
      for (const [k, v] of Object.entries(names)) {
        editNames[k] = v;
      }

      // 应用变更到真实 session
      session.peopleCount = editPeopleCount;
      session.names = editNames;
      session.expenses = editExpenses;

      // 同步到全局记忆
      addMembers(Object.values(editNames).filter(Boolean));

      saveSession(session).then(() => {
        modalEl.innerHTML = '';
        renderSession(container, session.id);
        showToast('成员信息已更新');
      });
    };

    // 添加成员到账单
    window.addMemberToSession = (name) => {
      if (editPeopleCount >= 20) return;
      editPeopleCount++;
      editNames[editPeopleCount] = name;
      // 刷新 UI
      const cur = [];
      for (let i = 1; i <= editPeopleCount; i++) cur.push(editNames[i] || '');
      const updatedUnused = getMemberNames().filter(n => !cur.includes(n));
      renderEditNamesUI(container, updatedUnused);
    };

    // 移除账单成员
    window.removeSessionMember = (id) => {
      if (editPeopleCount <= 2) {
        showToast('至少需要2个成员');
        return;
      }
      const idNum = parseInt(id);
      // 重新编号：删除后后面的编号前移
      const newNames = {};
      let newIdx = 1;
      for (let i = 1; i <= editPeopleCount; i++) {
        if (i === idNum) continue;
        newNames[newIdx] = editNames[i] || '';
        newIdx++;
      }
      editPeopleCount = newIdx - 1;
      editNames = newNames;

      // 也更新消费记录中的人员引用（在副本上操作）
      editExpenses = editExpenses.map(e => {
        let newPaidBy = e.paidBy;
        if (newPaidBy === idNum) newPaidBy = 1;
        else if (newPaidBy > idNum) newPaidBy--;

        let newParticipants = e.participants
          .filter(p => p !== idNum)
          .map(p => p > idNum ? p - 1 : p);
        if (newParticipants.length === 0) newParticipants = [1];

        return { ...e, paidBy: newPaidBy, participants: newParticipants };
      });

      const cur = [];
      for (let i = 1; i <= editPeopleCount; i++) cur.push(editNames[i] || '');
      const updatedUnused = getMemberNames().filter(n => !cur.includes(n));
      renderEditNamesUI(container, updatedUnused);
    };

    window.closeNamesModal = () => {
      modalEl.innerHTML = '';
    };
  }
}

// ─── Toast 提示 ───

export function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
