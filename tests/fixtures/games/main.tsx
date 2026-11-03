import React from 'react';
import {createRoot} from 'react-dom/client';
import {GameRenderer} from '../../../src/client/renderers/Game';
import {gameExample,GAME_PRESETS,type GameData,type GamePreset} from '../../../src/shared/game';
const root=createRoot(document.getElementById('root')!);
let data:GameData;
Object.assign(window,{presets:GAME_PRESETS,showGame:(preset:GamePreset)=>{data=gameExample(preset);root.render(<GameRenderer data={data}/>);},moveKnight:()=>{data={...data,pieces:{...data.pieces,knight:{...data.pieces.knight,cell:'r6c6'}}};root.render(<GameRenderer data={data}/>);}});
(window as any).showGame('chess');
