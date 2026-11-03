import type { CSSProperties } from 'react';
import { gamePresets, type GameData } from '../../shared/game';
import './game.css';
const symbols = {king:'♚',queen:'♛',rook:'♜',bishop:'♝',knight:'♞',pawn:'♟',disc:'●',X:'×',O:'○',tile:''};
const suits = {clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'};
export function GameRenderer({data}:{data:GameData}) {
  const preset=gamePresets[data.preset];
  return <figure className={`game-surface game-${data.preset}`} aria-label={`${preset.label}: ${data.positionLabel}`}>
    <figcaption>{preset.label}<span>{data.positionLabel}</span></figcaption>
    {preset.family==='cards'?<div className="game-table">{Object.entries(data.zones).map(([id,zone])=><section className="game-zone" key={id} data-game-zone={id} aria-label={zone.label}><h3>{zone.label} {zone.badge&&<small>{zone.badge}</small>}</h3><div className="game-hand">{Object.entries(data.cards).filter(([,c])=>c.zone===id).sort(([a,x],[b,y])=>x.order-y.order||a.localeCompare(b)).map(([key,c])=><div key={key} data-game-card={key} data-emphasis={c.emphasis} className={`game-card ${c.face==='back'?'is-back':c.suit==='hearts'||c.suit==='diamonds'?'is-red':''}`} aria-label={c.face==='back'?'Unknown card':`${c.rank} of ${c.suit}`}>{c.face==='back'?'◇':<>{c.rank}<span>{suits[c.suit]}</span></>}</div>)}</div>{zone.counter&&<p>{zone.counter}</p>}</section>)}</div>:<div className="game-board" style={{'--game-columns':preset.columns,'--game-rows':preset.rows} as CSSProperties}>
      <div className="game-cells">{Array.from({length:preset.rows*preset.columns},(_,i)=>{const row=Math.floor(i/preset.columns)+1,col=i%preset.columns+1,id=`r${row}c${col}`,cell=data.cells[id];return <div key={id} data-game-cell={id} data-emphasis={cell?.emphasis} data-given={cell?.given} className={`game-cell ${(row+col)%2?'is-dark':''} ${cell?.blocked?'is-blocked':''}`} style={{borderRightWidth:data.preset==='sudoku'&&col%3===0?3:undefined,borderBottomWidth:data.preset==='sudoku'&&row%3===0?3:undefined}} aria-label={`${id}${cell?.value?`: ${cell.value}`:''}`}><small>{cell?.number??(data.preset==='chess'?`${String.fromCharCode(96+col)}${9-row}`:'')}</small><span>{cell?.value}</span>{cell?.notes&&<em>{cell.notes.join(' · ')}</em>}</div>;})}</div>
      <div className="game-pieces">{Object.entries(data.pieces).map(([id,p])=>{const [,r,c]=/^r(\d+)c(\d+)$/.exec(p.cell)!;return <div key={id} data-game-piece={id} data-emphasis={p.emphasis} className={`game-piece color-${p.color} symbol-${p.symbol}`} style={{left:`${(Number(c)-1)/preset.columns*100}%`,top:`${(Number(r)-1)/preset.rows*100}%`}} aria-label={`${p.color} ${p.symbol} at ${p.cell}`}>{p.label??symbols[p.symbol]}</div>;})}</div>
    </div>}
    {!!Object.keys(data.counters).length&&<dl className="game-counters">{Object.entries(data.counters).map(([id,c])=><div key={id} data-game-counter={id}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>}
    {!!Object.keys(data.annotations).length&&<ul className="game-annotations">{Object.entries(data.annotations).map(([id,a])=><li key={id}>{a.text}{a.cells.length>0&&<small> ({a.cells.join(', ')})</small>}</li>)}</ul>}
  </figure>;
}
