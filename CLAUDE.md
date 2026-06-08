# 记账本 - AA分账应用

## 项目简介
移动端优先的单页应用（SPA），用于多人 AA 分账。纯原生 HTML + CSS + JavaScript，无任何框架依赖。

## 技术栈
- 前端：原生 ES Modules（`type="module"`），Hash 路由（`#/`, `#/create`, `#/session/:id`, `#/settle/:id`）
- 后端：Node.js 原生 HTTP 服务器（`server.js`），端口 8080
- 数据存储：`data.json` 文件（服务器端）+ `localStorage`（客户端备份/离线降级、成员记忆持久化）
- 样式：CSS 变量主题系统，Apple 风格 UI

## 项目结构
```
index.html          入口页面
server.js           Node.js 静态文件服务器 + REST API
data.json           账单数据（JSON 数组）
css/style.css       全局样式
js/app.js           路由入口
js/storage.js       数据读写（API + localStorage 降级）
js/session.js       账单详情页 + 新建成页 + 添加/编辑消费弹窗 + 批量输入 + 截图识别弹窗 + 成员编辑弹窗
js/history.js       首页账单列表 + 成员记忆同步
js/settle.js        结算页 + 分享文本生成
js/calculator.js    AA 计算逻辑（余额、最优转账方案）
js/parser.js        批量文本解析 + 语音识别
js/members.js       全局成员记忆模块（localStorage 持久化，跨账单共享）
js/ocr.js           截图上传/粘贴/拖拽图片处理模块
```

## 启动方式
```bash
node server.js
# 浏览器访问 http://localhost:8080
```

## API 接口
- `GET /api/sessions` — 获取所有账单
- `POST /api/sessions` — 保存所有账单（全量覆盖）

## 编码规范
- 所有注释使用中文
- 所有用户界面文案使用中文
- 金额计算精确到小数点后两位（使用 `Math.round(n * 100) / 100`）
- 不引入任何第三方依赖或框架
- JS 模块之间通过 ES Module 的 import/export 交互
- 全局事件处理挂载在 `window` 上（如 `window.showExpenseModal`），路由切换时清理
- 弹窗内直接修改 session 时必须操作**深拷贝副本**，点击"保存"后才写回原对象，防止关闭弹窗不保存时污染数据

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
- 成员名称去重，`lastUsed` 用于排序（最近使用的排前面）
- 首页加载时自动从所有账单同步成员名称
- 新建账单/编辑成员/保存消费时自动录入

## 路由与页面功能

| 路由 | 页面 | 功能 |
|---|---|---|
| `#/` | 首页 | 账单列表、删除账单、自动同步成员记忆 |
| `#/create` | 新建账单 | 账单名称 + 成员 tag 输入、记忆池快速添加、成员管理入口 |
| `#/session/:id` | 账单详情 | 消费列表、📸截图识别、📝快速记账、+单条添加、✏️编辑成员、查看结算 |
| `#/settle/:id` | 结算结果 | 每人明细（可展开）、最优转账方案、📋复制分享 |

### 截图识别弹窗
- 支持点击上传、Ctrl+V 粘贴、拖拽上传图片
- 图片上方预览，下方手动对照输入消费文本
- 解析后每笔消费可逐项编辑描述、金额、付款人、参与人
- 每笔消费默认所有成员参与，可单独调整个别消费的付款人和参与人

### 成员编辑弹窗
- 支持修改名称、从记忆池添加成员、移除成员
- 移除成员时自动重编号并更新所有消费记录的 `paidBy` 和 `participants`
- 所有操作在深拷贝副本上进行，关闭弹窗不保存则不影响原数据

## 注意事项
- 人员编号从 1 开始（不是 0）
- `storage.js` 的保存策略是全量覆盖：每次 save 会把所有 sessions 一起 POST 到服务器
- 离线时数据存在 localStorage，联网后以最后一次写入为准（无冲突合并）
- 语音识别使用 Web Speech API（`SpeechRecognition`），仅部分浏览器支持
- `parser.js` 支持中文数字金额解析（如"十五块八"、"十块零八分"）
- 成员记忆存储在 `localStorage` key `jzb_members`，与账单数据 `jzb_sessions` 分开管理
- `ocr.js` 目前不执行真正的 OCR 文本识别，仅负责图片加载/预览；用户手动对照截图输入消费文本
