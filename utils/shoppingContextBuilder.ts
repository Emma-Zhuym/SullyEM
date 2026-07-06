/**
 * shoppingContextBuilder.ts — 购物感知注入
 *
 * 外卖（food）：ETA 精确到分钟，到时间自动标 done
 * 快递（net）：ETA 只有日期，到日期提醒但不自动标 done，等用户手动确认收货
 */

import { ShoppingDB, type ShopOrder } from './shoppingDb';

function isEtaDateReached(etaTimestamp: number): boolean {
  const eta = new Date(etaTimestamp);
  const today = new Date();
  return today.getFullYear() > eta.getFullYear()
    || (today.getFullYear() === eta.getFullYear() && today.getMonth() > eta.getMonth())
    || (today.getFullYear() === eta.getFullYear() && today.getMonth() === eta.getMonth() && today.getDate() >= eta.getDate());
}

export async function buildShoppingDeliveryContext(charId: string): Promise<string | null> {
  try {
    const [orders, products] = await Promise.all([ShoppingDB.getOrders(), ShoppingDB.getProducts()]);
    const now = Date.now();

    const parts: string[] = [];
    const justDelivered: string[] = [];
    const netArrived: string[] = [];
    const inTransit: string[] = [];
    const justOrdered: string[] = [];

    for (const o of orders) {
      if (!o.receiverCharId || o.receiverCharId !== charId) continue;
      if (o.status !== 'active' || !o.etaTimestamp) continue;

      const items = o.lines.map(l => {
        const p = products.find(x => x.id === l.id);
        return p ? `${p.name}×${l.qty}` : '';
      }).filter(Boolean).join('、');

      if (!items) continue;

      const noteClause = o.note ? `，用户附言：「${o.note}」` : '';

      if (o.type === 'food') {
        if (o.etaTimestamp <= now) {
          justDelivered.push(`外卖（${items}）刚刚送到了${noteClause}`);
          await ShoppingDB.saveOrder({ ...o, status: 'done', awaitingReply: true });
        } else {
          const remainMin = Math.ceil((o.etaTimestamp - now) / 60000);
          if (now - o.placedAt < 5 * 60 * 1000) {
            justOrdered.push(`用户刚给你点了外卖（${items}），大概 ${remainMin} 分钟后到${noteClause}`);
          } else {
            inTransit.push(`你有一份外卖（${items}）在路上，还有约 ${remainMin} 分钟`);
          }
        }
      } else {
        if (isEtaDateReached(o.etaTimestamp)) {
          netArrived.push(`快递（${items}）今天应该到了${noteClause}`);
        } else {
          const d = new Date(o.etaTimestamp);
          const etaStr = `${d.getMonth() + 1}月${d.getDate()}日`;
          if (now - o.placedAt < 5 * 60 * 1000) {
            justOrdered.push(`用户刚给你买了快递（${items}），预计 ${etaStr} 到${noteClause}`);
          } else {
            inTransit.push(`你有一个快递（${items}）在路上，预计 ${etaStr} 到`);
          }
        }
      }
    }

    if (justDelivered.length > 0) {
      parts.push(`🍜 外卖到了：${justDelivered.join('；')}。自然地表现出收到吃的/喝的反应——惊喜、感谢、评价味道都行，用你自己的方式，不要生硬复述。`);
    }
    if (netArrived.length > 0) {
      parts.push(`📦 快递到了：${netArrived.join('；')}。表现出拆快递的反应——好奇、开心、评价礼物都行，用你自己的方式表达。`);
    }
    if (justOrdered.length > 0) {
      parts.push(`🛒 新订单：${justOrdered.join('；')}。可以表现出期待，但不必每句话都提。`);
    }
    if (inTransit.length > 0) {
      parts.push(`🚚 配送中：${inTransit.join('；')}。知道有东西在路上就好，偶尔提一嘴但不用刻意。`);
    }

    if (parts.length === 0) return null;

    return `\n\n【购物感知】\n${parts.join('\n')}`;
  } catch {
    return null;
  }
}
