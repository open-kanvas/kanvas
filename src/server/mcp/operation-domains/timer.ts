

import {timerControlInput} from '../../timer-controls.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** timer operation contracts. Domain services enforce current account, role and scope. */
export const timerOperations: readonly Definition[] = [
{
        name: "kanvas.timer.control", summary: "Pause or resume the active countdown or count-up when controlling timing without replacing its displayed content.",
        description: "Pause/resume the active countdown or count-up without full resubmission. Example: {sessionId:\"session-id\",displayId:\"display-id\",expectedRevision:3,requestId:\"pause-1\",action:\"pause\"}. Retains exact fractional remaining/elapsed time, including across restarts, and changes only the active presentation slide. A lost-response retry must use the identical original requestId and action; new actions read the current revision first. Pausing does not erase a deadline or invent elapsed time. Requires editor access; browser paint is acknowledged separately. kanvas_call with operationId:\"kanvas.display.edit\" and arguments:{\u2026} replaces complete data; use this tool for timer state or kanvas_call with operationId:\"kanvas.view.patch\" and arguments:{\u2026} for a narrow field edit.",
        schema: timerControlInput, idempotent: true,
        domain: "timer",
        requiredScope: "publish",
        discovery: {"group":"controls","hint":"Pause/resume the existing countdown or count-up with current revision. Exact retries reuse the original action; do not edit a guessed duration.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"pause-1","action":"pause"}]},
        searchAliases: ["kanvas.timer.control"]
    }
];
