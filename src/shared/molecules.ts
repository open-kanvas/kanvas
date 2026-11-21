import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const coordinate=z.number().finite().min(-10000).max(10000);
export const moleculeStructureSchema=z.object({
 name:z.string().min(1).max(200),
 provenance:z.object({source:z.string().min(1).max(1000),license:z.string().min(1).max(300),identity:z.string().min(1).max(300),accuracy:z.string().min(1).max(1000)}).strict(),
 atoms:z.array(z.object({id,element:z.string().regex(/^[A-Z][a-z]?$/),x:coordinate,y:coordinate,hydrogens:z.number().int().min(0).max(8).optional(),charge:z.number().int().min(-8).max(8).optional()}).strict()).min(1).max(500),
 bonds:z.array(z.object({id,from:id,to:id,order:z.union([z.literal(1),z.literal(2),z.literal(3)])}).strict()).max(1000),
}).strict().superRefine((s,c)=>{
 const ids=new Set(s.atoms.map(a=>a.id));
 if(ids.size!==s.atoms.length||new Set(s.bonds.map(b=>b.id)).size!==s.bonds.length)c.addIssue({code:'custom',message:'Atom and bond IDs must be unique within their kind'});
 const pairs=new Set<string>();
 for(const b of s.bonds){
  const pair=[b.from,b.to].sort().join(':');
  if(!ids.has(b.from)||!ids.has(b.to)||b.from===b.to||pairs.has(pair))c.addIssue({code:'custom',message:'Bonds require distinct retained endpoints and one bond per atom pair'});
  pairs.add(pair);
  const a=s.atoms.find(a=>a.id===b.from),d=s.atoms.find(a=>a.id===b.to);
  if(a&&d&&Math.hypot(a.x-d.x,a.y-d.y)<0.01)c.addIssue({code:'custom',message:'Bond endpoints must have distinct coordinates'});
 }
});
export type MoleculeStructure=z.infer<typeof moleculeStructureSchema>;
const provenance={source:'KANVAS authored prepared demonstration graph and schematic layout v1; no external asset/database copied',license:'CC0-1.0 (authored seed layouts and records)',accuracy:'Prepared example, not independently chemically validated. 2D schematic only; not bond lengths, 3D geometry or stereochemistry.'};
// Explicit authored records: element, attached hydrogen count; edge endpoints/order.
// No valence computation, name lookup, geometry inference or chemistry service.
const definitions:[string,string,string,string][]=[
 ['water','Water','O:2',''],['hydrogen','Hydrogen','H:0 H:0','0-1-1'],
 ['oxygen','Oxygen','O:0 O:0','0-1-2'],['nitrogen','Nitrogen','N:0 N:0','0-1-3'],
 ['carbon-dioxide','Carbon dioxide','O:0 C:0 O:0','0-1-2 1-2-2'],
 ['ammonia','Ammonia','N:3',''],['methane','Methane','C:4',''],
 ['ethane','Ethane','C:3 C:3','0-1-1'],['propane','Propane','C:3 C:2 C:3','0-1-1 1-2-1'],
 ['butane','n-Butane','C:3 C:2 C:2 C:3','0-1-1 1-2-1 2-3-1'],
 ['pentane','n-Pentane','C:3 C:2 C:2 C:2 C:3','0-1-1 1-2-1 2-3-1 3-4-1'],
 ['hexane','n-Hexane','C:3 C:2 C:2 C:2 C:2 C:3','0-1-1 1-2-1 2-3-1 3-4-1 4-5-1'],
 ['ethene','Ethene','C:2 C:2','0-1-2'],['ethyne','Ethyne','C:1 C:1','0-1-3'],
 ['methanol','Methanol','C:3 O:1','0-1-1'],['ethanol','Ethanol','C:3 C:2 O:0 H:0','0-1-1 1-2-1 2-3-1'],
 ['propan-1-ol','Propan-1-ol','C:3 C:2 C:2 O:1','0-1-1 1-2-1 2-3-1'],
 ['dimethyl-ether','Dimethyl ether','C:3 O:0 C:3','0-1-1 1-2-1'],
 ['formaldehyde','Formaldehyde','C:2 O:0','0-1-2'],
 ['acetaldehyde','Acetaldehyde','C:3 C:1 O:0','0-1-1 1-2-2'],
 ['hydrogen-peroxide','Hydrogen peroxide','O:1 O:1','0-1-1'],
 ['hydrogen-chloride','Hydrogen chloride (neutral molecule)','H:0 Cl:0','0-1-1'],
 ['hydrogen-sulfide','Hydrogen sulfide','S:2',''],
 ['hydrogen-cyanide','Hydrogen cyanide','H:0 C:0 N:0','0-1-1 1-2-3'],
 ['benzene','Benzene (alternating-bond schematic)','C:1 C:1 C:1 C:1 C:1 C:1','0-1-2 1-2-1 2-3-2 3-4-1 4-5-2 5-0-1'],
];
export const moleculeLibrary:Readonly<Record<string,MoleculeStructure>>=Object.fromEntries(definitions.map(([key,name,atoms,bonds])=>[key+'-v1',{
 name,provenance:{...provenance,identity:key+'-v1; neutral prepared form; no stereochemical assignment'},
 atoms:atoms.split(' ').map((token,i)=>{const [element,h]=token.split(':');return {id:'a'+i,element,hydrogens:Number(h),x:key==='benzene'?Math.cos(i*Math.PI/3)*100:i*80,y:key==='benzene'?Math.sin(i*Math.PI/3)*100:(i%2)*35};}),
 bonds:bonds?bonds.split(' ').map((token,i)=>{const [a,b,n]=token.split('-');return {id:'b'+i,from:'a'+a,to:'a'+b,order:Number(n) as 1|2|3};}):[],
}]));
export const moleculeLibraryIds=Object.keys(moleculeLibrary);
export const moleculeDataSchema = z.object({
    libraryId: z.enum(moleculeLibraryIds as [
        string,
        ...string[]
    ]).optional().describe("Immutable prepared schematic seeds. kanvas_discover catalog templates action get by exact template ID exposes available IDs; explicit structure overrides are not allowed."),
    structure: moleculeStructureSchema.optional(),
    highlightAtoms: z.array(id).max(500).default([]), highlightBonds: z.array(id).max(1000).default([]),
    viewport: z.object({ zoom: z.number().finite().min(0.25).max(8).default(1), focusAtoms: z.array(id).min(1).max(500).optional() }).strict().default({ zoom: 1 }),
}).strict().superRefine((d, c) => {
    if (!!d.libraryId === !!d.structure) {
        c.addIssue({ code: 'custom', message: 'Supply exactly one of libraryId or structure' });
        return;
    }
    const s = resolveMolecule(d);
    const atoms = new Set(s.atoms.map(a => a.id)), bonds = new Set(s.bonds.map(b => b.id));
    if ([...d.highlightAtoms, ...d.viewport.focusAtoms ?? []].some(id => !atoms.has(id)) || d.highlightBonds.some(id => !bonds.has(id)))
        c.addIssue({ code: 'custom', message: 'Highlights and focus require retained stable IDs' });
});
export type MoleculeData=z.infer<typeof moleculeDataSchema>;
export function resolveMolecule(d:{libraryId?:string;structure?:MoleculeStructure}):MoleculeStructure{return d.structure??moleculeLibrary[d.libraryId!];}
export function moleculeFrame(s:MoleculeStructure,viewport:MoleculeData['viewport']){
 const atoms=viewport.focusAtoms?s.atoms.filter(a=>viewport.focusAtoms!.includes(a.id)):s.atoms;
 const xs=atoms.map(a=>a.x),ys=atoms.map(a=>a.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 const width=(w+100)/viewport.zoom,height=(h+100)/viewport.zoom;
 return [x+w/2-width/2,y+h/2-height/2,width,height];
}

// Uniform display-unit conversion only; never computes geometry/connectivity.
// Median supplied bond length keeps labels legible for coordinates in e.g. 1-unit spacing.
export function moleculeDrawingStructure(s:MoleculeStructure):MoleculeStructure{
 const atoms=new Map(s.atoms.map(a=>[a.id,a]));
 const lengths=s.bonds.map(b=>{const a=atoms.get(b.from)!,d=atoms.get(b.to)!;return Math.hypot(a.x-d.x,a.y-d.y);}).sort((a,b)=>a-b);
 const scale=lengths.length?80/lengths[Math.floor(lengths.length/2)]:1;
 return {...s,atoms:s.atoms.map(a=>({...a,x:a.x*scale,y:a.y*scale}))};
}
