/** Shared by native controls and agent help. Browser permission prompts still require a click. */
export const KEYBOARD_SHORTCUTS=[
 {keys:'Home',action:'Session overview'}, {keys:'Ctrl+Home',action:'All sessions (full-account screens)'},
 {keys:'End',action:'Return to live and follow new publications'},
 {keys:'← / →',action:'Previous / next page, then retained view'},
 {keys:'F',action:'Enter or leave fullscreen'}, {keys:'?',action:'Open or close display controls'},
 {keys:'Escape',action:'Close controls, options, overview, expanded image or pointing mode'},
 {keys:'Enter / Space',action:'Focused image: enlarge; focused draft proposal: review (native buttons also activate)'},
 {keys:'V / H / P / R / O / A / T / E',action:'Focused editable whiteboard: select / pan / draw / rectangle / ellipse / arrow / text / erase'},
 {keys:'+ / −',action:'Focused whiteboard: zoom'}, {keys:'Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z',action:'Focused editable whiteboard: undo / redo'},
 {keys:'Delete / Backspace',action:'Focused editable whiteboard: remove selected object'}, {keys:'Arrow keys / Shift+arrows',action:'Focused editable whiteboard: move selected object by 1 / 10 units'},
] as const;
export const SHORTCUT_BOUNDARY='Shortcuts do not run while typing, selecting text, or using interactive controls. Home/End retain native scrolling inside scrollable content. Presenter-following screens cannot navigate independently.';
