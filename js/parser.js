/**
 * 解析批量消费文本
 * 支持格式: "吃饭10元喝水5块洗澡80住宿20"
 *          "吃饭 10 元，喝水 5 块，洗澡 80"
 *          "火锅320 打车60 奶茶15.5"
 * @param {string} text - 输入文本
 * @returns {Array<{description: string, amount: number}>}
 */
export function parseExpenses(text) {
  if (!text || !text.trim()) return [];

  // 预处理：清理自然语言中的干扰项
  text = preprocess(text);

  // 按逗号/换行/分号/句号拆分，逐段解析
  const lines = text.split(/[,，;；\n。、]+/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) {
    const results = [];
    for (const line of lines) {
      results.push(...parseOneLine(line));
    }
    return results.filter(e => e.amount > 0);
  }

  return parseOneLine(text.trim()).filter(e => e.amount > 0);
}

function preprocess(text) {
  return text;
}

function parseOneLine(text) {
  // 匹配金额，支持阿拉伯数字和中文数字:
  //   14, 6.3块, 10块08分, ¥320
  //   十块, 十块六, 11块五, 十八块四毛三, 十块零八分, 咖啡十五块八
  const amountRe = /[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[元块]\s*([一-鿿\d])?\s*(?:毛|角)?\s*(?:零?\s*([一-鿿\d])\s*分)?|[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*(?:[元块])?|[¥￥]?\s*([一二三四五六七八九十][一二三四五六七八九]?)\s*[元块]\s*(?:零?\s*([一二三四五六七八九])\s*分|([一二三四五六七八九])\s*(?:毛|角)?\s*([一二三四五六七八九])?)?/g;
  const matches = [];
  let m;

  while ((m = amountRe.exec(text)) !== null) {
    if (m[0].length === 0) { amountRe.lastIndex++; continue; }

    let value;
    if (m[1] !== undefined && m[1] !== '') {
      // 阿拉伯数字+块/元: 10块08分, 11块五, 320块
      value = parseFloat(m[1]);
      const mao = m[2] !== undefined ? chineseToNum(m[2]) : 0;
      const fen = m[3] !== undefined ? chineseToNum(m[3]) : 0;
      value = value + mao * 0.1 + fen * 0.01;
    } else if (m[5] !== undefined && m[5] !== '') {
      const major = chineseToNum(m[5]);
      const mao = m[7] !== undefined ? chineseToNum(m[7]) : 0;
      const fen = m[6] !== undefined ? chineseToNum(m[6]) : (m[8] !== undefined ? chineseToNum(m[8]) : 0);
      value = major + mao * 0.1 + fen * 0.01;
    } else if (m[4] !== undefined && m[4] !== '') {
      // 纯阿拉伯数字: 14, 6.3块, ¥320
      value = parseFloat(m[4]);
    } else {
      continue;
    }

    matches.push({ value: round2(value), index: m.index, length: m[0].length });
  }

  if (matches.length === 0) return [];

  const results = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const prevEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1].length;

    // 金额前面的文字作为描述（"吃饭10" 格式）
    let desc = cleanDesc(text.slice(prevEnd, cur.index));

    if (!desc && i === matches.length - 1) {
      // 末项没前置文字，用后面的文字（"¥320火锅" 格式）
      desc = cleanDesc(text.slice(cur.index + cur.length));
    }

    results.push({ description: desc, amount: cur.value });
  }

  // 回填：给没有描述的项分配后面的描述文字
  for (let i = 0; i < results.length; i++) {
    if (results[i].description) continue;
    const cur = matches[i];
    const nextStart = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const afterDesc = cleanDesc(text.slice(cur.index + cur.length, nextStart));
    results[i].description = afterDesc || '消费';
  }

  return results;
}

function cleanDesc(text) {
  return text.replace(/[¥￥\d\s,，、.。]+/g, '').replace(/元|块|分|角/g, '').trim();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const CN_DIGIT = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };

function chineseToNum(s) {
  if (!s) return 0;
  if (CN_DIGIT[s]) return CN_DIGIT[s];
  // 十X → 10+X, 二十 → 20, etc.
  if (s.length === 2) {
    const a = CN_DIGIT[s[0]], b = CN_DIGIT[s[1]];
    if (a === 10 && b) return 10 + b;   // 十一~十九
    if (a && b === 10) return a * 10;    // 二十, 三十...
  }
  return parseInt(s) || 0;
}

/**
 * 检测浏览器是否支持语音输入
 */
export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 创建语音识别实例并开始录音
 * @param {function} onResult - 识别结果回调 (text: string)
 * @param {function} onEnd - 识别结束回调
 * @param {function} onError - 错误回调 (error: string)
 * @returns {object} recognition 实例，调用 .stop() 停止
 */
export function startSpeechRecognition(onResult, onEnd, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError && onError('浏览器不支持语音识别');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalText = '';
    for (let i = 0; i < event.results.length; i++) {
      finalText += event.results[i][0].transcript;
    }
    onResult && onResult(finalText, event.results[event.results.length - 1].isFinal);
  };

  recognition.onerror = (event) => {
    onError && onError(event.error);
  };

  recognition.onend = () => {
    onEnd && onEnd();
  };

  recognition.start();
  return recognition;
}
