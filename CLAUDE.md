# 记账本 - AA分账应用

## 项目简介
移动端优先的单页应用（SPA），用于多人 AA 分账。纯原生 HTML + CSS + JavaScript，无任何框架依赖。

## 在线地址
部署在 Netlify（自动从 GitHub `master` 分支部署），`git push` 即更新。

## 技术栈
- **前端**：原生 ES Modules（`type="module"`），Hash 路由
- **后端**：Node.js 原生 HTTP 服务器（`server.js`），端口 8080 — 仅本地开发使用
- **OCR**：Tesseract.js v5（CDN 引入，`chi_sim` 简体中文），纯前端识别
- **数据存储**：
  - 本地开发：`data.json` 文件（服务端）
  - 线上使用：`localStorage`（`jzb_sessions`），Netlify 不提供后端
- **样式**：CSS 变量主题系统，支持亮色/暗色切换（`localStorage` key `jzb_theme`）
- **成员记忆**：`localStorage` key `jzb_members`，跨账单持久化

## 项目结构
```
index.html            入口页面（引入 Tesseract.js CDN）
server.js             Node.js 静态文件服务器 + REST API（仅本地开发）
data.json             账单数据（Git 忽略但不删除本地文件）
data.example.json     空数据模板（供克隆项目的人参考）
css/style.css         全局样式 + 主题变量（暗色默认）
js/app.js             路由入口（Hash 路由，清理全局 handler）
js/storage.js         数据读写（API 优先 → localStorage 降级）
js/session.js         新建账单 + 账单详情 + 所有弹窗（消费添加/编辑、截图识别、批量输入、成员编辑）
js/history.js         首页账单列表 + 主题切换按钮 + 成员同步
js/settle.js          结算结果 + 分享文本生成
js/calculator.js      AA 计算（余额、最优转账方案）
js/parser.js          批量文本解析 + 中文数字金额 + 语音识别
js/members.js         全局成员记忆（增删查、从账单同步、按 lastUsed 排序）
js/ocr.js             Tesseract.js OCR 封装（worker 复用、进度回调、图片预览）
```

## 启动方式（本地开发）
```bash
node server.js
# 浏览器访问 http://localhost:8080
```

## 部署方式
```bash
git push  # Netlify 自动从 master 部署
```

## API 接口（仅本地 server.js）
- `GET /api/sessions` — 获取所有账单
- `POST /api/sessions` — 保存所有账单（全量覆盖）

## 路由与页面

| 路由 | 页面 | 功能 |
|---|---|---|
| `#/` | 首页 | 账单列表、删除、主题切换（亮/暗）、成员同步 |
| `#/create` | 新建账单 | 账单名称 + 成员 tag 输入 + 记忆池快速添加 + 成员管理 |
| `#/session/:id` | 账单详情 | 消费列表 + 📸截图识别 + 📝快速记账 + +单条添加 + ✏️编辑成员 + 查看结算 |
| `#/settle/:id` | 结算结果 | 每人明细（可展开）+ 最优转账方案 + 📋复制分享 |

### 截图识别弹窗
- 上传/粘贴/拖拽截图 → 自动 OCR（Tesseract.js `chi_sim`）→ 进度条
- OCR 完成后文本填入 textarea → 用户可修正 → 点"解析预览"
- 解析后每笔消费可逐项编辑描述、金额、付款人、参与人
- 每笔默认全成员参与，可单独调整

### 成员编辑弹窗
- 修改名称、从记忆池添加成员、移除成员
- 移除时自动重编号 + 更新所有消费记录的 `paidBy` 和 `participants`
- 所有操作在深拷贝副本上进行，关闭不保存不影响原数据

## 数据结构

### 账单（Session）
```json
{
  "id": "s_时间戳",
  "title": "账单名称",
  "peopleCount": 2,
  "names": { "1": "小c", "2": "小y" },
  "createdAt": "ISO 时间",
  "expenses": [
    {
      "id": "e_时间戳_序号",
      "description": "描述",
      "amount": 20.00,
      "paidBy": 1,
      "participants": [1, 2]
    }
  ]
}
```

### 全局成员记忆（localStorage key: `jzb_members`）
```json
[
  { "name": "小c", "lastUsed": 1780836817128 },
  { "name": "小y", "lastUsed": 1780247886894 }
]
```
- 名称去重，`lastUsed` 排序（最近使用排前面）
- 首页加载时从所有账单同步、新建/编辑/保存时自动录入

### 主题偏好（localStorage key: `jzb_theme`）
```
"dark" | "light"
```
- 未设置时跟随系统 `prefers-color-scheme`

## 编码规范
- 注释、UI 文案全部中文
- 金额精确到小数点后两位（`Math.round(n * 100) / 100`）
- 零第三方框架，CDN 引入仅 Tesseract.js
- ES Module import/export 交互
- 全局事件挂在 `window`，路由切换时清理
- 弹窗内修改 session 必须用深拷贝副本，点击保存后才写回原对象
- 人员编号从 **1** 开始（不是 0）

## 注意事项
- `storage.js` 全量覆盖保存；离线时数据在 localStorage，联网后最后一次写入为准
- 语音识别用 Web Speech API（`SpeechRecognition`），仅部分浏览器支持
- `parser.js` 支持中文数字金额（"十五块八"、"十块零八分" 等）
- `ocr.js` 首次使用时下载中文语言包（~10MB），之后浏览器缓存 + worker 复用
- Netlify 部署下 `server.js` 不运行，数据纯 localStorage，每人数据独立
- `data.json` 在 `.gitignore` 中，不会被推送到 GitHub
- `.claude/` 目录也在 `.gitignore` 中
