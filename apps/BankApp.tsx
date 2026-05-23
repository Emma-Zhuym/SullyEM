/**
 * BankApp.tsx — EM 记账重设计
 *
 * 三栏 Tab：资产 / 交易 / 分析+TA读
 * iOS 原生风格 + 柔化处理
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet, Receipt, ChartPie, CaretLeft, Plus, Trash, GearSix } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { FinanceDB } from '../utils/financeDb';
import { FinanceAccount, FinanceCategory, FinanceTransaction } from '../types';

type TabId = 'assets' | 'transactions' | 'analytics';

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string; weight?: string }> }[] = [
  { id: 'assets', label: '资产', icon: Wallet },
  { id: 'transactions', label: '交易', icon: Receipt },
  { id: 'analytics', label: '分析', icon: ChartPie },
];

const ACCOUNT_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

const ACCOUNT_TYPE_LABELS: Record<FinanceAccount['type'], string> = {
  checking: '储蓄账户', savings: '定期/储蓄', credit: '信用账户', cash: '现金',
};

const CURRENCY_OPTIONS = ['CNY', 'USD', 'JPY', 'EUR', 'GBP', 'KRW'];
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥', USD: '$', JPY: '¥', EUR: '€', GBP: '£', KRW: '₩',
};

const BankApp: React.FC = () => {
  const { closeApp } = useOS();
  const [activeTab, setActiveTab] = useState<TabId>('assets');
  const [showSettings, setShowSettings] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    (async () => {
      await FinanceDB.init();
      await refreshData();
      setLoading(false);
    })();
  }, [refreshData]);

  const totalBalance = accounts
    .filter(a => !a.isArchived)
    .reduce((sum, a) => sum + (balances[a.id] ?? a.initialBalance), 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'linear-gradient(165deg, #f3f0ff 0%, #eef2ff 40%, #f0f4ff 100%)' }}>
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(165deg, #f3f0ff 0%, #eef2ff 40%, #f0f4ff 100%)' }}>
      {/* 顶部导航栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-2">
        <button
          onClick={closeApp}
          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 active:scale-90 transition-transform"
        >
          <CaretLeft className="w-5 h-5" weight="bold" />
        </button>
        <span className="text-sm font-semibold text-slate-600">
          {activeTab === 'assets' ? '资产' : activeTab === 'transactions' ? '交易' : '分析'}
        </span>
        <div className="flex items-center gap-0">
          {activeTab === 'assets' && (
            <>
              <button
                onClick={() => setAddingAccount(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 active:scale-90 transition-transform"
              >
                <Plus className="w-5 h-5" weight="bold" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 active:scale-90 transition-transform"
              >
                <GearSix className="w-5 h-5" />
              </button>
            </>
          )}
          {activeTab !== 'assets' && <div className="w-8" />}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'assets' && (
          <AssetsTab
            accounts={accounts}
            balances={balances}
            totalBalance={totalBalance}
            onRefresh={refreshData}
            addingAccount={addingAccount}
            onAddingDone={() => setAddingAccount(false)}
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

// ── 格式化金额 ──

function formatAmount(amount: number, currency?: string) {
  const sym = CURRENCY_SYMBOLS[currency || 'USD'] || '$';
  const sign = amount < 0 ? '-' : '';
  return `${sign}${sym}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── 账户表单（添加/编辑） ──

const AccountForm: React.FC<{
  initial?: FinanceAccount;
  onSave: (acc: FinanceAccount) => void;
  onDelete?: () => void;
  onClose: () => void;
}> = ({ initial, onSave, onDelete, onClose }) => {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState<FinanceAccount['type']>(initial?.type || 'checking');
  const [currency, setCurrency] = useState(initial?.currency || 'CNY');
  const [initialBalance, setInitialBalance] = useState(
    initial ? String(initial.initialBalance) : ''
  );
  const [color, setColor] = useState(initial?.color || ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || `acc_${Date.now()}`,
      name: name.trim(),
      type,
      currency,
      initialBalance: parseFloat(initialBalance) || 0,
      color,
      icon: icon || undefined,
      isArchived: initial?.isArchived,
      sortOrder: initial?.sortOrder,
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(165deg, #f3f0ff 0%, #eef2ff 40%, #f0f4ff 100%)' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
        <button onClick={onClose} className="flex items-center text-blue-500 text-sm">
          <CaretLeft className="w-5 h-5" weight="bold" /> 返回
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {isEdit ? '编辑账户' : '新建账户'}
        </span>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="text-blue-500 text-sm font-semibold disabled:text-slate-300"
        >
          保存
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {/* 名称 */}
        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <FormRow label="名称">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：招商储蓄卡"
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-300"
            />
          </FormRow>
          <FormRow label="类型" border>
            <select
              value={type}
              onChange={e => setType(e.target.value as FinanceAccount['type'])}
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent appearance-none"
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="币种" border>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent appearance-none"
            >
              {CURRENCY_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="初始余额" border>
            <input
              value={initialBalance}
              onChange={e => setInitialBalance(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-300"
            />
          </FormRow>
          <FormRow label="图标（emoji）" border>
            <input
              value={icon}
              onChange={e => setIcon(e.target.value)}
              placeholder="💳"
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-300"
              maxLength={4}
            />
          </FormRow>
        </div>

        {/* 颜色选择 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="text-xs text-slate-400 mb-3">卡片颜色</div>
          <div className="flex flex-wrap gap-3">
            {ACCOUNT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform"
                style={{
                  backgroundColor: c,
                  boxShadow: color === c ? `0 0 0 3px #f0edff, 0 0 0 5px ${c}` : 'none',
                  transform: color === c ? 'scale(1.1)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {/* 预览 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="text-xs text-slate-400 mb-2">预览</div>
          <div className="flex items-center">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base font-bold shrink-0 mr-3"
              style={{ backgroundColor: color }}
            >
              {icon || (name ? name.slice(0, 2) : '💳')}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">{name || '账户名称'}</div>
              <div className="text-[11px] text-slate-400">{ACCOUNT_TYPE_LABELS[type]} · {currency}</div>
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {formatAmount(parseFloat(initialBalance) || 0, currency)}
            </div>
          </div>
        </div>

        {/* 删除 */}
        {isEdit && onDelete && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3.5 text-sm text-red-500 font-medium flex items-center justify-center gap-1.5"
              >
                <Trash className="w-4 h-4" /> 删除账户
              </button>
            ) : (
              <div className="p-4 text-center">
                <div className="text-sm text-slate-600 mb-3">确定删除「{name}」？相关交易不会被删除。</div>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-slate-500 bg-slate-100 rounded-xl">取消</button>
                  <button onClick={onDelete} className="px-4 py-2 text-sm text-white bg-red-500 rounded-xl">删除</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FormRow: React.FC<{
  label: string;
  border?: boolean;
  children: React.ReactNode;
}> = ({ label, border, children }) => (
  <div className={`flex items-center px-4 py-3.5 ${border ? 'border-t border-slate-100' : ''}`}>
    <span className="text-sm text-slate-700 shrink-0 mr-4">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// ── 资产 Tab ──

const AssetsTab: React.FC<{
  accounts: FinanceAccount[];
  balances: Record<string, number>;
  totalBalance: number;
  onRefresh: () => Promise<void>;
  addingAccount: boolean;
  onAddingDone: () => void;
}> = ({ accounts, balances, totalBalance, onRefresh, addingAccount, onAddingDone }) => {
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | 'new' | null>(null);

  useEffect(() => {
    if (addingAccount) setEditingAccount('new');
  }, [addingAccount]);

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const grouped = {
    checking: activeAccounts.filter(a => a.type === 'checking'),
    savings: activeAccounts.filter(a => a.type === 'savings'),
    credit: activeAccounts.filter(a => a.type === 'credit'),
    cash: activeAccounts.filter(a => a.type === 'cash'),
  };

  const closeForm = () => { setEditingAccount(null); onAddingDone(); };

  const handleSaveAccount = async (acc: FinanceAccount) => {
    await FinanceDB.saveAccount(acc);
    await onRefresh();
    closeForm();
  };

  const handleDeleteAccount = async (id: string) => {
    await FinanceDB.deleteAccount(id);
    await onRefresh();
    closeForm();
  };

  if (editingAccount) {
    return (
      <AccountForm
        initial={editingAccount === 'new' ? undefined : editingAccount}
        onSave={handleSaveAccount}
        onDelete={editingAccount !== 'new' ? () => handleDeleteAccount(editingAccount.id) : undefined}
        onClose={closeForm}
      />
    );
  }

  return (
    <div className="px-5 pt-2 pb-4">
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
      {activeAccounts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-slate-300 text-4xl mb-3">💳</div>
          <div className="text-slate-400 text-sm mb-4">还没有账户</div>
          <button
            onClick={() => setEditingAccount('new')}
            className="px-5 py-2.5 bg-blue-500 text-white text-sm rounded-xl font-medium active:scale-95 transition-transform"
          >
            添加第一个账户
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([type, accs]) => {
          if (accs.length === 0) return null;
          return (
            <div key={type} className="mb-4">
              <div className="text-xs text-slate-400 font-medium mb-2 px-1">
                {ACCOUNT_TYPE_LABELS[type as FinanceAccount['type']]}
              </div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {accs.map((acc, i) => (
                  <button
                    key={acc.id}
                    onClick={() => setEditingAccount(acc)}
                    className={`w-full flex items-center px-4 py-3.5 text-left active:bg-slate-50 transition-colors ${
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
                  </button>
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

type TimeRange = 'week' | 'month' | 'last_month' | '3months' | 'year' | 'all';

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  week: '本周', month: '本月', last_month: '上月', '3months': '近3月', year: '今年', all: '全部',
};

function getDateRange(range: TimeRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  let from: string;
  if (range === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    from = d.toISOString().split('T')[0];
  } else if (range === 'month') {
    from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (range === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    from = d.toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from, to: end.toISOString().split('T')[0] };
  } else if (range === '3months') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3);
    from = d.toISOString().split('T')[0];
  } else if (range === 'year') {
    from = `${now.getFullYear()}-01-01`;
  } else {
    from = '2000-01-01';
  }
  return { from, to };
}

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors shrink-0 ${
      active ? 'bg-blue-500 text-white shadow-sm' : 'bg-white/80 text-slate-500'
    }`}
  >
    {label}
  </button>
);

const TransactionsTab: React.FC<{
  transactions: FinanceTransaction[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
}> = ({ transactions, accounts, categories }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { from, to } = getDateRange(timeRange);

  const filtered = transactions.filter(t => {
    if (t.dateStr < from || t.dateStr > to) return false;
    if (filterAccountId && t.accountId !== filterAccountId) return false;
    if (filterType === 'expense' && t.type !== 'expense') return false;
    if (filterType === 'income' && t.type !== 'income' && t.type !== 'refund') return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
  const totalIncome = filtered.filter(t => t.type === 'income' || t.type === 'refund').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

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

  const activeFilters = (filterAccountId ? 1 : 0) + (filterType !== 'all' ? 1 : 0);

  return (
    <div className="px-5 pt-2 pb-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
        {(['week', 'month', '3months', 'year', 'all'] as TimeRange[]).map(r => (
          <FilterChip key={r} label={TIME_RANGE_LABELS[r]} active={timeRange === r} onClick={() => setTimeRange(r)} />
        ))}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center gap-1 ${
            activeFilters > 0 ? 'bg-blue-500 text-white' : 'bg-white/80 text-slate-500'
          }`}
        >
          筛选{activeFilters > 0 && ` (${activeFilters})`}
        </button>
      </div>

      {/* 展开筛选面板 */}
      {showFilters && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
          <div>
            <div className="text-[11px] text-slate-400 mb-2">类型</div>
            <div className="flex gap-2">
              {([['all', '全部'], ['expense', '支出'], ['income', '收入']] as const).map(([val, label]) => (
                <FilterChip key={val} label={label} active={filterType === val} onClick={() => setFilterType(val)} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-2">账户</div>
            <div className="flex gap-2 flex-wrap">
              <FilterChip label="全部" active={!filterAccountId} onClick={() => setFilterAccountId(null)} />
              {accounts.filter(a => !a.isArchived).map(a => (
                <FilterChip key={a.id} label={a.name} active={filterAccountId === a.id} onClick={() => setFilterAccountId(a.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 收支汇总 */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-emerald-50/80 rounded-2xl p-3.5">
          <div className="text-emerald-600 text-xs font-medium mb-1">收入</div>
          <div className="text-emerald-700 text-lg font-bold">+{formatAmount(totalIncome)}</div>
        </div>
        <div className="flex-1 bg-rose-50/80 rounded-2xl p-3.5">
          <div className="text-rose-500 text-xs font-medium mb-1">支出</div>
          <div className="text-rose-600 text-lg font-bold">-{formatAmount(totalExpense)}</div>
        </div>
      </div>

      {/* 八卦情报卡片 */}
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
          <div className="text-slate-400 text-sm">
            {transactions.length === 0 ? '还没有交易记录' : '没有匹配的交易'}
          </div>
        </div>
      ) : (
        Array.from(byDate.entries()).map(([dateStr, txs]) => {
          const dayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const dayIncome = txs.filter(t => t.type === 'income' || t.type === 'refund').reduce((s, t) => s + t.amount, 0);
          const [, month, day] = dateStr.split('-');
          return (
            <div key={dateStr} className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-sm font-medium text-slate-700">
                  {parseInt(month)}月{parseInt(day)}日 · {formatWeekday(dateStr)}
                </div>
                <div className="flex gap-3 text-xs">
                  {dayExpense > 0 && <span className="text-rose-400">-{formatAmount(dayExpense)}</span>}
                  {dayIncome > 0 && <span className="text-emerald-500">+{formatAmount(dayIncome)}</span>}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {txs.map((t, i) => {
                  const cat = catMap.get(t.categoryId);
                  const acc = accMap.get(t.accountId);
                  const sym = CURRENCY_SYMBOLS[t.currency] || '$';
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
                        <div className="text-[11px] text-slate-400">#{acc?.name || '未知账户'}</div>
                      </div>
                      <div className={`text-sm font-semibold ${
                        t.type === 'income' || t.type === 'refund' ? 'text-emerald-500' : 'text-slate-700'
                      }`}>
                        {t.type === 'income' || t.type === 'refund' ? '+' : '-'}{sym}{t.amount.toLocaleString()}
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
    <div className="px-5 pt-2 pb-4">
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
