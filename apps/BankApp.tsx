/**
 * BankApp.tsx — EM 记账重设计
 *
 * 三栏 Tab：资产 / 交易 / 分析+TA读
 * iOS 原生风格 + 柔化处理
 */

import React, { useState, useEffect } from 'react';
import { Wallet, Receipt, ChartPie } from '@phosphor-icons/react';
import { FinanceDB } from '../utils/financeDb';
import { FinanceAccount, FinanceCategory, FinanceTransaction } from '../types';

type TabId = 'assets' | 'transactions' | 'analytics';

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string; weight?: string }> }[] = [
  { id: 'assets', label: '资产', icon: Wallet },
  { id: 'transactions', label: '交易', icon: Receipt },
  { id: 'analytics', label: '分析', icon: ChartPie },
];

const BankApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('assets');
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await FinanceDB.init();
      const [accs, cats, txs] = await Promise.all([
        FinanceDB.getAccounts(),
        FinanceDB.getCategories(),
        FinanceDB.getTransactions(),
      ]);
      setAccounts(accs);
      setCategories(cats);
      setTransactions(txs);

      const bals: Record<string, number> = {};
      for (const a of accs) {
        bals[a.id] = await FinanceDB.calcAccountBalance(a);
      }
      setBalances(bals);
      setLoading(false);
    })();
  }, []);

  const totalBalance = accounts
    .filter(a => !a.isArchived)
    .reduce((sum, a) => sum + (balances[a.id] ?? a.initialBalance), 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: '#F8F7F4' }}>
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#F8F7F4' }}>
      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'assets' && (
          <AssetsTab
            accounts={accounts}
            balances={balances}
            totalBalance={totalBalance}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={transactions}
            accounts={accounts}
            categories={categories}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            transactions={transactions}
            categories={categories}
          />
        )}
      </div>

      {/* 底部 Tab Bar */}
      <div className="shrink-0 flex items-center justify-around border-t border-slate-200/60 bg-white/80 backdrop-blur-lg pb-5 pt-2">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
                isActive ? 'text-blue-500' : 'text-slate-400'
              }`}
            >
              <Icon className="w-6 h-6" weight={isActive ? 'fill' : 'regular'} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── 资产 Tab ──

const AssetsTab: React.FC<{
  accounts: FinanceAccount[];
  balances: Record<string, number>;
  totalBalance: number;
}> = ({ accounts, balances, totalBalance }) => {
  const grouped = {
    checking: accounts.filter(a => a.type === 'checking' && !a.isArchived),
    savings: accounts.filter(a => a.type === 'savings' && !a.isArchived),
    credit: accounts.filter(a => a.type === 'credit' && !a.isArchived),
    cash: accounts.filter(a => a.type === 'cash' && !a.isArchived),
  };

  const groupLabels: Record<string, string> = {
    checking: '储蓄账户',
    savings: '定期/储蓄',
    credit: '信用账户',
    cash: '现金',
  };

  const formatAmount = (amount: number, currency?: string) => {
    const prefix = currency === 'CNY' ? '¥' : currency === 'JPY' ? '¥' : '$';
    return `${prefix}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="px-5 pt-12 pb-4">
      {/* 设置入口 */}
      <div className="flex justify-end mb-2">
        <button className="text-slate-400 text-sm">⚙️</button>
      </div>

      {/* 总资产 */}
      <div className="mb-6">
        <div className="text-slate-500 text-xs mb-1">总资产</div>
        <div className="text-3xl font-bold text-slate-800 tracking-tight">
          {formatAmount(totalBalance)}
        </div>
      </div>

      {/* 趋势图占位 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
        <div className="flex gap-2 mb-3">
          {['周', '月', '年', '全部'].map(label => (
            <button
              key={label}
              className="px-3 py-1 text-xs rounded-full bg-slate-100 text-slate-500 font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-32 flex items-center justify-center text-slate-300 text-sm">
          趋势图（待实现）
        </div>
      </div>

      {/* 账户列表 */}
      {accounts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-slate-300 text-4xl mb-3">💳</div>
          <div className="text-slate-400 text-sm mb-4">还没有账户</div>
          <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded-xl font-medium">
            添加第一个账户
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([type, accs]) => {
          if (accs.length === 0) return null;
          return (
            <div key={type} className="mb-4">
              <div className="text-xs text-slate-400 font-medium mb-2 px-1">
                {groupLabels[type]}
              </div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {accs.map((acc, i) => (
                  <div
                    key={acc.id}
                    className={`flex items-center px-4 py-3.5 ${
                      i < accs.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 mr-3"
                      style={{ backgroundColor: acc.color || '#94a3b8' }}
                    >
                      {acc.icon || acc.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{acc.name}</div>
                    </div>
                    <div className={`text-sm font-semibold ${
                      (balances[acc.id] ?? 0) < 0 ? 'text-red-400' : 'text-slate-700'
                    }`}>
                      {formatAmount(balances[acc.id] ?? acc.initialBalance, acc.currency)}
                    </div>
                    <div className="text-slate-300 ml-2 text-xs">›</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// ── 交易 Tab ──

const TransactionsTab: React.FC<{
  transactions: FinanceTransaction[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
}> = ({ transactions, accounts, categories }) => {
  const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTxs = sorted.filter(t => t.dateStr.startsWith(thisMonth));
  const monthIncome = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const byDate = new Map<string, FinanceTransaction[]>();
  for (const t of sorted) {
    const group = byDate.get(t.dateStr) || [];
    group.push(t);
    byDate.set(t.dateStr, group);
  }

  const catMap = new Map(categories.map(c => [c.id, c]));
  const accMap = new Map(accounts.map(a => [a.id, a]));

  const formatWeekday = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  };

  return (
    <div className="px-5 pt-12 pb-4">
      {/* 收支汇总 */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-emerald-50 rounded-2xl p-3.5">
          <div className="text-emerald-600 text-xs font-medium mb-1">收入</div>
          <div className="text-emerald-700 text-lg font-bold">+${monthIncome.toLocaleString()}</div>
        </div>
        <div className="flex-1 bg-rose-50 rounded-2xl p-3.5">
          <div className="text-rose-500 text-xs font-medium mb-1">支出</div>
          <div className="text-rose-600 text-lg font-bold">-${monthExpense.toLocaleString()}</div>
        </div>
      </div>

      {/* 八卦情报卡片占位 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">☕</span>
            <span className="text-sm font-medium text-slate-700">今日情报</span>
          </div>
          <span className="text-xs text-blue-400">查看更多 →</span>
        </div>
        <div className="text-xs text-slate-400 mt-2">暂无新情报（待实现）</div>
      </div>

      {/* 流水列表 */}
      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-slate-300 text-4xl mb-3">📝</div>
          <div className="text-slate-400 text-sm">还没有交易记录</div>
        </div>
      ) : (
        Array.from(byDate.entries()).map(([dateStr, txs]) => {
          const dayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const dayIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const [, month, day] = dateStr.split('-');
          return (
            <div key={dateStr} className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-sm font-medium text-slate-700">
                  {parseInt(month)}月{parseInt(day)}日 · {formatWeekday(dateStr)}
                </div>
                <div className="flex gap-3 text-xs">
                  {dayExpense > 0 && <span className="text-rose-400">-${dayExpense}</span>}
                  {dayIncome > 0 && <span className="text-emerald-500">+${dayIncome}</span>}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {txs.map((t, i) => {
                  const cat = catMap.get(t.categoryId);
                  const acc = accMap.get(t.accountId);
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center px-4 py-3 ${
                        i < txs.length - 1 ? 'border-b border-slate-50' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-base mr-3 shrink-0">
                        {cat?.icon || '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 truncate">{t.note || cat?.name || '未分类'}</div>
                        <div className="text-[11px] text-slate-400">
                          #{acc?.name || '未知账户'}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${
                        t.type === 'income' || t.type === 'refund' ? 'text-emerald-500' : 'text-slate-700'
                      }`}>
                        {t.type === 'income' || t.type === 'refund' ? '+' : '-'}
                        {t.currency === 'CNY' ? '¥' : '$'}{t.amount}
                      </div>
                      <div className="text-slate-300 ml-2 text-xs">›</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* 新增按钮 */}
      <button className="fixed right-5 bottom-24 w-14 h-14 bg-blue-500 text-white rounded-2xl shadow-lg flex items-center justify-center text-2xl font-light active:scale-90 transition-transform z-10">
        +
      </button>
    </div>
  );
};

// ── 分析 + TA 读 Tab ──

const AnalyticsTab: React.FC<{
  transactions: FinanceTransaction[];
  categories: FinanceCategory[];
}> = ({ transactions, categories }) => {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  const now = new Date();
  let fromDate: string;
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    fromDate = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else {
    fromDate = `${now.getFullYear()}-01-01`;
  }
  const toDate = now.toISOString().split('T')[0];

  const periodTxs = transactions.filter(
    t => t.dateStr >= fromDate && t.dateStr <= toDate && t.type === 'expense'
  );
  const totalExpense = periodTxs.reduce((s, t) => s + t.amount, 0);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const topCats = categories.filter(c => !c.parentId);

  const byCat = new Map<string, number>();
  for (const t of periodTxs) {
    const cat = catMap.get(t.categoryId);
    const topId = cat?.parentId || t.categoryId;
    byCat.set(topId, (byCat.get(topId) || 0) + t.amount);
  }

  const catList = Array.from(byCat.entries())
    .map(([catId, amount]) => ({
      cat: catMap.get(catId),
      amount,
      pct: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const periodLabels = { week: '本周', month: '本月', year: '今年' };

  return (
    <div className="px-5 pt-12 pb-4">
      {/* 时间切换 */}
      <div className="flex gap-2 mb-5">
        {(['week', 'month', 'year'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 text-xs rounded-full font-medium transition-colors ${
              period === p
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {p === 'week' ? '周' : p === 'month' ? '月' : '年'}
          </button>
        ))}
      </div>

      {/* 支出总额 */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-1">{periodLabels[period]}支出</div>
        <div className="text-2xl font-bold text-slate-800">${totalExpense.toLocaleString()}</div>
      </div>

      {/* 饼图占位 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
        <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
          分类饼图（待实现）
        </div>
      </div>

      {/* 分类列表 */}
      {catList.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">暂无支出数据</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          {catList.map(({ cat, amount, pct }, i) => (
            <div
              key={cat?.id || i}
              className={`flex items-center px-4 py-3 ${
                i < catList.length - 1 ? 'border-b border-slate-50' : ''
              }`}
            >
              <span className="text-base mr-3">{cat?.icon || '📋'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700">{cat?.name || '未分类'}</div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="text-sm font-semibold text-slate-700">${amount.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">{pct}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TA 读区域 */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="text-sm font-medium text-slate-700 mb-3">TA 怎么看</div>
        <div className="text-xs text-slate-400 mb-3">选一个角色来评价你{periodLabels[period]}的消费</div>
        <div className="flex gap-2 mb-4">
          {['小帕', '陈照', '陆时'].map(name => (
            <button
              key={name}
              className="px-3 py-1.5 text-xs rounded-full bg-slate-100 text-slate-500 font-medium"
            >
              {name}
            </button>
          ))}
        </div>
        <div className="text-center py-6 text-slate-300 text-sm">
          点击角色生成评价（待实现）
        </div>
      </div>
    </div>
  );
};

export default BankApp;
