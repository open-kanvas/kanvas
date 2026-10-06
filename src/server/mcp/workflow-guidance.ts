/** Server-authored workflow links, never derived from submitted source text. */
export const PLANNER_BOUNDARY = 'Tell the user: this plan is committed within Kanvas only as a visual/organizational artifact. No external calendar, invitations or email have been updated or sent. Applying real-world changes is a separate step using the agent’s calendar/email tools, only when the user explicitly asks and agrees.';
const families: Record<string, readonly string[]> = {
 planner: ['planner.read','planner.edit','planner.propose','planner.review','planner.finalize'],
 checklist: ['checklist.read','checklist.update','checklist.show'],
 drafting: ['draft.read','draft.edit','draft.suggest','draft.review'],
 presentation: ['display.current','presentation.navigate','presentations.list','presentation.cue','autoplay.control'],
 chat: ['chat.append'], progress: ['progress.append'], scoreboard: ['scoreboard.control'],
 countdown: ['timer.control'], 'count-up': ['timer.control'],
};
export function workflowIds(template: string): string[] { return (families[template] ?? []).map(id => `kanvas.${id}`); }
export const WORKFLOW_NOTE = 'After the initial submit, prefer these narrow operations to rebuilding authoritative state. Get the operation schema, read current state/revision, and use a unique requestId for each new mutation; retry only identical requests with the same ID.';
export const SUBMIT_SHAPE = 'kanvas_call {operationId:"kanvas.submit",arguments:{requestId:"NEW_REQUEST_ID",sessionId:"AUTHORIZED_SESSION_ID",displayIds:["AUTHORIZED_DISPLAY_ID"],view:{version:1,template:"TEMPLATE_ID",title:"Optional title",data:{...template data}}}}. Omit sessionId/displayIds together for automatic setup. title belongs beside template/data, not inside data. Do not silently change sources or infer targets/consent.';
