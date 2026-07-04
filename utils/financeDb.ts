/**
 * financeDb.ts — EM 记账重设计的 IndexedDB 操作
 *
 * 独立数据库，不动上游 AetherOS_Data。
 * 三个 store：accounts / categories / transactions
 */

import { FinanceAccount, FinanceCategory, FinanceTransaction, FinanceTxType } from '../types';

const DB_NAME = 'SullyEM_Finance';
const DB_VERSION = 3;

const STORE_ACCOUNTS = 'accounts';
const STORE_CATEGORIES = 'categories';
const STORE_TX = 'transactions';
const STORE_TA_COMMENTS = 'ta_comments';
const STORE_SETTINGS = 'settings';

// ── 默认预设分类 ──

const DEFAULT_CATEGORIES: FinanceCategory[] = [
  { id: 'cat_food', name: '餐饮', icon: '🍜' },
  { id: 'cat_food_takeout', name: '外卖', icon: '🥡', parentId: 'cat_food' },
  { id: 'cat_food_dine', name: '堂食', icon: '🍽️', parentId: 'cat_food' },
  { id: 'cat_food_coffee', name: '咖啡', icon: '☕', parentId: 'cat_food' },
  { id: 'cat_food_snack', name: '超市零食', icon: '🛒', parentId: 'cat_food' },

  { id: 'cat_transport', name: '交通', icon: '🚗' },
  { id: 'cat_transport_metro', name: '地铁/公交', icon: '🚇', parentId: 'cat_transport' },
  { id: 'cat_transport_taxi', name: '打车', icon: '🚕', parentId: 'cat_transport' },
  { id: 'cat_transport_gas', name: '加油', icon: '⛽', parentId: 'cat_transport' },
  { id: 'cat_transport_flight', name: '机票', icon: '✈️', parentId: 'cat_transport' },

  { id: 'cat_shopping', name: '购物', icon: '🛍️' },
  { id: 'cat_shopping_clothes', name: '服饰', icon: '👗', parentId: 'cat_shopping' },
  { id: 'cat_shopping_electronics', name: '电子', icon: '📱', parentId: 'cat_shopping' },
  { id: 'cat_shopping_daily', name: '日用品', icon: '🧴', parentId: 'cat_shopping' },

  { id: 'cat_fun', name: '娱乐', icon: '🎮' },
  { id: 'cat_fun_sub', name: '订阅/会员', icon: '📺', parentId: 'cat_fun' },
  { id: 'cat_fun_game', name: '游戏', icon: '🕹️', parentId: 'cat_fun' },
  { id: 'cat_fun_movie', name: '电影', icon: '🎬', parentId: 'cat_fun' },

  { id: 'cat_medical', name: '医疗', icon: '🏥' },
  { id: 'cat_study', name: '学习', icon: '📚' },

  { id: 'cat_transfer', name: '转账', icon: '🔄' },

  { id: 'cat_income', name: '收入', icon: '💰' },
  { id: 'cat_income_salary', name: '工资', icon: '💵', parentId: 'cat_income' },
  { id: 'cat_income_scholarship', name: '奖学金', icon: '🎓', parentId: 'cat_income' },
  { id: 'cat_income_transfer', name: '转账收入', icon: '🔄', parentId: 'cat_income' },
  { id: 'cat_income_refund', name: '退款', icon: '↩️', parentId: 'cat_income' },
];

// ── 打开数据库 ──

function openFinanceDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
        db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_TX)) {
        const txStore = db.createObjectStore(STORE_TX, { keyPath: 'id' });
        txStore.createIndex('accountId', 'accountId', { unique: false });
        txStore.createIndex('dateStr', 'dateStr', { unique: false });
        txStore.createIndex('categoryId', 'categoryId', { unique: false });
      }
      // v2: TA读评论持久化
      if (!db.objectStoreNames.contains(STORE_TA_COMMENTS)) {
        db.createObjectStore(STORE_TA_COMMENTS, { keyPath: 'id' });
      }
      // v3: 设置
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
  });
}

// ── 通用 helpers ──

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openFinanceDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(data);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(storeName: string, id: string): Promise<void> {
  const db = await openFinanceDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getById<T>(storeName: string, id: string): Promise<T | null> {
  const db = await openFinanceDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// ── 分类初始化 ──

async function ensureDefaultCategories(): Promise<void> {
  const existing = await getAll<FinanceCategory>(STORE_CATEGORIES);
  if (existing.length > 0) return;
  const db = await openFinanceDB();
  const tx = db.transaction(STORE_CATEGORIES, 'readwrite');
  const store = tx.objectStore(STORE_CATEGORIES);
  for (const cat of DEFAULT_CATEGORIES) {
    store.put(cat);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── 公开 API ──

export const FinanceDB = {
  init: ensureDefaultCategories,

  // 账户
  getAccounts: () => getAll<FinanceAccount>(STORE_ACCOUNTS),
  getAccount: (id: string) => getById<FinanceAccount>(STORE_ACCOUNTS, id),
  saveAccount: (a: FinanceAccount) => put(STORE_ACCOUNTS, a),
  deleteAccount: (id: string) => del(STORE_ACCOUNTS, id),

  // 分类
  getCategories: () => getAll<FinanceCategory>(STORE_CATEGORIES),
  saveCategory: (c: FinanceCategory) => put(STORE_CATEGORIES, c),
  deleteCategory: (id: string) => del(STORE_CATEGORIES, id),

  // 交易
  getTransactions: () => getAll<FinanceTransaction>(STORE_TX),
  getTransaction: (id: string) => getById<FinanceTransaction>(STORE_TX, id),
  saveTransaction: (t: FinanceTransaction) => put(STORE_TX, t),
  deleteTransaction: (id: string) => del(STORE_TX, id),

  getTransactionsByAccount: async (accountId: string): Promise<FinanceTransaction[]> => {
    const db = await openFinanceDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TX, 'readonly');
      const index = tx.objectStore(STORE_TX).index('accountId');
      const req = index.getAll(accountId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  getTransactionsByDateRange: async (from: string, to: string): Promise<FinanceTransaction[]> => {
    const db = await openFinanceDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TX, 'readonly');
      const index = tx.objectStore(STORE_TX).index('dateStr');
      const range = IDBKeyRange.bound(from, to);
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  // 设置
  getSetting: async <T = unknown>(key: string): Promise<T | null> => {
    const row = await getById<{ key: string; value: T }>(STORE_SETTINGS, key);
    return row?.value ?? null;
  },
  saveSetting: <T = unknown>(key: string, value: T) => put(STORE_SETTINGS, { key, value }),

  // TA读评论
  getTAComment: (id: string) => getById<{ id: string; text: string; createdAt: number }>(STORE_TA_COMMENTS, id),
  saveTAComment: (comment: { id: string; text: string; createdAt: number }) => put(STORE_TA_COMMENTS, comment),
  getAllTAComments: () => getAll<{ id: string; text: string; createdAt: number }>(STORE_TA_COMMENTS),

  // 备份导出：一次性读出全部 store
  exportAll: async () => {
    const [accounts, categories, transactions, taComments, settings] = await Promise.all([
      getAll<FinanceAccount>(STORE_ACCOUNTS),
      getAll<FinanceCategory>(STORE_CATEGORIES),
      getAll<FinanceTransaction>(STORE_TX),
      getAll<{ id: string; text: string; createdAt: number }>(STORE_TA_COMMENTS),
      getAll<{ key: string; value: unknown }>(STORE_SETTINGS),
    ]);
    return { accounts, categories, transactions, taComments, settings };
  },

  // 备份导入：清空后写入全部数据
  importAll: async (data: {
    accounts?: FinanceAccount[];
    categories?: FinanceCategory[];
    transactions?: FinanceTransaction[];
    taComments?: { id: string; text: string; createdAt: number }[];
    settings?: { key: string; value: unknown }[];
  }) => {
    const db = await openFinanceDB();
    const storeNames = [STORE_ACCOUNTS, STORE_CATEGORIES, STORE_TX, STORE_TA_COMMENTS, STORE_SETTINGS]
      .filter(s => db.objectStoreNames.contains(s));
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) tx.objectStore(name).clear();
    if (data.accounts) for (const a of data.accounts) tx.objectStore(STORE_ACCOUNTS).put(a);
    if (data.categories) for (const c of data.categories) tx.objectStore(STORE_CATEGORIES).put(c);
    if (data.transactions) for (const t of data.transactions) tx.objectStore(STORE_TX).put(t);
    if (data.taComments) for (const c of data.taComments) tx.objectStore(STORE_TA_COMMENTS).put(c);
    if (data.settings) for (const s of data.settings) tx.objectStore(STORE_SETTINGS).put(s);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // 余额计算
  calcAccountBalance: async (account: FinanceAccount): Promise<number> => {
    const allTx = await getAll<FinanceTransaction>(STORE_TX);
    let balance = account.initialBalance;
    for (const t of allTx) {
      if (t.accountId === account.id) {
        if (t.type === 'income' || t.type === 'refund') balance += t.amount;
        else if (t.type === 'expense') balance -= t.amount;
        else if (t.type === 'transfer') balance -= t.amount;
      }
      if (t.type === 'transfer' && t.toAccountId === account.id) {
        balance += (t.toAmount ?? t.amount);
      }
    }
    return balance;
  },
};
