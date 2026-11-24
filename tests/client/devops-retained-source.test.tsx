import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Renderer} from '../../src/client/renderers/Renderer';
import {validateView} from '../../src/shared/view-schemas';
import {DEFAULT_CONFIG} from '../../src/shared/preferences';
import type {ViewSpec} from '../../src/shared/types';
it('hard-switches the template contract without mutating rejected source',()=>{
 const stored={version:1,template:'operations',data:{kind:'cost',period:'Saved period',items:[{id:'cost',name:'Preserved source',fields:{Amount:'123.4500'}}]}};
 const before=JSON.stringify(stored);
 expect(()=>validateView(stored)).toThrow();
 const modern=validateView({...stored,template:'devops'});
 const render=(view:ViewSpec)=>renderToStaticMarkup(<Renderer view={view} config={DEFAULT_CONFIG} preview/>);
 const newHTML=render(modern);
 expect(newHTML).toContain('Preserved source');expect(newHTML).toContain('123.4500');
 expect(JSON.stringify(stored)).toBe(before);
});
