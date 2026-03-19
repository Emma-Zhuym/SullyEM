/**
 * DramaFeed — 事件信息流 (retro terminal/notepad style)
 * Compact entries, collapsible narrative details
 */

import React, { useState } from 'react';
import { LifeSimState, SimAction } from '../../types';
import {
    Alien, ChatCircleDots, BookOpen, Globe, Lightning,
} from '@phosphor-icons/react';

const EVENT_ACCENTS: Record<string, string> = {
    fight:    '#b85050',
    romance:  '#c06090',
    gossip:   '#8b6bb8',
    alliance: '#5080b8',
    party:    '#b89840',
    rivalry:  '#c07040',
};

const TONE_DOTS: Record<string, string> = {
    vengeful: '#b85050',
    romantic: '#c06090',
    scheming: '#8b6bb8',
    chaotic:  '#c07040',
    peaceful: '#5b9b6b',
    amused:   '#b89840',
    anxious:  '#5070b0',
};

function getEventAccent(action: SimAction): string {
    const desc = action.description.toLowerCase();
    if (desc.includes('fight') || desc.includes('吵架') || desc.includes('打架')) return EVENT_ACCENTS.fight;
    if (desc.includes('romance') || desc.includes('暧昧') || desc.includes('恋')) return EVENT_ACCENTS.romance;
    if (desc.includes('gossip') || desc.includes('闲话') || desc.includes('八卦')) return EVENT_ACCENTS.gossip;
    if (desc.includes('alliance') || desc.includes('结盟')) return EVENT_ACCENTS.alliance;
    if (desc.includes('party') || desc.includes('联谊') || desc.includes('派对')) return EVENT_ACCENTS.party;
    if (desc.includes('rivalry') || desc.includes('竞争')) return EVENT_ACCENTS.rivalry;
    if (action.actorId === 'system' || action.actorId === 'autonomous') return '#8b6bb8';
    if (action.actorId === 'user') return '#5b9b6b';
    return '#888';
}

const DramaEntry: React.FC<{ action: SimAction }> = ({ action }) => {
    const [expanded, setExpanded] = useState(false);
    const accent = getEventAccent(action);
    const narrative = action.narrative;
    const hasDetails = !!(narrative?.innerThought || narrative?.dialogue || narrative?.commentOnWorld || action.reasoning || action.reactionToUser);
    const toneColor = narrative?.emotionalTone ? TONE_DOTS[narrative.emotionalTone] : undefined;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderLeft: `3px solid ${accent}`,
            borderRadius: 4,
            padding: '5px 8px',
            cursor: hasDetails ? 'pointer' : 'default',
        }} onClick={() => hasDetails && setExpanded(!expanded)}>
            {/* Compact header line */}
            <div className="flex items-center gap-1.5">
                <div className="flex-shrink-0" style={{
                    width: 18, height: 18, borderRadius: 3,
                    overflow: 'hidden', background: 'rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {action.actorAvatar?.startsWith('http') || action.actorAvatar?.startsWith('data:')
                        ? <img src={action.actorAvatar} style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 3 }} alt="" />
                        : action.actorAvatar ? <span style={{ fontSize: 11 }}>{action.actorAvatar}</span>
                        : <Alien size={10} weight="bold" style={{ color: '#aaa' }} />}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: accent }}>{action.actor}</span>
                {toneColor && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: toneColor, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 8, color: '#bbb', marginLeft: 'auto', fontFamily: 'monospace' }}>R{action.turnNumber}</span>
                {hasDetails && (
                    <span style={{ fontSize: 8, color: '#ccc' }}>{expanded ? '▼' : '▶'}</span>
                )}
            </div>

            {/* Description (always visible, compact) */}
            <p style={{ fontSize: 10, color: '#555', lineHeight: 1.4, marginTop: 3 }}>{action.description}</p>

            {/* Result (always show if different) */}
            {action.immediateResult && action.immediateResult !== action.description && (
                <p style={{ fontSize: 9, color: '#888', marginTop: 2 }}>→ {action.immediateResult}</p>
            )}

            {/* Expanded narrative details */}
            {expanded && hasDetails && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                    {(narrative?.innerThought || action.reasoning) && (
                        <div className="retro-inset" style={{ padding: '3px 6px', marginBottom: 4 }}>
                            <p style={{ fontSize: 9, color: '#998', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ChatCircleDots size={9} weight="bold" /> {narrative?.innerThought || action.reasoning}
                            </p>
                        </div>
                    )}
                    {narrative?.dialogue && (
                        <p style={{ fontSize: 9, color: '#666', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                            <BookOpen size={9} weight="bold" style={{ flexShrink: 0 }} /> {narrative.dialogue}
                        </p>
                    )}
                    {narrative?.commentOnWorld && (
                        <p style={{ fontSize: 8, color: '#aaa', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Globe size={8} weight="bold" style={{ flexShrink: 0 }} /> {narrative.commentOnWorld}
                        </p>
                    )}
                    {action.reactionToUser && (
                        <p style={{ fontSize: 9, color: '#9080a0', fontStyle: 'italic', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <ChatCircleDots size={9} weight="bold" style={{ flexShrink: 0 }} /> "{action.reactionToUser}"
                        </p>
                    )}
                </div>
            )}

            {/* Chain event marker */}
            {action.chainFromId && (
                <p style={{ fontSize: 8, color: '#b89840', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Lightning size={8} weight="bold" style={{ flexShrink: 0 }} /> 连锁事件
                </p>
            )}
        </div>
    );
};

const DramaFeed: React.FC<{ gameState: LifeSimState }> = ({ gameState }) => {
    const logs = [...gameState.actionLog].reverse().slice(0, 50);

    return (
        <div style={{ padding: 6 }} className="space-y-1">
            {logs.length === 0 ? (
                <div className="text-center py-8" style={{ color: '#999', fontSize: 11 }}>还没有任何戏剧发生...</div>
            ) : logs.map(action => (
                <DramaEntry key={action.id} action={action} />
            ))}
        </div>
    );
};

export default DramaFeed;
