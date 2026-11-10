import {AppError} from './store.js';
import {limitContact,limitMessage,type LimitDetails} from './usage-limits.js';
/** A limit is not a failure of the agent or the person: say which limit, how
 * much is used, what can be done, and who to ask. Structured so any agent can
 * explain it. */
export class LimitError extends AppError {
 constructor(readonly limitDetails:LimitDetails){super(limitDetails.code,limitMessage(limitDetails.code,limitDetails.limit),429);}
}
export function limitError(details:Omit<LimitDetails,'contact'|'paidPlans'>):LimitError{return new LimitError({...details,contact:limitContact(),paidPlans:false});}
