import React from 'react';
import {createRoot} from 'react-dom/client';
import {WeatherRenderer} from '../../../src/client/renderers/Weather';
const root=createRoot(document.getElementById('root')!);
const forecast=Array.from({length:18},(_,i)=>({time:(i+6)+':00',temperature:'18°',condition:'clear' as const,period:i===0?'sunrise' as const:i===12?'sunset' as const:i>12?'night' as const:'day' as const}));
window.renderWeather=(condition='clear',preview=false)=>root.render(<WeatherRenderer preview={preview} data={{place:'Illustrative weather test',temperature:'18°',condition:condition as 'clear',period:'day',timeLabel:'12:00',intensity:1,forecast}}/>);
window.renderWeather();
declare global {interface Window {renderWeather:(condition?:string,preview?:boolean)=>void}}
