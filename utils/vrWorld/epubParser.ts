/**
 * Epub → 纯文本提取。用 JSZip 解压，手动解析 OPF spine 按章节顺序提取文本。
 * 比 epubjs 轻量得多，不会卡住。
 */
import JSZip from 'jszip';

export interface EpubMeta {
    title: string;
    author: string;
    text: string;
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

function isLeafBlock(el: Element): boolean {
    return BLOCK_TAGS.has(el.tagName) && !el.querySelector(Array.from(BLOCK_TAGS).join(','));
}

function htmlToText(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 把 <br> 替换为换行，保留段内换行
    doc.body.querySelectorAll('br').forEach(br => br.replaceWith('\n'));

    const leaves = doc.body.querySelectorAll(Array.from(BLOCK_TAGS).join(','));
    const leafBlocks = Array.from(leaves).filter(isLeafBlock);

    if (leafBlocks.length === 0) return doc.body.textContent?.trim() || '';

    const lines: string[] = [];
    for (const el of leafBlocks) {
        const t = (el.textContent || '').trim();
        if (t) lines.push(t);
    }
    return lines.join('\n\n');
}

function resolveHref(base: string, href: string): string {
    if (href.startsWith('/')) return href.slice(1);
    const parts = base.split('/');
    parts.pop();
    for (const seg of href.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
    }
    return parts.join('/');
}

export async function parseEpub(buf: ArrayBuffer): Promise<EpubMeta> {
    const zip = await JSZip.loadAsync(buf);

    // 1. 找 OPF 文件路径（从 META-INF/container.xml）
    let opfPath = '';
    const container = zip.file('META-INF/container.xml');
    if (container) {
        const xml = await container.async('string');
        const match = xml.match(/full-path="([^"]+)"/);
        if (match) opfPath = match[1];
    }

    // fallback: 找第一个 .opf 文件
    if (!opfPath) {
        zip.forEach((path) => {
            if (!opfPath && path.endsWith('.opf')) opfPath = path;
        });
    }
    if (!opfPath) throw new Error('找不到 OPF 文件，可能不是有效的 epub');

    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('OPF 文件不存在');
    const opfXml = await opfFile.async('string');
    const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // 2. 提取元数据
    const titleEl = opfDoc.querySelector('metadata title, metadata dc\\:title');
    const creatorEl = opfDoc.querySelector('metadata creator, metadata dc\\:creator');
    const title = titleEl?.textContent?.trim() || '';
    const author = creatorEl?.textContent?.trim() || '';

    // 3. 建 manifest id → href 映射
    const manifest = new Map<string, string>();
    opfDoc.querySelectorAll('manifest item').forEach(item => {
        const id = item.getAttribute('id') || '';
        const href = item.getAttribute('href') || '';
        const mediaType = item.getAttribute('media-type') || '';
        if (id && href && mediaType.includes('html')) {
            manifest.set(id, href);
        }
    });

    // 4. 按 spine 顺序读章节
    const spineRefs: string[] = [];
    opfDoc.querySelectorAll('spine itemref').forEach(ref => {
        const idref = ref.getAttribute('idref') || '';
        if (idref && manifest.has(idref)) spineRefs.push(idref);
    });

    // fallback: 没有 spine 就按 manifest 顺序
    const orderedIds = spineRefs.length > 0 ? spineRefs : [...manifest.keys()];

    const chapters: string[] = [];
    for (const id of orderedIds) {
        const href = manifest.get(id);
        if (!href) continue;
        const filePath = opfDir ? resolveHref(opfPath, href) : href;
        const file = zip.file(filePath);
        if (!file) continue;
        try {
            const html = await file.async('string');
            const text = htmlToText(html);
            if (text) chapters.push(text);
        } catch { /* skip */ }
    }

    return { title, author, text: chapters.join('\n\n') };
}
