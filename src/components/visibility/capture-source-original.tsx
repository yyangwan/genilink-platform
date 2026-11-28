import { Fragment, useState } from 'react';
import type { CaptureSourceMedia, CaptureSourceOriginal } from '@/lib/visibility/v4-audit';

export function SafeSourceLink({ url, label = '打开来源链接 ↗' }: { url: string | null; label?: string }) {
  if (!url) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  return <a className="v4-link" href={parsed.href} target="_blank" rel="noopener noreferrer">{label}</a>;
}

function InlineMedia({ item, preview }: { item: CaptureSourceMedia; preview: string }) {
  const [error, setError] = useState(false);
  const isVideo = item.kind === 'video';
  const description = item.label || (isVideo ? '来源视频封面' : '来源图片');
  return <figure className="v4-original-media">
    {item.has_preview && !error && (
      // The authenticated preview endpoint serves a bounded WebP directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt={description} loading="lazy" decoding="async" onError={() => setError(true)} />
    )}
    <figcaption>
      {item.label && <span>{item.label}</span>}
      {(!item.has_preview || error) && <span>{isVideo ? '视频封面暂不可查看' : '图片快照暂不可查看'}</span>}
      <SafeSourceLink url={item.url} label={isVideo ? '打开原视频 ↗' : '打开原图 ↗'} />
    </figcaption>
  </figure>;
}

export function ArchivedOriginal({ data, previewOptions }: {
  data: CaptureSourceOriginal; previewOptions: Record<string, string>;
}) {
  const { text, media = [] } = data;
  const characters = media.length ? Array.from(text) : [];
  const placement = (item: CaptureSourceMedia) => {
    const offset = item.text_offset;
    return offset !== null && Number.isInteger(offset) && offset >= 0 && offset <= characters.length
      ? offset : characters.length;
  };
  const ordered = [...media].sort((a, b) => placement(a) - placement(b) || a.ordinal - b.ordinal);
  const last = ordered.at(-1);
  const tail = last ? characters.slice(placement(last)).join('') : text;
  return <div className="v4-original-reader">
    <h4>引用正文原文</h4>
    {!text && <p className="v4-note">该来源未取得文章正文。</p>}
    {ordered.map((item, index) => {
      const start = index === 0 ? 0 : placement(ordered[index - 1]);
      const passage = characters.slice(start, placement(item)).join('');
      const query = new URLSearchParams({ ...previewOptions, mediaOrdinal: String(item.ordinal) });
      return <Fragment key={`${previewOptions.snapshotId}:${item.ordinal}`}>
        {passage && <div className="v4-pre">{passage}</div>}
        <InlineMedia item={item} preview={`/api/integration/intelligence/media?${query}`} />
      </Fragment>;
    })}
    {tail && <div className="v4-pre">{tail}</div>}
  </div>;
}
