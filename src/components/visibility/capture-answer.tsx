import type { Element, Root, Text } from 'hast';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CaptureAnswerReference } from '@/lib/visibility/v4-audit';

function referenceOffsets(text: string, references: CaptureAnswerReference[], ordinals: ReadonlySet<number>) {
  // The capture API uses Unicode code points. Markdown positions use UTF-16.
  const offsets = [0];
  for (const character of text) offsets.push(offsets[offsets.length - 1] + character.length);
  return references.flatMap(({ start, end, ordinal }) => {
    const left = offsets[start], right = offsets[end];
    if (left === undefined || !(right > left) || !ordinals.has(ordinal)) return [];
    const token = text.slice(left, right);
    return token === `[${ordinal}]` || token === `【${ordinal}】` ? [{ start: left, end: right, ordinal }] : [];
  }).sort((a, b) => a.start - b.start);
}

function captureLayout(text: string, references: CaptureAnswerReference[], ordinals: ReadonlySet<number>) {
  return () => (root: Root) => {
    const markers = references.length ? referenceOffsets(text, references, ordinals) : [];
    let markerIndex = 0;
    const formatChildren = (parent: Root | Element) => {
      parent.children = parent.children.flatMap((child): Array<typeof child> => {
        if (child.type === 'element' && !['a', 'code', 'pre'].includes(child.tagName)) formatChildren(child);
        if (child.type !== 'text') return [child];
        const start = child.position?.start.offset, end = child.position?.end.offset;
        if (start === undefined || end === undefined || text.slice(start, end) !== child.value) return [child];

        const parts: Array<Element | Text> = [];
        let cursor = start;
        while (markerIndex < markers.length && markers[markerIndex].start < end) {
          const marker = markers[markerIndex++];
          if (marker.start < cursor || marker.end > end) continue;
          if (cursor < marker.start) parts.push({ type: 'text', value: text.slice(cursor, marker.start) });
          parts.push({ type: 'element', tagName: 'a', properties: { dataCaptureOrdinal: marker.ordinal },
            children: [{ type: 'text', value: text.slice(marker.start, marker.end) }] });
          cursor = marker.end;
        }
        if (!parts.length) return [child];
        if (cursor < end) parts.push({ type: 'text', value: text.slice(cursor, end) });
        return parts;
      }) as typeof parent.children;
    };

    if (markers.length) formatChildren(root);
    if (root.children.every(child => child.type === 'text' || (child.type === 'element'
      && child.tagName === 'p' && child.children.every(item => item.type === 'text')))) {
      root.children = [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: text }] }];
    }
  };
}

export function CaptureAnswer({ text, references = [], ordinals, onReference }: {
  text: string; references?: CaptureAnswerReference[]; ordinals: ReadonlySet<number>; onReference: (ordinal: number) => void;
}) {
  return <div className="v4-captured-answer">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[captureLayout(text, references, ordinals)]} components={{
      h1: ({ children }) => <h4>{children}</h4>,
      h2: ({ children }) => <h4>{children}</h4>,
      h3: ({ children }) => <h4>{children}</h4>,
      h4: ({ children }) => <h5>{children}</h5>,
      h5: ({ children }) => <h5>{children}</h5>,
      h6: ({ children }) => <h5>{children}</h5>,
      table: ({ children }) => <div className="v4-answer-table" tabIndex={0} role="region" aria-label="回答表格"><table>{children}</table></div>,
      a: ({ node, children }) => {
        const ordinal = node?.properties.dataCaptureOrdinal;
        return typeof ordinal === 'number' && ordinals.has(ordinal)
          ? <button type="button" className="v4-answer-reference" aria-label={`定位引用 ${ordinal}`} onClick={() => onReference(ordinal)}>{children}</button>
          : <>{children}</>;
      },
      img: ({ alt }) => <>{alt}</>,
    }}>{text}</Markdown>
  </div>;
}
