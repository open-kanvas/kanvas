import { Fragment, useRef, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MarkdownData } from '../../shared/markdown';
import { highlightLine } from './Code';
import { useReading } from './Reading';
import './markdown.css';

export function MarkdownRenderer({ data, preview = false }: { data: MarkdownData; preview?: boolean }) {
  const scroll = useRef<HTMLDivElement>(null);
  const { reading, pixelsPerSecond, pause } = useReading(scroll, !preview);
  return <div className="document-shell markdown-shell">
    <div ref={scroll} className="document-content document-reading markdown-content" data-navigation-scroll
      data-reading-wpm={reading.wpm} data-reading-pixels-per-second={pixelsPerSecond} data-reading-playing={reading.playing}
      style={{ '--reading-font-size': `${reading.fontSize}px`, '--reading-zoom': reading.zoom } as CSSProperties}
      onWheel={pause} onTouchStart={pause} role="region" aria-label="Markdown reader" tabIndex={0}>
      <article className="document-article markdown-article">
        <ReactMarkdown remarkPlugins={[remarkGfm]} disallowedElements={['img']} components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          table: ({ node: _node, ...props }) => <div className="markdown-table-scroll"><table {...props} /></div>,
          code: ({ node: _node, className, children, ...props }) => {
            const language = /(?:^|\s)language-([^\s]+)/.exec(className ?? '')?.[1];
            const value = String(children);
            return <code {...props} className={className}>{language ? value.split('\n').map((line, index, lines) => <Fragment key={index}>{line ? highlightLine(line, language) : ''}{index < lines.length - 1 ? '\n' : ''}</Fragment>) : children}</code>;
          },
        }}>{data.text}</ReactMarkdown>
      </article>
    </div>
  </div>;
}
