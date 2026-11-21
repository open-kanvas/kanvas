import {z} from 'zod';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const detail = z.object({ label, value: text }).strict();

/** A forecast sentence or two, sized for a screen. Longer text is refused, never scrolled. */
export const WEATHER_DESCRIPTION_MAX=400;

const weatherDescription=z.string().min(1).max(WEATHER_DESCRIPTION_MAX);
export const weatherDataSchema = z.object({display:z.object({visualOnly:z.boolean().optional(),place:z.boolean().optional(),time:z.boolean().optional(),temperature:z.boolean().optional(),description:z.boolean().optional(),details:z.boolean().optional(),timeline:z.boolean().optional()}).strict().optional(), intensity:z.number().min(0).max(1).optional().describe('Visual precipitation intensity, 0 light to 1 heavy; also subtly darkens storm clouds. No measurement is inferred.'),temperatureUnit: z.enum(['celsius','fahrenheit']).optional(), place: label.optional(), temperature: label.optional(), high: label.optional(), low: label.optional(), timeLabel: label.optional(), condition: z.enum(['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'storm', 'fog']), period: z.enum(['day', 'night', 'sunrise', 'sunset']).default('day'), description: weatherDescription.optional(), details: z.array(detail).max(8).optional(), forecast: z.array(z.object({ details:z.array(detail).max(8).optional(),description:weatherDescription.optional(),period:z.enum(['day','night','sunrise','sunset']).optional(),intensity:z.number().min(0).max(1).optional(),time: label, temperature: label.optional(), condition: z.enum(['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'storm', 'fog']) }).strict()).max(24).optional().describe('N forecast entries produce N+1 steps: top-level conditions and timeLabel first, then each entry. Do not duplicate the initial moment. The initial step cannot be omitted.') }).strict();
