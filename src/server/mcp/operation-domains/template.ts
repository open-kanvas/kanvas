

import {z} from 'zod';

import {TEMPLATE_IDS} from '../../../shared/types.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** template operation contracts. Domain services enforce current account, role and scope. */
export const templateOperations: readonly Definition[] = [
{
        name: "kanvas.template.get", summary: "Read a template's validation schema and example when constructing exact view data for a chosen template.",
        description: 'Read the exact validated ViewSpec JSON Schema and an example for one template before constructing view.data. For a simple fact, data is {"text":"...","subtitle":"..."}; fields such as body or content are not fact fields. Examples are illustrative, not evidence. Alternatively submit context/intent with templateHint and let the display interpreter prepare a view.',
        schema: z.strictObject({ template: z.enum(TEMPLATE_IDS) }), readOnly: true,
        domain: "template",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Inspect one exact template data schema; this does not publish. The argument is template, not templateHint.","examples":[{"template":"transcription"}]},
        searchAliases: ["kanvas.template.get"]
    }
];
