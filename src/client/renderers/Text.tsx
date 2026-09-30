import { FormattedTime } from './Regional';
import type { TranscriptionData, TranslationData } from '../../shared/view-schemas';

function languageTag(value?: string) {
  return value && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(value) ? value : undefined;
}

export function TranscriptionRenderer({ data, showSource = false }: { data: TranscriptionData; showSource?: boolean }) {
  const live = data.status === 'live';
  return <div className="transcription-content" lang={languageTag(data.language)}>
    {(live || showSource || data.language) && <div className="transcription-heading">{live && <span className="content-eyebrow">Updating transcript</span>}<span>{showSource ? 'Supplied text' : ''}{data.language ? `${showSource ? ' · ' : ''}${data.language}` : ''}</span></div>}
    <ol className="transcript-segments" role={live ? 'log' : undefined} aria-live={live ? 'polite' : 'off'} aria-relevant="additions" aria-label="Transcript">
      {data.segments.map(segment => <li key={segment.id} data-segment-id={segment.id}>
        {(segment.speaker || segment.timestamp) && <div className="transcript-meta">{segment.timestamp && <span className="transcript-timestamp">{<FormattedTime value={segment.timestamp}/>} </span>}{segment.speaker && <strong>{segment.speaker}</strong>}</div>}
        <p dir="auto">{segment.text}</p>
      </li>)}
    </ol>
  </div>;
}

export function TranslationRenderer({ data }: { data: TranslationData }) {
  return <div className={`translation-content translation-${data.layout ?? 'side-by-side'}`}>
    <section className="translation-source" lang={languageTag(data.sourceLanguage)} aria-label="Original text">
      <div className="translation-label"><span className="content-eyebrow">Original</span><strong>{data.sourceLanguage === 'und' ? 'Language not specified' : data.sourceLanguage}</strong></div>
      <p dir="auto">{data.sourceText}</p>
    </section>
    <section className="translation-target" lang={languageTag(data.targetLanguage)} aria-label="Translation">
      <div className="translation-label"><span className="content-eyebrow">Translation</span><strong>{data.targetLanguage}</strong></div>
      <p dir="auto">{data.targetText}</p>
    </section>
  </div>;
}
