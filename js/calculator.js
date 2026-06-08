/**
 * 计算每人应付/应收净值
 * @param {Array} expenses - 消费列表
 * @param {number} peopleCount - 总人数
 * @returns {Object} { owes: {1: 应付金额, ...}, paid: {1: 已付金额, ...}, net: {1: 净值, ...} }
 */
export function calculateBalances(expenses, peopleCount) {
  const owes = {};
  const paid = {};

  for (let i = 1; i <= peopleCount; i++) {
    owes[i] = 0;
    paid[i] = 0;
  }

  for (const e of expenses) {
    if (!e.participants || e.participants.length === 0) continue;
    const share = e.amount / e.participants.length;
    for (const p of e.participants) {
      owes[p] = (owes[p] || 0) + share;
    }
    paid[e.paidBy] = (paid[e.paidBy] || 0) + e.amount;
  }

  const net = {};
  for (let i = 1; i <= peopleCount; i++) {
    net[i] = round2(paid[i] - owes[i]);
  }

  return { owes, paid, net };
}

/**
 * 贪心结算算法：生成最少转账次数的方案
 * @param {Object} net - 每人净值 {1: 50, 2: -30, ...}
 * @returns {Array} [{ from: 2, to: 1, amount: 30 }, ...]
 */
export function calculateSettlements(net) {
  // 复制净值，避免修改原数据
  const balances = {};
  for (const [k, v] of Object.entries(net)) {
    const rounded = round2(v);
    if (Math.abs(rounded) > 0.001) {
      balances[k] = rounded;
    }
  }

  const settlements = [];

  while (true) {
    // 找最大债权人和最大债务人
    let maxCreditor = null, maxDebtor = null;
    let maxCredit = 0, maxDebt = 0;

    for (const [k, v] of Object.entries(balances)) {
      if (v > maxCredit) { maxCredit = v; maxCreditor = k; }
      if (v < maxDebt) { maxDebt = v; maxDebtor = k; }
    }

    if (!maxCreditor || !maxDebtor) break;

    const amount = round2(Math.min(maxCredit, -maxDebt));
    settlements.push({
      from: parseInt(maxDebtor),
      to: parseInt(maxCreditor),
      amount
    });

    balances[maxCreditor] = round2(balances[maxCreditor] - amount);
    balances[maxDebtor] = round2(balances[maxDebtor] + amount);

    if (Math.abs(balances[maxCreditor]) < 0.005) delete balances[maxCreditor];
    if (Math.abs(balances[maxDebtor]) < 0.005) delete balances[maxDebtor];
  }

  return settlements;
}

/**
 * 计算账单总金额
 */
export function totalAmount(expenses) {
  return round2(expenses.reduce((sum, e) => sum + e.amount, 0));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
