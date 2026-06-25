import { describe, it, expect } from 'vitest';
import { normName, matchRealChar, clampAffinity, upsertContact, flipTranscript } from './relationshipChat';
import type { PhoneContact } from '../types';

describe('relationshipChat · 纯函数', () => {
    it('normName 去括号身份/空白/大小写', () => {
        expect(normName('阿哲 (社团学长)')).toBe('阿哲');
        expect(normName('  Alice  ')).toBe('alice');
        expect(normName('小明（前任）')).toBe('小明');
    });

    it('matchRealChar 精确 + 包含匹配', () => {
        const roster = [{ id: 'c1', name: '阿哲' }, { id: 'c2', name: 'Bella' }];
        expect(matchRealChar('阿哲', roster)).toBe('c1');
        expect(matchRealChar('阿哲 (学长)', roster)).toBe('c1');
        expect(matchRealChar('学长阿哲', roster)).toBe('c1'); // 包含
        expect(matchRealChar('bella', roster)).toBe('c2');
        expect(matchRealChar('陌生人', roster)).toBeUndefined();
        expect(matchRealChar('', roster)).toBeUndefined();
    });

    it('clampAffinity 钳制并取整到 -100..100', () => {
        expect(clampAffinity(150)).toBe(100);
        expect(clampAffinity(-150)).toBe(-100);
        expect(clampAffinity(12.6)).toBe(13);
        expect(clampAffinity(NaN)).toBe(0);
    });

    it('upsertContact 新增 / 合并不丢 id 与 createdAt', () => {
        const base: PhoneContact[] = [];
        const added = upsertContact(base, { name: '阿哲', kind: 'real', linkedCharId: 'c1', affinity: 30 });
        expect(added).toHaveLength(1);
        expect(added[0].id).toBeTruthy();
        expect(added[0].affinity).toBe(30);

        const origId = added[0].id;
        const origCreated = added[0].createdAt;
        const merged = upsertContact(added, { name: '阿哲 ', note: '欠我钱', affinity: 50 });
        expect(merged).toHaveLength(1); // 按名字归一去重
        expect(merged[0].id).toBe(origId);
        expect(merged[0].createdAt).toBe(origCreated);
        expect(merged[0].note).toBe('欠我钱');
        expect(merged[0].affinity).toBe(50);
    });

    it('upsertContact 好感钳制', () => {
        const r = upsertContact([], { name: 'X', affinity: 999 });
        expect(r[0].affinity).toBe(100);
    });

    it('flipTranscript 翻转我/对方视角', () => {
        const aDetail = '我: 在吗\n对方: 在的\n我: 借点钱';
        const flipped = flipTranscript(aDetail);
        expect(flipped).toBe('对方: 在吗\n我: 在的\n对方: 借点钱');
        // 翻两次回到原样
        expect(flipTranscript(flipped)).toBe(aDetail);
    });
});
