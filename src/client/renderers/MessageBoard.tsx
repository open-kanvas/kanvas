import type { ReactNode } from 'react';
import type { RendererProps } from './Renderer';
import { messageBoardDataSchema, type MessageBoardData } from '../../shared/message-board';
import { useRegional } from './Regional';
import { regionalDateTime } from '../../shared/regional';
import './message-board.css';

/** Snapshot of the public message board supplied by kanvas.board.overview. */
export function MessageBoardView(props: RendererProps) {
  const data = messageBoardDataSchema.parse(props.view.data), regional = useRegional(), most = Math.max(1, ...data.tags.map(t => t.count));
  const message = (m: MessageBoardData['latest'][number], key: string | number): ReactNode => <li key={key} data-board-message-id={m.id} data-context-only={m.contextOnly || undefined} className={m.isNew ? 'is-new' : ''}>
    <p className="message-meta"><strong>{m.author}</strong>{m.maintainer && <span className="message-maintainer">maintainer</span>}
      {m.at && <time dateTime={m.at}>{regionalDateTime(m.at, regional)}</time>}
      {m.editedAt && <span className="message-edited">edited <time dateTime={m.editedAt}>{regionalDateTime(m.editedAt, regional)}</time></span>}
      {m.contextOnly && !m.removed && <span className="message-context">Earlier message</span>}
      {m.isNew && <span className="message-new">new</span>}</p>
    <p className="message-text">{m.text}</p>
    {!!m.tags.length && <p className="message-tags">{m.tags.map(tag => <span key={tag}>#{tag}</span>)}</p>}
    {!!m.replies?.length && <ol className="message-board-replies" aria-label={`Replies to ${m.author}`}>{m.replies.map((reply, index) => message(reply, reply.id ?? index))}</ol>}
  </li>;
  return <div className="message-board" data-navigation-scroll>
    <header><div><h2>{data.title ?? 'Message board'}</h2><p className="message-board-public">Public · visible to every user of this Kanvas</p></div>
      <dl><div><dt>Messages</dt><dd>{data.total}</dd></div><div className={data.newCount ? 'is-new' : ''}><dt>New</dt><dd data-board-new>{data.newCount}</dd></div></dl></header>
    {!!data.tags.length && <ul className="message-board-tags" aria-label="Messages by tag">{data.tags.map(t => <li key={t.tag}><span className="tag-name">#{t.tag}</span><span className="tag-bar"><i style={{ width: `${Math.max(4, t.count / most * 100)}%` }} /></span><span className="tag-count">{t.count}</span>{t.newCount > 0 && <span className="tag-new">{t.newCount} new</span>}</li>)}</ul>}
    {!!data.latest.length && <ol className="message-board-latest" aria-label="Latest messages">{data.latest.map((item, index) => message(item, item.id ?? index))}</ol>}
    {!data.total && <p className="content-empty">No messages yet.</p>}
  </div>;
}
