import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {Definition} from './mcp/canonical.js';
import {AppError,required} from './store.js';
import {hash} from './auth.js';
import {materializeSeats,personSchema,seatSchema,menuItemSchema,signageStyle,cardSchema,signSchema,SIGN_TYPES} from '../shared/venue.js';
import type {ViewSpec} from '../shared/types.js';
const id=z.string().min(1).max(128),target={sessionId:id,displayId:id,requestId:id,expectedRevision:z.number().int().nonnegative().optional()};
const seatUpdate=z.object({...target,action:z.enum(['place','move','swap','add-seat','remove-seat','clear-seat','add-person']),personId:id.optional(),otherPersonId:id.optional(),seatId:id.optional(),seat:seatSchema.optional(),person:personSchema.optional()}).strict();
const menuUpdate=z.object({...target,action:z.enum(['price','availability','swap-special','add-item','remove-item','style']),itemId:id.optional(),sectionId:id.optional(),price:z.union([z.number().finite(),z.string().max(1000)]).optional(),availability:z.enum(['available','sold-out','hidden']).optional(),item:menuItemSchema.optional(),style:z.object(signageStyle).partial().strict().optional()}).strict();
const kanbanUpdate=z.object({...target,action:z.enum(['add-card','remove-card','edit-card','move-card','reorder-columns']),cardId:id.optional(),columnId:id.optional(),card:cardSchema.optional(),patch:cardSchema.partial().omit({id:true}).optional(),index:z.number().int().min(0).max(500).optional(),columnIds:z.array(id).max(30).optional()}).strict();
const signUpdate=z.object({...target,action:z.enum(['set','clear','set-hours','set-day']),template:z.enum(SIGN_TYPES).optional(),data:signSchema.optional(),day:z.object({day:z.string().max(100),opens:z.string().max(100).optional(),closes:z.string().max(100).optional(),closed:z.boolean().optional()}).strict().optional()}).strict();
export const venueTools: Definition[] = [
    {
        name: "kanvas.seat.map.update", summary: "Adjust seats and assigned people when rearranging an existing seating map without rebuilding the whole view.", schema: seatUpdate, description: 'Update the current seat-map live: place/move a person (occupied destination automatically swaps), swap two people, add/remove/clear a seat, add a person to the visible unseated pool. Supply stable IDs. Removing or clearing a seat never deletes its person. Publish seat-map first with one of 14 layouts, up to 1000 seats/people. Optional expectedRevision guards the display; omitted applies atomically to current state.', idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Move/place/swap people using stable person/seat IDs; removing a seat does not delete its person.","examples":[{"sessionId":"session-id","displayId":"display-id","action":"move","personId":"person-id","seatId":"seat-2"}]},
        searchAliases: ["kanvas.seat.map.update"]
    },
    {
        name: "kanvas.menu.update", summary: "Change menu items, prices, availability, or styling when updating an already displayed menu or daily special.", schema: menuUpdate, description: 'Narrow live updates to menu-board or todays-special: price, availability (available/sold-out/hidden), swap-special, add/remove item by section/item IDs, or quick preset/accent/theme/showPrice/size style. All content fields are optional. No bespoke restaurant CSS.', idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Change menu item price/availability, replace the special, or adjust named board style fields.","examples":[{"sessionId":"session-id","displayId":"display-id","action":"price","itemId":"burger","price":189}]},
        searchAliases: ["kanvas.menu.update"]
    },
    {
        name: "kanvas.kanban.update", summary: "Add, edit, move, or remove cards and reorder columns when maintaining an existing displayed kanban board.", schema: kanbanUpdate, description: 'Atomically add, remove, edit or move a card on the current kanban view; reorder-columns uses all columnIds in their desired order. index places a card within its destination. WIP limits are visible advisory limits, not silent rejection. Multiple displays may hold independent boards.', idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Add/edit/remove/move cards or reorder columns in the current board; IDs remain stable.","examples":[{"sessionId":"session-id","displayId":"display-id","action":"move-card","cardId":"card-id","columnId":"doing"}]},
        searchAliases: ["kanvas.kanban.update"]
    },
    {
        name: "kanvas.signage.update", summary: "Set or clear shop signs and adjust opening hours when changing temporary notices on a display.", schema: signUpdate, description: 'Quickly set or clear one of seven shop signs, replace opening hours or set one day. set requires template and data; clear restores the view saved before the sign, without resupplying it. Switching signs preserves that original return view. Sale posters support safe static custom HTML/CSS; other signs use curated presets.', idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group": "content", "hint": "Set a prepared shop sign or restore the saved pre-sign view with clear.", "examples": [{"sessionId": "session-id", "displayId": "display-id", "action": "set", "template": "back-at", "data": {"time": "14:30"}}, {"sessionId": "session-id", "displayId": "display-id", "action": "clear", "requestId": "clear-1"}]},
        searchAliases: ["kanvas.signage.update"]
    },
];
function need<T>(value:T|undefined,message:string):T{if(value===undefined)throw new AppError('INVALID_ARGUMENT',message);return value;}
export async function venueUpdate(s: KanvasService, p: AuthPrincipal, name: string, raw: unknown) {
    const tool = venueTools.find(t => t.name === name)!;
    const a = tool.schema.parse(raw) as any;
    return s.store.atomic(async () => {
        await s.fullAccount(p, 'publish');
        const display = await s.display(p, a.sessionId, a.displayId, 'editor');
        const receiptId = hash(p.userId + ':' + name + ':' + a.sessionId + ':' + a.requestId), inputHash = hash(JSON.stringify(a)), old = await s.store.get<{
            id: string;
            inputHash: string;
            result: unknown;
        }>('venue-receipt', receiptId);
        if (old) {
            if (old.inputHash !== inputHash)
                throw new AppError('REQUEST_ID_CONFLICT', 'Request ID already used.', 409);
            return old.result;
        }
        s.assertRevision(a.expectedRevision, display.revision);
        if (display.held)
            throw new AppError('DISPLAY_HELD', 'Release hold first.', 409);
        if (!display.view && name !== "kanvas.signage.update")
            throw new AppError('INVALID_VIEW', 'Publish a view first.');
        let view: ViewSpec = structuredClone(display.view ?? { version: 1, template: 'fact', data: { text: '' } });
        let data: any = view.data;
        let clearToBlank = false;
        if (name === "kanvas.seat.map.update") {
            if (view.template !== 'seat-map')
                throw new AppError('INVALID_VIEW', 'Publish a seat map first.');
            data = materializeSeats(data);
            const person = () => required(data.people.find((x: any) => x.id === a.personId), 'Person ID not found.');
            const seat = () => required(data.seats.find((x: any) => x.id === a.seatId), 'Seat ID not found.') as any;
            if (a.action === 'add-person') {
                const person = need(a.person, 'Supply person.');
                if (data.people.some((x: any) => x.id === person.id))
                    throw new AppError('INVALID_ARGUMENT', 'Person ID already exists.');
                data.people.push(person);
            }
            else if (a.action === 'add-seat') {
                const added = need(a.seat, 'Supply seat.');
                if (data.seats.some((x: any) => x.id === added.id))
                    throw new AppError('INVALID_ARGUMENT', 'Seat ID already exists.');
                data.seats.push(added);
            }
            else if (a.action === 'remove-seat') {
                seat();
                data.seats = data.seats.filter((x: any) => x.id !== a.seatId);
            }
            else if (a.action === 'clear-seat')
                delete seat().personId;
            else if (a.action === 'swap') {
                person();
                required(data.people.find((x: any) => x.id === a.otherPersonId), 'Other person ID not found.');
                const first = data.seats.find((x: any) => x.personId === a.personId), second = data.seats.find((x: any) => x.personId === a.otherPersonId);
                if (first)
                    first.personId = a.otherPersonId;
                if (second)
                    second.personId = a.personId;
            }
            else {
                person();
                const dest = seat(), source = data.seats.find((x: any) => x.personId === a.personId);
                if (source !== dest) {
                    const displaced = dest.personId;
                    if (source) {
                        if (displaced)
                            source.personId = displaced;
                        else
                            delete source.personId;
                    }
                    dest.personId = a.personId;
                }
            }
            view.data = data;
        }
        else if (name === "kanvas.menu.update") {
            if (!['menu-board', 'todays-special'].includes(view.template))
                throw new AppError('INVALID_VIEW', 'Publish a menu board or special first.');
            const items = view.template === 'todays-special' ? [data.item] : [...data.sections.flatMap((x: any) => x.items), ...(data.featured ? [data.featured] : [])];
            if (a.action === 'style')
                Object.assign(data, need(a.style, 'Supply style.'));
            else if (a.action === 'swap-special') {
                if (view.template !== 'todays-special')
                    throw new AppError('INVALID_VIEW', 'Use todays-special.');
                data.item = need(a.item, 'Supply item.');
            }
            else if (a.action === 'add-item') {
                const section = required(data.sections?.find((x: any) => x.id === a.sectionId), 'Section ID not found.') as any;
                const item = need(a.item, 'Supply item.');
                if (item.id && items.some((x: any) => x.id === item.id))
                    throw new AppError('INVALID_ARGUMENT', 'Item ID already exists.');
                section.items.push(item);
            }
            else if (a.action === 'remove-item') {
                const section = required(data.sections?.find((x: any) => x.id === a.sectionId), 'Section ID not found.') as any;
                required(section.items.find((x: any) => x.id === a.itemId), 'Item ID not found.');
                section.items = section.items.filter((x: any) => x.id !== a.itemId);
            }
            else {
                const item = (view.template === 'todays-special' && !a.itemId ? data.item : required(items.find((x: any) => x.id === a.itemId), 'Item ID not found.')) as any;
                if (a.action === 'price')
                    item.price = need(a.price, 'Supply price.');
                else
                    item.availability = need(a.availability, 'Supply availability.');
            }
        }
        else if (name === "kanvas.kanban.update") {
            if (view.template !== 'kanban')
                throw new AppError('INVALID_VIEW', 'Publish a kanban board first.');
            const cols = data.columns;
            if (a.action === 'reorder-columns') {
                const ids = need(a.columnIds, 'Supply all columnIds.');
                if (ids.length !== cols.length || new Set(ids).size !== cols.length || ids.some((id: string) => !cols.some((c: any) => c.id === id)))
                    throw new AppError('INVALID_ARGUMENT', 'columnIds must name every column exactly once.');
                data.columns = ids.map((id: string) => cols.find((c: any) => c.id === id));
            }
            else if (a.action === 'add-card') {
                const col = required(cols.find((c: any) => c.id === a.columnId), 'Column ID not found.') as any;
                col.cards.splice(a.index ?? col.cards.length, 0, need(a.card, 'Supply card.'));
            }
            else {
                const col = required(cols.find((c: any) => c.cards.some((x: any) => x.id === a.cardId)), 'Card ID not found.') as any, card = col.cards.find((x: any) => x.id === a.cardId);
                if (a.action === 'edit-card')
                    Object.assign(card, need(a.patch, 'Supply patch.'));
                else {
                    col.cards = col.cards.filter((x: any) => x.id !== a.cardId);
                    if (a.action === 'move-card') {
                        const dest = required(cols.find((c: any) => c.id === a.columnId), 'Destination column not found.') as any;
                        dest.cards.splice(a.index ?? dest.cards.length, 0, card);
                    }
                }
            }
        }
        else {
            const key = hash(a.sessionId + ':' + a.displayId);
            if (a.action === 'clear') {
                const saved = required(await s.store.get<{
                    id: string;
                    view: ViewSpec | null;
                }>('signage-return', key), 'No previous view was saved.');
                if (saved.view)
                    view = saved.view;
                else
                    clearToBlank = true;
                await s.store.delete('signage-return', key);
            }
            else {
                if (!(SIGN_TYPES as readonly string[]).includes(view.template) || !(await s.store.get('signage-return', key)))
                    await s.store.put('signage-return', { id: key, sessionId: a.sessionId, view: display.view });
                if (a.action === 'set')
                    view = { version: 1, template: need(a.template, 'Supply template.'), data: need(a.data, 'Supply data.') };
                else {
                    const hours = a.action === 'set-hours' ? need(a.data, 'Supply data with hours.') : { ...(view.template === 'opening-hours' ? view.data : {}), hours: [...((view.template === 'opening-hours' ? view.data.hours : []) as any[]).filter(x => x.day !== a.day?.day), need(a.day, 'Supply day.')] };
                    view = { version: 1, template: 'opening-hours', data: signSchema.parse(hours) };
                }
            }
        }
        let result: unknown;
        if (clearToBlank)
            result = await s.clear(p, a.sessionId, [a.displayId], a.requestId);
        else if (view.template === display.view?.template)
            result = await s.edit(p, a.sessionId, a.displayId, display.revision, view.data);
        else
            result = await s.showChecklist(p, { sessionId: a.sessionId, displayId: a.displayId, requestId: a.requestId, expectedRevision: display.revision }, view);
        const current = await s.display(p, a.sessionId, a.displayId);
        const response = { sessionId: a.sessionId, displayId: a.displayId, revision: current.revision, requestId: a.requestId, status: 'prepared', template: current.view?.template ?? null };
        await s.store.put('venue-receipt', { id: receiptId, sessionId: a.sessionId, inputHash, result: response });
        return response;
    });
}
