import type { CSSProperties } from 'react';
import { gamePresets, type GameData } from '../../shared/game';
import './game.css';
const symbols = {king:'♚',queen:'♛',rook:'♜',bishop:'♝',knight:'♞',pawn:'♟',disc:'●',X:'×',O:'○',tile:''};
const suits = {clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'};
export function GameRenderer({data}:{data:GameData}) {
  const preset=gamePresets[data.preset];
  const entries=Object.entries(data.zones);
  const role=(id:string,zone:GameData['zones'][string])=>zone.role??(id==='community'||id==='board'?'community':id==='dealer'?'dealer':/^foundation/.test(id)?'foundation':/^column|^tableau/.test(id)?'tableau':id==='stock'?'stock':id==='waste'?'waste':'seat');
  const seats=entries.filter(([id,z])=>role(id,z)!=='community');
  // Dense tables use two spaced arcs and two end seats, avoiding angular bunching.
  const pokerSeat=(seat:number):CSSProperties=>{
    if(seats.length<6){const angle=2*Math.PI*seat/Math.max(1,seats.length);return {left:`${50+37*Math.cos(angle)}%`,top:`${50+34*Math.sin(angle)}%`};}
    if(seat<2)return {left:seat===0?'9%':'91%',top:'50%'};
    const top=Math.ceil((seats.length-2)/2),upper=seat-2<top,index=upper?seat-2:seat-2-top,count=upper?top:seats.length-2-top;
    return {left:`${18+64*(index+.5)/count}%`,top:upper?'17%':'83%',width:`${Math.min(16,60/count)}%`};
  };
  const columnLabel=(col:number)=>String.fromCharCode(64+col);
  const rowLabel=(row:number)=>['chess','checkers','go','reversi'].includes(data.preset)?preset.rows-row+1:row;
  const flipped=data.orientation==='flipped';
  const ratio=data.preset==='backgammon'?1.7:preset.columns/preset.rows;
  const counters=(zone?:string)=><dl className="game-counters">{Object.entries(data.counters).filter(([,c])=>c.zone===zone).map(([id,c])=><div key={id} data-game-counter={id}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>;

  return <figure className={`game-surface game-${data.preset}`} aria-label={`${preset.label}: ${data.positionLabel}`}>
    <figcaption>{preset.label}<span>{data.positionLabel}</span></figcaption>
    <div className="game-stage">{preset.family==='cards'?<div className="game-table" style={{'--player-count':Math.max(1,entries.filter(([id,z])=>role(id,z)!=='dealer').length)} as CSSProperties}>{entries.map(([id,zone])=>{
      const kind=role(id,zone),seat=seats.findIndex(([key])=>key===id);
      const foundationIndex=entries.filter(([key,z])=>role(key,z)==='foundation').findIndex(([key])=>key===id),tableauIndex=entries.filter(([key,z])=>role(key,z)==='tableau').findIndex(([key])=>key===id);
      const position:CSSProperties=data.preset==='solitaire'?{gridColumn:kind==='foundation'?foundationIndex+4:kind==='tableau'?tableauIndex+1:undefined}:data.preset==='poker'?kind==='community'?{left:'50%',top:'50%'}:pokerSeat(seat):{};
      return <section className={`game-zone zone-${kind}`} style={position} key={id} data-game-zone={id} aria-label={zone.label}><h3>{zone.label} {zone.badge&&<small>{zone.badge}</small>}</h3><div className="game-hand" style={{'--stack-step':`min(2.7cqh, calc(40cqh / ${Math.max(1,Object.values(data.cards).filter(c=>c.zone===id).length-1)}))`} as CSSProperties}>{Object.entries(data.cards).filter(([,c])=>c.zone===id).sort(([a,x],[b,y])=>x.order-y.order||a.localeCompare(b)).map(([key,c],index)=><div key={key} style={{'--card-index':index} as CSSProperties} data-game-card={key} data-emphasis={c.emphasis} className={`game-card ${c.face==='back'?'is-back':c.suit==='hearts'||c.suit==='diamonds'?'is-red':''}`} aria-label={c.face==='back'?'Unknown card':`${c.rank} of ${c.suit}`}>{c.face==='back'?'◇':<><small className="game-card-index">{c.rank}{suits[c.suit]}</small>{c.rank}<span>{suits[c.suit]}</span></>}</div>)}</div>{zone.counter&&<p>{zone.counter}</p>}{zone.bet&&<p className="game-bet">Bet {zone.bet}</p>}{counters(id)}</section>;
    })}{counters()}</div>:<div className="game-fit" style={{'--board-ratio':ratio,'--game-columns':preset.columns,'--game-rows':preset.rows} as CSSProperties}>
      {data.showLabels!==false&&preset.family!=='points'&&<><div className="game-column-labels">{Array.from({length:preset.columns},(_,i)=><span key={i}>{columnLabel(flipped?preset.columns-i:i+1)}</span>)}</div><div className="game-row-labels">{Array.from({length:preset.rows},(_,i)=><span key={i}>{rowLabel(flipped?preset.rows-i:i+1)}</span>)}</div></>}
      <div className="game-board">
      <div className="game-cells">{Array.from({length:preset.rows*preset.columns},(_,i)=>{const source=flipped?preset.rows*preset.columns-1-i:i,row=Math.floor(source/preset.columns)+1,col=source%preset.columns+1,id=`r${row}c${col}`,cell=data.cells[id];return <div key={id} data-game-cell={id} data-emphasis={cell?.emphasis} data-given={cell?.given} className={`game-cell ${(row+col)%2?'is-dark':''} ${cell?.blocked?'is-blocked':''}`} style={{borderRightWidth:data.preset==='sudoku'&&col%3===0?3:undefined,borderBottomWidth:data.preset==='sudoku'&&row%3===0?3:undefined}} aria-label={`${columnLabel(col)}${rowLabel(row)} (${id})${cell?.value?`: ${cell.value}`:''}`}><small>{cell?.number??(data.preset==='backgammon'?(col===7?'Bar':col===14?'Off':String(row===1?25-(col>7?col-1:col):(col>7?col-1:col))):'')}</small><span>{cell?.value}</span>{cell?.notes&&<em>{cell.notes.join(' · ')}</em>}</div>;})}</div>
      <div className="game-pieces">{Object.entries(data.pieces).map(([id,p])=>{const [,r,c]=/^r(\d+)c(\d+)$/.exec(p.cell)!;return <div key={id} data-game-piece={id} data-emphasis={p.emphasis} className={`game-piece color-${p.color?.startsWith('#')?'custom':p.color??(p.symbol==='X'||p.symbol==='O'?'black':p.side==='second'?'white':'black')} symbol-${p.symbol}`} style={{color:p.color?.startsWith('#')?p.color:undefined,left:`${(flipped?preset.columns-Number(c):Number(c)-1)/preset.columns*100}%`,top:`${(flipped?preset.rows-Number(r):Number(r)-1)/preset.rows*100}%`}} aria-label={`${p.color??p.side??'neutral'} ${p.symbol} at ${p.cell}`} title={`${columnLabel(Number(c))}${rowLabel(Number(r))} (${p.cell})`}>{p.label??symbols[p.symbol]}{p.stack&&<b className="game-stack-count">{p.stack}</b>}</div>;})}</div>
    </div></div>}</div>
    {preset.family!=='cards'&&!!Object.keys(data.counters).length&&<dl className="game-counters">{Object.entries(data.counters).map(([id,c])=><div key={id} data-game-counter={id}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>}
    {!!Object.keys(data.annotations).length&&<ul className="game-annotations">{Object.entries(data.annotations).map(([id,a])=><li key={id}>{a.text}{a.cells.length>0&&<small> ({a.cells.join(', ')})</small>}</li>)}</ul>}
  </figure>;
}
