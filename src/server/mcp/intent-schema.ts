import {z} from 'zod';
import {activeContextSchema} from './active-context.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const intentResolveSchema=z.strictObject({
 catalog:z.literal('operations'),action:z.literal('resolve'),query:z.string().trim().min(1).max(500),
 activeContext:activeContextSchema,sessionId:id.optional(),displayId:id.optional(),targetRef:id.optional(),
 parameters:z.record(z.string(),z.unknown()).optional(),
});
export const INTENT_EXAMPLES=[
 {family:'filter/sort/highlight',query:'show only errors in this log'},
 {family:'navigate/scroll/zoom',query:'scroll to the bottom'},
 {family:'patch/edit',query:'edit current view',parameters:{operations:[{op:'appendText',path:'/data/text',value:'User supplied text'}]}},
 {family:'publish/target',query:'publish supplied view',note:'Supply parameters.view and explicit authorized destination.'},
 {family:'inspect/interaction',query:'inspect current screen'},
];
