import {moleculeDataSchema,resolveMolecule,moleculeFrame,moleculeDrawingStructure} from '../../shared/molecules';
import type {ViewSpec} from '../../shared/types';
import './molecule.css';
export function MoleculeRenderer({view}:{view:ViewSpec}){
 if(import.meta.env.VITE_KANVAS_MOLECULES==='false')return <div role="status">Molecule viewing is disabled. The saved structure is retained.</div>;
 const data=moleculeDataSchema.parse(view.data),s=moleculeDrawingStructure(resolveMolecule(data));
 const atoms=new Map(s.atoms.map(a=>[a.id,a]));
 return <figure className="molecule-view"><svg role="img" aria-label={s.name+' — schematic 2D'} viewBox={moleculeFrame(s,data.viewport).join(' ')} preserveAspectRatio="xMidYMid meet">
 <title>{s.name}</title><desc>{s.provenance.identity}. {s.provenance.accuracy}</desc>
 {s.bonds.map(b=>{const a=atoms.get(b.from)!,d=atoms.get(b.to)!,length=Math.hypot(d.x-a.x,d.y-a.y),nx=-(d.y-a.y)/length,ny=(d.x-a.x)/length;
 return <g key={b.id} data-bond-id={b.id} className={data.highlightBonds.includes(b.id)?'is-highlighted':''}><title>{b.id+': '+b.from+' to '+b.to+', order '+b.order}</title>{Array.from({length:b.order},(_,i)=>{const offset=(i-(b.order-1)/2)*7;return <line key={i} x1={a.x+nx*offset} y1={a.y+ny*offset} x2={d.x+nx*offset} y2={d.y+ny*offset}/>;})}</g>;
 })}
 {s.atoms.map(a=><g key={a.id} data-atom-id={a.id} className={data.highlightAtoms.includes(a.id)?'is-highlighted':''} transform={`translate(${a.x} ${a.y})`}><title>{a.id+': '+a.element+(a.hydrogens?' with '+a.hydrogens+' attached hydrogen(s)':'')+(a.charge?', charge '+a.charge:'')}</title><rect x="-29" y="-18" width="58" height="36" rx="12"/><text textAnchor="middle" dominantBaseline="central">{a.element}{!!a.hydrogens&&<tspan>H{a.hydrogens>1&&<tspan baselineShift="sub" fontSize="12">{a.hydrogens}</tspan>}</tspan>}{!!a.charge&&<tspan baselineShift="super" fontSize="12">{Math.abs(a.charge)>1?Math.abs(a.charge):''}{a.charge>0?'+':'−'}</tspan>}</text></g>)}
 </svg><figcaption><strong>{s.name}</strong><span>2D schematic · no spatial or stereochemical accuracy</span><details><summary>Structure provenance</summary><p>{s.provenance.identity}</p><p>{s.provenance.source}</p><p>{s.provenance.license}</p><p>{s.provenance.accuracy}</p></details></figcaption></figure>;
}
