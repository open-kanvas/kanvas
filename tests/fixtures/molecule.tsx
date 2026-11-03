import React from 'react';
import {createRoot} from 'react-dom/client';
import {MoleculeRenderer} from '../../src/client/renderers/Molecule';
import {moleculeLibrary} from '../../src/shared/molecules';
const root=createRoot(document.getElementById('root')!);
(window as any).molecules=moleculeLibrary;
(window as any).showMolecule=(data:any)=>root.render(<MoleculeRenderer view={{version:1,template:'molecule',data}}/>);
(window as any).showMolecule({libraryId:'ethanol-v1'});
