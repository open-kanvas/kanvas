import {KEYBOARD_SHORTCUTS,SHORTCUT_BOUNDARY} from '../../shared/keyboard-shortcuts';
import './keyboard-shortcuts.css';
const groups=[{title:'Navigate',start:0,end:4},{title:'Screen controls',start:4,end:8},{title:'Whiteboard · focus the board first',start:8,end:13}];
export function KeyboardShortcuts(){return <div className="keyboard-reference" data-navigation-scroll><h2>Keyboard shortcuts</h2><div className="keyboard-groups">{groups.map(g=><section key={g.title}><h3>{g.title}</h3><dl>{KEYBOARD_SHORTCUTS.slice(g.start,g.end).map(s=><div key={s.keys}><dt><kbd>{s.keys}</kbd></dt><dd>{s.action}</dd></div>)}</dl></section>)}</div><p>{SHORTCUT_BOUNDARY}</p></div>;}
