import { useContext } from 'react';
import { ImageFallbackContext } from './ImageFallback';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { safeUrl, api, displayPath } from '../api';
import { Icon } from '../icons';
import { useMediaResource } from './readiness';
import './image-surface.css';

export interface ImageEntry {
  url: string;
  alt?: string;
  caption?: string;
  crop?: { x: number; y: number; width: number; height: number };
}

/** Shared by document, snapshot and profile renderers; only image surfaces opt into the new layout. */
export function MediaImage({ entry }: { entry: ImageEntry }) {
  const url = safeUrl(entry.url, true), context=useContext(ImageFallbackContext);
  return <ImageResource key={`${url??entry.url}:${context.sessionId??''}:${context.displayId??''}:${context.revision??''}`} entry={entry} url={url} />;
}

function ImageResource({ entry, url }: { entry: ImageEntry; url?: string }) {
  const context=useContext(ImageFallbackContext),[source,setSource]=useState(url),[diagnostic,setDiagnostic]=useState(''),attempted=useRef(false),controller=useRef<AbortController | undefined>(undefined);
  const [ratio, setRatio] = useState(1.5);
  const ref = useRef<HTMLImageElement>(null);
  const { status, ready, fail } = useMediaResource(url ? 'pending' : 'failed','MEDIA_TIMEOUT',30000,true);
  const recover=async()=>{if(attempted.current&&source===url)return;if(!url||attempted.current||!context.sessionId||!context.displayId||context.revision===undefined||context.preview||!url.startsWith('https://')){fail();return;}attempted.current=true;controller.current=new AbortController();try{const result=await api<{status:string;imageUrl?:string;message?:string}>(`${displayPath(context.sessionId,context.displayId)}/image-fallback`,{method:'POST',body:{expectedRevision:context.revision,url:entry.url},signal:controller.current.signal});if(controller.current.signal.aborted)return;if(result.status==='available'&&result.imageUrl)setSource(result.imageUrl);else{setDiagnostic(result.message??'The anonymous source request could not retrieve an image.');fail();}}catch{if(!controller.current?.signal.aborted)fail();}};
  useEffect(()=>{const timer=setTimeout(()=>{if(ref.current&&!ref.current.naturalWidth&&!attempted.current)void recover();},7000);return()=>{clearTimeout(timer);controller.current?.abort();};},[url]);
  const loaded = () => {
    const image = ref.current;
    if (!image || !image.complete) return;
    if (!image.naturalWidth || !image.naturalHeight) return;
    setRatio(image.naturalWidth / image.naturalHeight); ready();
  };
  useEffect(loaded, [source, ready, fail]);
  if (!url || status === 'failed') return <div className="media-unavailable" role="img" aria-label={entry.alt ?? 'Image unavailable'}><Icon name="image" size={32} /><p>Image unavailable</p>{diagnostic&&<small>{diagnostic}</small>}{entry.alt && <span>{entry.alt}</span>}{url && <a href={url} target="_blank" rel="noopener noreferrer">Open source</a>}</div>;
  const image = <img ref={ref} src={source} alt={entry.alt ?? entry.caption ?? ''} style={entry.crop ? { width: `${100 / entry.crop.width}%`, left: `${-entry.crop.x / entry.crop.width * 100}%`, top: `${-entry.crop.y / entry.crop.height * 100}%` } : undefined} onLoad={loaded} onError={()=>void recover()} referrerPolicy="no-referrer" loading="eager" />;
  const cropRatio = entry.crop ? ratio * entry.crop.width / entry.crop.height : ratio;
  return entry.crop ? <div className="image-crop" style={{ aspectRatio: cropRatio, '--image-crop-ratio': cropRatio } as CSSProperties}>{image}</div> : image;
}

/** Captions are metadata, not part of the default image-only live frame. */
export interface ImageRendererProps {
  data: { images: ImageEntry[] };
  showCaption?: boolean;
  showControls?: boolean;
  /** Source information is handled by the surrounding Renderer, never duplicated here. */
  showSource?: boolean;
}

export function ImageRenderer({ data, showCaption = false, showControls = false }: ImageRendererProps) {
  // Keep a focused image through viewport/caption changes, but not a replacement
  // gallery. All original image nodes remain mounted and readiness-registered.
  const identity = JSON.stringify(data.images.map(entry => [entry.url, entry.crop ?? null]));
  const [selection, setSelection] = useState<{ identity: string; index: number | null }>({ identity, index: null });
  const index = selection.identity === identity && selection.index !== null && selection.index < data.images.length ? selection.index : null;
  if (selection.identity !== identity) setSelection({ identity, index: null });
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const navigation = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<number | null>(null);
  const wasFocused = useRef(false);
  useEffect(() => {
    if (index !== null && !wasFocused.current) navigation.current?.querySelector<HTMLButtonElement>('[data-gallery-all]')?.focus({ preventScroll: true });
    if (index === null && restoreFocus.current !== null) {
      frames.current[restoreFocus.current]?.focus({ preventScroll: true }); restoreFocus.current = null;
    }
    wasFocused.current = index !== null;
  }, [index, identity]);
  const select = (next: number | null) => setSelection({ identity, index: next });
  const all = () => { restoreFocus.current = index; select(null); };
  const move = (direction: number) => { if (index !== null) select((index + direction + data.images.length) % data.images.length); };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (index === null || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    // An image gallery inside a presentation consumes its own navigation keys.
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') all(); else move(event.key === 'ArrowLeft' ? -1 : 1);
  };
  return <div className={`image-content image-surface gallery-${index === null ? Math.min(data.images.length, 4) : 1}${index !== null ? ' gallery-focused' : ''}${showCaption ? ' image-with-captions' : ''}`} onKeyDown={keyDown}>
    <div className="image-grid">{data.images.map((entry, i) => {
      const enlarge = data.images.length > 1 && index === null;
      const label = entry.alt?.trim() || entry.caption?.trim() || `image ${i + 1}`;
      const original = showControls ? safeUrl(entry.url, true) : undefined;
      return <figure key={`${entry.url}-${i}`} hidden={index !== null && index !== i} data-image-index={i}>
        <div className="image-frame" ref={node => { frames.current[i] = node; }} data-image-index={i} role={enlarge ? 'button' : undefined} tabIndex={enlarge ? 0 : undefined} aria-label={enlarge ? `Enlarge ${label}` : undefined}
          onClick={() => { if (enlarge) select(i); }} onKeyDown={event => { if (enlarge && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); select(i); } }}>
          <MediaImage entry={entry} />
        </div>
        {showCaption && Boolean(entry.caption?.length) && <figcaption tabIndex={0}>{entry.caption}</figcaption>}
        {original && <a className="image-original-link" href={original} target="_blank" rel="noopener noreferrer" aria-label={data.images.length > 1 ? `Open original image ${i + 1}` : 'Open original image'}>Open original <Icon name="external" size={16} /></a>}
      </figure>;
    })}</div>
    {index !== null && <div className="gallery-controls" ref={navigation} role="group" aria-label="Image gallery navigation">
      <button type="button" onClick={() => move(-1)} aria-label="Previous image"><Icon name="chevron" size={20} style={{ transform: 'rotate(180deg)' }} /></button>
      <button type="button" data-gallery-all onClick={all}>All {data.images.length} images</button>
      <button type="button" onClick={() => move(1)} aria-label="Next image"><Icon name="chevron" size={20} /></button>
      <span className="image-gallery-announcement" role="status">Image {index + 1} of {data.images.length}</span>
    </div>}
  </div>;
}
