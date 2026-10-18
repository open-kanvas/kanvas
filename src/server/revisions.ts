import {AppError} from './store.js';
/** Call only after authorization, under the same transaction as the mutation. */
export function assertExpectedRevision(expected:unknown,current:number,label:'revision'|'version'='revision'):void{
 if(expected===undefined)return;
 if(!Number.isSafeInteger(expected)||Number(expected)<0)throw Object.assign(new AppError('INVALID_ARGUMENT','expectedRevision/expectedVersion must be a non-negative integer. Current revision is '+current+'; omit the guard to apply to current state.'),{currentRevision:current});
 if(expected!==current)throw Object.assign(new AppError('REVISION_CONFLICT','Revision conflict: state changed; current '+label+' is '+current+'. Retry with this revision, or omit the guard to apply to current state. Another concurrent write may still conflict.',409),{currentRevision:current});
}
