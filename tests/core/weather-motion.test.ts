import {describe,it,expect} from 'vitest';
import {forecastHour,weatherSunPosition,WEATHER_STEP_MS} from '../../src/client/renderers/weather-motion';
describe('illustrative forecast clock path',()=>{
 it('uses supplied clock, not host timezone, and rejects ambiguous labels',()=>{
  expect(forecastHour('2026-11-02T09:30:00+09:00')).toBe(9.5);
  expect(forecastHour('12:00 AM')).toBe(0);expect(forecastHour('12:15 PM')).toBe(12.25);
  for(const time of ['Monday','2026-11-02','25:00','12:60','00:00 PM'])expect(forecastHour(time)).toBeUndefined();
 });
 it('traverses left to right with highest point midway and retains time through cloud cover',()=>{
  const points=[6,9,12,15,18].map(h=>weatherSunPosition(h+':00','day'));
  expect(points.map(p=>Number(p.x.toFixed(2)))).toEqual([.08,.29,.5,.71,.92]);
  expect(points[2].y).toBeLessThan(points[1].y);expect(points[1].y).toBeLessThan(points[0].y);
  expect(weatherSunPosition('09:00','sunset')).toEqual(points[1]); // inherited period cannot pin every hour
 });
 it('uses explicitly supplied sunrise/sunset markers for the same date only',()=>{
  const forecast=[{time:'2026-11-02T08:00',period:'sunrise'},{time:'2026-11-02T16:00',period:'sunset'},{time:'2026-11-03T10:00',period:'sunrise'}];
  expect(weatherSunPosition('2026-11-02T08:00','day',forecast).x).toBe(.08);
  expect(weatherSunPosition('2026-11-02T12:00','day',forecast).x).toBe(.5);
  expect(weatherSunPosition('2026-11-02T16:00','day',forecast).x).toBeCloseTo(.92);
 });
 it('has deterministic illustrative fallbacks and three-second dwell',()=>{
  expect(weatherSunPosition('Monday','sunrise').x).toBe(.08);
  expect(weatherSunPosition('Tuesday','sunset').x).toBeCloseTo(.92);
  expect(weatherSunPosition(undefined,'day').x).toBe(.5);
  expect(WEATHER_STEP_MS).toBe(3000);
 });
});
