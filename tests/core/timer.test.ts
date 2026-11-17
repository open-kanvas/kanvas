import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import type { Request } from 'express';
import { z } from 'zod';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Harness } from './harness.js';
import { materializeSeats } from '../../src/shared/venue.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';

describe("timer coverage 1", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});

it('does not attribute later background deliveries to the request that created their timer',async()=>{
 const response=new EventEmitter(),records:any[]=[],service={store:{put:async(_kind:string,record:unknown)=>records.push(record)}} as unknown as KanvasService;
 const update={id:'update',requestId:'request',sessionId:'session',revisions:{display:1},status:'prepared',createdAt:new Date().toISOString()} as unknown as UpdateRecord;
 let task:Promise<void>|undefined;
 deliveryIngress({body:{original:'request payload'}} as Request,response as unknown as Response,()=>{task=(async()=>{
  await recordDeliveryRequest(service,update,{internal:'first'},'submit');
  response.emit('finish');await new Promise(resolve=>setTimeout(resolve,1));
  await recordDeliveryRequest(service,update,{internal:'scheduled update'},'monitor');
 })();});
 await task;
 expect(records[0]).toMatchObject({origin:'http-request',request:{original:'request payload'}});
 expect(records[1]).toMatchObject({origin:'internal-update',request:{internal:'scheduled update'}});
});
});
