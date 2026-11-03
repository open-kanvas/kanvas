import React from 'react';
import {createRoot} from 'react-dom/client';
import {Scene3DRenderer} from '../../src/client/renderers/Scene3D';
import {scene3dSchema,sceneReferences} from '../../src/shared/scene3d';
const root=createRoot(document.getElementById('root')!);
function show(data:unknown){root.render(<Scene3DRenderer view={{version:1,template:'scene3d',data:scene3dSchema.parse(data)}}/>);}
Object.assign(window,{showScene:show,sceneReferences});show(sceneReferences.room);
