

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name} from '../operation-fields.js';

/** data-delete operation contracts. Domain services enforce current account, role and scope. */
export const dataDeleteOperations: readonly Definition[] = [
{
        name: "kanvas.dataset.delete", summary: "Delete a retained session dataset when removing stored source data rather than merely clearing a display.",
        description: 'Delete a dataset from the specified session with domain authorization. This is not a display-only clear.',
        schema: z.strictObject({ sessionId: id, datasetId: id }), destructive: true, idempotent: true,
        domain: "data-delete",
        requiredScope: "publish",
        discovery: {"group":"sources","hint":"Delete the explicitly selected dataset, not just its displayed table or chart.","examples":[{"sessionId":"session-id","datasetId":"dataset-id"}]},
        searchAliases: ["kanvas.dataset.delete"]
    },
{
        name: "kanvas.asset.delete", summary: "Delete a scoped session asset when removing stored media that existing content references may still require.",
        description: 'Delete a scoped asset with domain authorization; existing references may become unavailable.',
        schema: z.strictObject({ sessionId: id, assetId: id }), destructive: true, idempotent: true,
        domain: "data-delete",
        requiredScope: "publish",
        discovery: {"group":"sources","hint":"Delete the explicitly selected media asset; referenced views can lose that media.","examples":[{"sessionId":"session-id","assetId":"asset-id"}]},
        searchAliases: ["kanvas.asset.delete"]
    }
];
