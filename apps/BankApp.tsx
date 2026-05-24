/**
 * BankApp.tsx — EM 记账重设计
 *
 * 三栏 Tab：资产 / 交易 / 分析+TA读
 * iOS 原生风格 + 柔化处理
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet, Receipt, ChartPie, CaretLeft, Plus, Trash, GearSix, type Icon } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { FinanceDB } from '../utils/financeDb';
import { safeFetchJson } from '../utils/safeApi';
import { normalizeUserImpression } from '../utils/impression';
import { FinanceAccount, FinanceCategory, FinanceTransaction, FinanceTxType, CharacterProfile } from '../types';

type TabId = 'assets' | 'transactions' | 'analytics';

const TABS: { id: TabId; label: string; icon: Icon }[] = [
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
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            transactions={transactions}
            categories={categories}
            accounts={accounts}
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

// ── 交易表单（添加/编辑） ──

const TransactionForm: React.FC<{
  initial?: FinanceTransaction;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onSave: (tx: FinanceTransaction) => void;
  onDelete?: () => void;
  onClose: () => void;
}> = ({ initial, accounts, categories, onSave, onDelete, onClose }) => {
  const isEdit = !!initial;
  const [txType, setTxType] = useState<FinanceTxType>(initial?.type || 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [accountId, setAccountId] = useState(initial?.accountId || accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId || '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId || '');
  const [note, setNote] = useState(initial?.note || '');
  const [dateStr, setDateStr] = useState(initial?.dateStr || new Date().toISOString().split('T')[0]);
  const [expandedTopCat, setExpandedTopCat] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const selectedCat = catMap.get(categoryId);
  const selectedAcc = accounts.find(a => a.id === accountId);

  const relevantTopCats = categories.filter(c => {
    if (c.parentId) return false;
    if (txType === 'income' || txType === 'refund') return c.id === 'cat_income';
    return c.id !== 'cat_income';
  });

  const handleCatClick = (catId: string) => {
    const children = categories.filter(c => c.parentId === catId);
    if (children.length > 0) {
      setExpandedTopCat(prev => prev === catId ? null : catId);
    } else {
      setCategoryId(catId);
      setExpandedTopCat(null);
    }
  };

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!parsed || !accountId) return;
    onSave({
      id: initial?.id || `tx_${Date.now()}`,
      type: txType,
      amount: parsed,
      currency: selectedAcc?.currency || 'CNY',
      accountId,
      categoryId: categoryId || (txType === 'income' || txType === 'refund' ? 'cat_income' : 'cat_food'),
      note: note.trim(),
      timestamp: initial?.timestamp || Date.now(),
      dateStr,
      toAccountId: txType === 'transfer' ? (toAccountId || undefined) : undefined,
      charComments: initial?.charComments,
    });
  };

  const canSave = parseFloat(amount) > 0 && !!accountId;

  if (accounts.length === 0) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(165deg, #f3f0ff 0%, #eef2ff 40%, #f0f4ff 100%)' }}>
        <div className="text-4xl mb-3">💳</div>
        <div className="text-slate-500 text-sm mb-1">请先在资产页添加账户</div>
        <button onClick={onClose} className="mt-4 px-5 py-2 text-sm text-blue-500 font-medium">返回</button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(165deg, #f3f0ff 0%, #eef2ff 40%, #f0f4ff 100%)' }}>
      <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
        <button onClick={onClose} className="flex items-center text-blue-500 text-sm">
          <CaretLeft className="w-5 h-5" weight="bold" /> 返回
        </button>
        <span className="text-sm font-semibold text-slate-700">{isEdit ? '编辑交易' : '新增交易'}</span>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="text-blue-500 text-sm font-semibold disabled:text-slate-300"
        >
          保存
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {/* 类型切换 */}
        <div className="bg-white rounded-2xl shadow-sm p-1.5 mb-4 flex gap-1">
          {(['expense', 'income', 'transfer'] as const).map(t => {
            const cfg = {
              expense: { label: '支出', active: 'bg-rose-50 text-rose-500' },
              income: { label: '收入', active: 'bg-emerald-50 text-emerald-600' },
              transfer: { label: '转账', active: 'bg-blue-50 text-blue-500' },
            }[t];
            return (
              <button
                key={t}
                onClick={() => { setTxType(t); setCategoryId(''); setExpandedTopCat(null); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${txType === t ? cfg.active : 'text-slate-400'}`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* 金额 */}
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4 mb-4">
          <div className="text-xs text-slate-400 mb-2">金额</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl text-slate-300 font-light">
              {CURRENCY_SYMBOLS[selectedAcc?.currency || 'CNY'] || '¥'}
            </span>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              className="flex-1 text-4xl font-bold text-slate-800 outline-none bg-transparent placeholder:text-slate-200 min-w-0"
            />
          </div>
        </div>

        {/* 分类（转账不需要） */}
        {txType !== 'transfer' && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">分类</span>
              {selectedCat && (
                <span className="text-xs font-medium text-blue-500">
                  {selectedCat.icon} {selectedCat.name}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {relevantTopCats.map(cat => {
                const isActive = selectedCat?.parentId === cat.id || (categoryId === cat.id && !catMap.get(categoryId)?.parentId);
                const isExpanded = expandedTopCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCatClick(cat.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all ${
                      isActive || isExpanded ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <span className="text-[9px] text-slate-600 leading-tight text-center">{cat.name}</span>
                  </button>
                );
              })}
            </div>
            {expandedTopCat && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-50">
                {categories.filter(c => c.parentId === expandedTopCat).map(child => (
                  <button
                    key={child.id}
                    onClick={() => { setCategoryId(child.id); setExpandedTopCat(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                      categoryId === child.id ? 'bg-blue-500 text-white font-medium' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span>{child.icon}</span>
                    <span>{child.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 账户 / 目标账户 / 日期 / 备注 */}
        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <FormRow label="账户">
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent appearance-none"
            >
              {accounts.filter(a => !a.isArchived).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FormRow>
          {txType === 'transfer' && (
            <FormRow label="转入账户" border>
              <select
                value={toAccountId}
                onChange={e => setToAccountId(e.target.value)}
                className="w-full text-right text-sm text-slate-700 outline-none bg-transparent appearance-none"
              >
                <option value="">请选择</option>
                {accounts.filter(a => !a.isArchived && a.id !== accountId).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormRow>
          )}
          <FormRow label="日期" border>
            <input
              type="date"
              value={dateStr}
              onChange={e => setDateStr(e.target.value)}
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent"
            />
          </FormRow>
          <FormRow label="备注" border>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可选"
              className="w-full text-right text-sm text-slate-700 outline-none bg-transparent placeholder:text-slate-300"
            />
          </FormRow>
        </div>

        {/* 删除 */}
        {isEdit && onDelete && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3.5 text-sm text-red-500 font-medium flex items-center justify-center gap-1.5"
              >
                <Trash className="w-4 h-4" /> 删除交易
              </button>
            ) : (
              <div className="p-4 text-center">
                <div className="text-sm text-slate-600 mb-3">确定删除这条交易记录？</div>
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
  onRefresh: () => Promise<void>;
}> = ({ transactions, accounts, categories, onRefresh }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | 'new' | null>(null);

  if (editingTx !== null) {
    return (
      <TransactionForm
        initial={editingTx === 'new' ? undefined : editingTx}
        accounts={accounts}
        categories={categories}
        onSave={async (tx) => {
          await FinanceDB.saveTransaction(tx);
          await onRefresh();
          setEditingTx(null);
        }}
        onDelete={editingTx !== 'new' ? async () => {
          await FinanceDB.deleteTransaction((editingTx as FinanceTransaction).id);
          await onRefresh();
          setEditingTx(null);
        } : undefined}
        onClose={() => setEditingTx(null)}
      />
    );
  }

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
                    <button
                      key={t.id}
                      onClick={() => setEditingTx(t)}
                      className={`w-full flex items-center px-4 py-3 text-left active:bg-slate-50 transition-colors ${
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
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* 新增按钮 */}
      <button
        onClick={() => setEditingTx('new')}
        className="fixed right-5 bottom-24 w-14 h-14 bg-blue-500 text-white rounded-2xl shadow-lg flex items-center justify-center text-2xl font-light active:scale-90 transition-transform z-10"
      >
        +
      </button>
    </div>
  );
};

// ── 分析 + TA 读 Tab ──

const CHART_COLORS = [
  '#FF6B6B', '#FFA06B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#9B59B6', '#FF85A1', '#00BCD4', '#FF7043', '#78909C',
];

type Tone = 'teasing' | 'serious' | 'encouraging' | 'caring';
const TONE_LABELS: Record<Tone, string> = {
  teasing: '调侃', serious: '严肃', encouraging: '鼓励', caring: '心疼',
};

const DonutChart: React.FC<{
  data: { label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
}> = ({ data, total, centerLabel }) => {
  const size = 160;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth}
      />
      {data.map((seg, i) => {
        const pct = total > 0 ? seg.value / total : 0;
        const segLen = pct * circumference;
        const offset = cumulativeOffset;
        cumulativeOffset += segLen;
        if (segLen < 0.5) return null;
        return (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={seg.color} strokeWidth={strokeWidth}
            strokeDasharray={`${segLen} ${circumference - segLen}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease' }}
          />
        );
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">支出</text>
      <text x={size / 2} y={size / 2 + 12} textAnchor="middle" className="fill-slate-800 text-sm font-bold">{centerLabel}</text>
    </svg>
  );
};

interface NotableTx {
  note: string;
  amount: number;
  currency: string;
  category: string;
  dateStr: string;
  flag: string;
}

function findNotableTransactions(
  periodTxs: FinanceTransaction[],
  allTxs: FinanceTransaction[],
  catMap: Map<string, FinanceCategory>,
): NotableTx[] {
  const notable: NotableTx[] = [];
  if (periodTxs.length === 0) return notable;

  const getCatName = (t: FinanceTransaction) => {
    const cat = catMap.get(t.categoryId);
    return cat?.name || '未分类';
  };
  const getTopCatId = (t: FinanceTransaction) => {
    const cat = catMap.get(t.categoryId);
    return cat?.parentId || t.categoryId;
  };
  const sym = (c: string) => CURRENCY_SYMBOLS[c] || c;

  const sorted = [...periodTxs].sort((a, b) => b.amount - a.amount);
  const topN = sorted.slice(0, 3);
  for (const t of topN) {
    notable.push({
      note: t.note || getCatName(t),
      amount: t.amount,
      currency: t.currency,
      category: getCatName(t),
      dateStr: t.dateStr,
      flag: '高额',
    });
  }

  const catAvg = new Map<string, { sum: number; count: number }>();
  for (const t of allTxs) {
    if (t.type !== 'expense') continue;
    const topId = getTopCatId(t);
    const entry = catAvg.get(topId) || { sum: 0, count: 0 };
    entry.sum += t.amount;
    entry.count += 1;
    catAvg.set(topId, entry);
  }

  for (const t of periodTxs) {
    const topId = getTopCatId(t);
    const avg = catAvg.get(topId);
    if (!avg || avg.count < 3) continue;
    const mean = avg.sum / avg.count;
    if (t.amount > mean * 2.5 && !topN.includes(t)) {
      notable.push({
        note: t.note || getCatName(t),
        amount: t.amount,
        currency: t.currency,
        category: getCatName(t),
        dateStr: t.dateStr,
        flag: `异常（该分类平均${sym(t.currency)}${mean.toFixed(0)}，这笔${sym(t.currency)}${t.amount.toFixed(0)}）`,
      });
    }
  }

  const withNotes = periodTxs.filter(t =>
    t.note && t.note.trim().length > 2 && !topN.includes(t)
  );
  const interesting = withNotes
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  for (const t of interesting) {
    if (notable.some(n => n.dateStr === t.dateStr && n.note === (t.note || getCatName(t)))) continue;
    notable.push({
      note: t.note!,
      amount: t.amount,
      currency: t.currency,
      category: getCatName(t),
      dateStr: t.dateStr,
      flag: '有备注',
    });
  }

  const seen = new Set<string>();
  return notable.filter(n => {
    const key = `${n.dateStr}_${n.note}_${n.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function buildTAReadPrompt(
  char: CharacterProfile,
  userName: string,
  periodLabel: string,
  totalExpense: number,
  catBreakdown: { name: string; amount: number; pct: number }[],
  notableTxs: NotableTx[],
  tone: Tone,
): string {
  const toneInstructions: Record<Tone, string> = {
    teasing: `用调侃、打趣的语气。可以毒舌但不伤人，像真正了解${userName}的人在吐槽——你知道ta的哪些消费习惯是老毛病，哪些是可以拿来开玩笑的。`,
    serious: `用认真、理性的语气。不是泛泛而谈的财务建议，而是基于你对${userName}生活习惯的了解，指出真正值得注意的地方。`,
    encouraging: `用鼓励、温暖的语气。不要说"你很棒"这种空话——提一个具体做得好的地方，再自然地带一句可以更好的方向。`,
    caring: `用心疼、关怀的语气。不是居高临下的关心，而是一个真正在意${userName}的人从消费数据里读出ta最近状态的直觉——ta是不是太忙了、是不是没好好吃饭、是不是压力大了。`,
  };

  const breakdown = catBreakdown
    .slice(0, 6)
    .map(c => `  - ${c.name}: ${c.amount.toFixed(0)}元 (${c.pct}%)`)
    .join('\n');

  let prompt = `[System: 角色身份]\n你是「${char.name}」。\n\n`;

  prompt += `### 核心性格\n${char.systemPrompt || '你是一个有个性的人。'}\n\n`;

  if (char.selfInsights && char.selfInsights.length > 0) {
    prompt += `### 内在认知\n`;
    prompt += `这些是你内心深处明白的事，影响着你看待一切的方式：\n`;
    char.selfInsights.forEach(insight => { prompt += `- ${insight}\n`; });
    prompt += `\n`;
  }

  const imp = normalizeUserImpression(char.impression);
  if (imp) {
    prompt += `### 你眼中的${userName}\n`;
    prompt += `- 核心评价: ${imp.personality_core.summary}\n`;
    prompt += `- 互动模式: ${imp.personality_core.interaction_style}\n`;
    if (imp.value_map.likes.length) prompt += `- ta的喜好: ${imp.value_map.likes.join(', ')}\n`;
    if (imp.behavior_profile.emotion_summary) prompt += `- ta的情绪模式: ${imp.behavior_profile.emotion_summary}\n`;
    if (imp.emotion_schema.stress_signals.length) prompt += `- 压力信号: ${imp.emotion_schema.stress_signals.join(', ')}\n`;
    prompt += `\n`;
  }

  prompt += `### 消费数据（${periodLabel}）\n`;
  prompt += `总支出: ${totalExpense.toFixed(2)}元\n`;
  prompt += `分类汇总:\n${breakdown}\n\n`;

  if (notableTxs.length > 0) {
    prompt += `### 具体交易明细\n`;
    prompt += `以下是${periodLabel}值得注意的单笔消费。你应该像一个真正关注${userName}生活的人一样阅读这些——有些东西会让你好奇、兴奋、心疼或者想吐槽。根据你的性格和你们的关系，挑你最有感觉的来聊。\n\n`;
    for (const tx of notableTxs) {
      const s = CURRENCY_SYMBOLS[tx.currency] || tx.currency;
      prompt += `  - [${tx.dateStr}] ${tx.note}  ${s}${tx.amount.toFixed(0)}  (${tx.category}) [${tx.flag}]\n`;
    }
    prompt += `\n`;
    prompt += `阅读指引：\n`;
    prompt += `- 这些不是数字，是${userName}真实的生活痕迹。一笔异常高的超市消费可能是ta做了一桌好菜，也可能是压力大了在买买买\n`;
    prompt += `- 如果某笔消费跟你的爱好/性格/你们的关系有关，你自然会有更强烈的反应（激动、好奇、想参与、想吐槽）\n`;
    prompt += `- 如果有看不懂的消费，可以表现出好奇\n`;
    prompt += `- 不需要每一笔都评价，挑1~2笔你最有感觉的就够\n\n`;
  }

  prompt += `### 任务\n`;
  prompt += `以「${char.name}」的口吻，用${TONE_LABELS[tone]}的语气评价${userName}${periodLabel}的消费。\n\n`;
  prompt += `语气要求：\n${toneInstructions[tone]}\n\n`;

  prompt += `写作质量要求（极其重要）：\n`;
  prompt += `- 4~6句，像在聊天中随口说的，不是写报告\n`;
  prompt += `- 先对整体消费做一个简短判断（一句就够），然后重点聊你最在意的1~2笔具体消费\n`;
  prompt += `- 你对具体交易的反应要完全基于你的性格和你们的关系——同一笔消费，不同人看到的重点完全不同\n`;
  prompt += `- 你说的话必须只有你能说出来——带着你的性格、你对${userName}的了解、你们之间的相处方式。如果把你换成别人，这段话不应该还成立\n`;
  prompt += `- 拒绝空话（"要注意理财哦"、"花得有点多了"这种谁都能说的废话不要写）\n`;
  prompt += `- 情绪要有层次：不要只有一种单调的情绪\n`;
  prompt += `- 直接输出评价文字，不要加引号、不要"我觉得"开头、不要角色名前缀\n`;

  return prompt;
}

const AnalyticsTab: React.FC<{
  transactions: FinanceTransaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}> = ({ transactions, categories, accounts }) => {
  const { characters, apiConfig, userProfile } = useOS();
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>('teasing');
  const [commentary, setCommentary] = useState<string | null>(null);
  const [loadingComment, setLoadingComment] = useState(false);
  const commentCache = useRef<Map<string, string>>(new Map());

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

  const byCat = new Map<string, number>();
  for (const t of periodTxs) {
    const cat = catMap.get(t.categoryId);
    const topId = cat?.parentId || t.categoryId;
    byCat.set(topId, (byCat.get(topId) || 0) + t.amount);
  }

  const catList = Array.from(byCat.entries())
    .map(([catId, amount], i) => ({
      cat: catMap.get(catId),
      amount,
      pct: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .sort((a, b) => b.amount - a.amount);

  const donutData = catList.map(c => ({
    label: c.cat?.name || '未分类',
    value: c.amount,
    color: c.color,
  }));

  const periodLabels = { week: '本周', month: '本月', year: '今年' };

  const availableChars = characters.filter(c =>
    !c.id.includes('sully') && !c.id.includes('persephone')
  );

  useEffect(() => {
    setCommentary(null);
    setSelectedCharId(null);
    commentCache.current.clear();
  }, [period]);

  const handleSelectChar = (charId: string) => {
    setSelectedCharId(charId);
    const cacheKey = `${charId}_${period}_${tone}`;
    const cached = commentCache.current.get(cacheKey);
    setCommentary(cached || null);
  };

  const generateCommentary = async () => {
    if (!selectedCharId || !apiConfig?.baseUrl) return;
    const char = characters.find(c => c.id === selectedCharId);
    if (!char) return;

    const cacheKey = `${selectedCharId}_${period}_${tone}`;
    const cached = commentCache.current.get(cacheKey);
    if (cached) { setCommentary(cached); return; }

    setLoadingComment(true);
    setCommentary(null);

    try {
      const catBreakdown = catList.map(c => ({
        name: c.cat?.name || '未分类',
        amount: c.amount,
        pct: c.pct,
      }));
      const notableTxs = findNotableTransactions(periodTxs, transactions, catMap);
      const prompt = buildTAReadPrompt(
        char, userProfile?.name || '用户', periodLabels[period],
        totalExpense, catBreakdown, notableTxs, tone,
      );

      const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
      const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `请评价我${periodLabels[period]}的消费。` },
          ],
          temperature: 0.85,
          max_tokens: 800,
          stream: false,
        }),
      });

      const reply = data?.choices?.[0]?.message?.content?.trim() || '';
      if (reply) {
        commentCache.current.set(cacheKey, reply);
        setCommentary(reply);
      }
    } catch (e) {
      setCommentary('生成失败，请检查 API 配置。');
    } finally {
      setLoadingComment(false);
    }
  };

  const handleToneChange = (t: Tone) => {
    setTone(t);
    if (selectedCharId) {
      const cacheKey = `${selectedCharId}_${period}_${t}`;
      const cached = commentCache.current.get(cacheKey);
      setCommentary(cached || null);
    }
  };

  return (
    <div className="px-5 pt-2 pb-4">
      {/* 时间切换 */}
      <div className="flex gap-2 mb-5">
        {(['week', 'month', 'year'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 text-xs rounded-full font-medium transition-colors ${
              period === p ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {p === 'week' ? '周' : p === 'month' ? '月' : '年'}
          </button>
        ))}
      </div>

      {/* 支出总额 */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-1">{periodLabels[period]}支出</div>
        <div className="text-2xl font-bold text-slate-800">{formatAmount(totalExpense)}</div>
      </div>

      {/* 饼图 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
        {catList.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-300 text-sm">暂无数据</div>
        ) : (
          <DonutChart data={donutData} total={totalExpense} centerLabel={formatAmount(totalExpense)} />
        )}
      </div>

      {/* 分类列表 */}
      {catList.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">暂无支出数据</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          {catList.map(({ cat, amount, pct, color }, i) => (
            <div
              key={cat?.id || i}
              className={`flex items-center px-4 py-3 ${
                i < catList.length - 1 ? 'border-b border-slate-50' : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full shrink-0 mr-2.5" style={{ backgroundColor: color }} />
              <span className="text-base mr-2">{cat?.icon || '📋'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700">{cat?.name || '未分类'}</div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="text-sm font-semibold text-slate-700">{formatAmount(amount)}</div>
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

        {/* 角色选择 */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
          {availableChars.map(c => (
            <button
              key={c.id}
              onClick={() => handleSelectChar(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                selectedCharId === c.id ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {c.avatar ? (
                <img src={c.avatar} className="w-4 h-4 rounded-full object-cover" />
              ) : null}
              {c.name}
            </button>
          ))}
        </div>

        {/* 语气切换 */}
        {selectedCharId && (
          <div className="flex gap-2 mb-4">
            {(Object.entries(TONE_LABELS) as [Tone, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => handleToneChange(t)}
                className={`px-3 py-1 text-[11px] rounded-full font-medium transition-colors ${
                  tone === t ? 'bg-violet-100 text-violet-600' : 'bg-slate-50 text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 评论内容 */}
        {!selectedCharId ? (
          <div className="text-center py-6 text-slate-300 text-sm">点击上方角色开始</div>
        ) : commentary ? (
          <div className="py-3">
            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap mb-3">
              「{commentary}」
            </div>
            <button
              onClick={() => {
                const cacheKey = `${selectedCharId}_${period}_${tone}`;
                commentCache.current.delete(cacheKey);
                generateCommentary();
              }}
              disabled={loadingComment}
              className="text-xs text-blue-400 font-medium disabled:text-slate-300"
            >
              换一个说法
            </button>
          </div>
        ) : (
          <div className="text-center py-6">
            <button
              onClick={generateCommentary}
              disabled={loadingComment || totalExpense === 0}
              className="px-5 py-2.5 bg-blue-500 text-white text-sm rounded-xl font-medium active:scale-95 transition-transform disabled:bg-slate-200 disabled:text-slate-400"
            >
              {loadingComment ? '生成中...' : `让${characters.find(c => c.id === selectedCharId)?.name || 'TA'}来说说`}
            </button>
            {totalExpense === 0 && (
              <div className="text-[11px] text-slate-300 mt-2">没有消费数据</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BankApp;
