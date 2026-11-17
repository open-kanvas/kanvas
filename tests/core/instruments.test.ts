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

describe("instruments coverage 1", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe("instruments contracts",()=>{
 it('validates paged chord sheets and advances without republishing',()=>{const v=validateView({version:1,template:'sing-along',data:{pages:[{lines:[{lyrics:'Evening song',chords:[{at:0,chord:'C'}]}]},{lines:[{lyrics:'Second verse'}]}]}});expect(navigationCapabilities(v).pageCount).toBe(2);expect(navigate(v,initialNavigation(v),{action:'page',direction:'next'}).page).toBe(1);expect(()=>validateView({version:1,template:'sing-along',data:{pages:[{lines:[{lyrics:'Hi',chords:[{at:40,chord:'C'}]}]}]}})).toThrow();});});
});
