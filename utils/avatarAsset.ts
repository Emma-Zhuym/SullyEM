import { DB } from './db';

export const AVATAR_ASSET_PREFIX = 'asset:';

/** 上传头像时调用：把 base64 存入 assets 表，返回 { ref, resolved } */
export async function saveAvatarAsset(base64: string): Promise<{ ref: string; resolved: string }> {
    const ref = AVATAR_ASSET_PREFIX + crypto.randomUUID();
    await DB.saveAsset(ref, base64);
    return { ref, resolved: base64 };
}

/** 解析单个头像引用：asset:uuid → base64，其他原样返回 */
export async function resolveAvatarRef(src: string): Promise<string> {
    if (!src.startsWith(AVATAR_ASSET_PREFIX)) return src;
    return (await DB.getAsset(src)) || '';
}

/** 批量解析一组角色头像，返回 { charId → resolvedSrc } 映射 */
export async function resolveCharAvatars(
    chars: { id: string; avatar?: string }[]
): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    await Promise.all(
        chars.map(async (c) => {
            if (c.avatar?.startsWith(AVATAR_ASSET_PREFIX)) {
                const resolved = await resolveAvatarRef(c.avatar);
                result.set(c.id, resolved);
            }
        })
    );
    return result;
}
