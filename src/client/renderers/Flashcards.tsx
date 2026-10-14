import type {RendererProps} from './Renderer';
import {flashcardDataSchema,type FlashcardData} from '../../shared/flashcards';
import {MediaImage} from './Image';
import {DiagramRenderer} from './Diagrams';
import './flashcards.css';
function Visual({visual,p}:{visual:FlashcardData['cards'][number]['promptVisual'];p:RendererProps}){
 if(!visual)return null;
 return <div className="flashcard-visual">{visual.kind==='image'?<MediaImage entry={visual}/>:<DiagramRenderer {...p} view={{version:1,template:'flowchart',data:visual.data}}/>}</div>;
}
/** Voice-first passive surface: the connected agent owns all deck controls. */
export function FlashcardsRenderer(p:RendererProps){
 const d=flashcardDataSchema.parse(p.view.data),card=d.cards[d.index],answer=d.responses.find(r=>r.cardId===card.id);
 const result=d.revealed?answer?.result:undefined;
 return <section className="flashcards" aria-label="Flashcards">
  <div className="flashcard-progress"><progress aria-label="Card position" value={d.index+1} max={d.cards.length}/><span aria-hidden="true">{d.index+1} / {d.cards.length}</span></div>
  <div className={`flashcard-face ${result??''}`} aria-live="polite">
   <h2>{card.prompt}</h2><Visual visual={card.promptVisual} p={p}/>
   {d.revealed&&<div className="flashcard-answer">{result&&result!=='ungraded'&&<span className="flashcard-result" role="img" aria-label={result==='correct'?'Correct answer':'Incorrect answer'}>{result==='correct'?'✓':'✕'}</span>}<p>{card.answer}</p><Visual visual={card.answerVisual} p={p}/></div>}
  </div>
 </section>;
}
