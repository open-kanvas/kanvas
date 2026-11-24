import {describe, expect, it} from 'vitest';
import {TEMPLATE_IDS, type TemplateId} from '../../src/shared/types.js';
import {TEMPLATE_CONCEPTS, templateConcept} from '../../src/shared/template-concepts.js';
import {leafViewSchema, templateViewSchema} from '../../src/shared/view-schemas.js';

// web and account-template are intentional supported contracts outside the
// advertised built-in list. Both still need authored discovery copy.
const additionalContracts = ['web', 'account-template'] as const;
const allIds = [...TEMPLATE_IDS, ...additionalContracts];

describe('authored template summary audit', () => {
  it('covers all 113 built-ins and the two additional supported contracts exactly once', () => {
    expect(TEMPLATE_IDS).toHaveLength(113);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(Object.keys(TEMPLATE_CONCEPTS).sort()).toEqual([...allIds].sort());
    const schemaIds = [...leafViewSchema.options.map(option => option.shape.template.value), 'presentation', 'split-screen'];
    expect([...schemaIds].sort()).toEqual([...allIds].sort());
  });

  it.each(allIds)('%s has concise, complete what-and-when copy and a real schema', id => {
    const concept = templateConcept(id)!;
    expect(concept).toBe(TEMPLATE_CONCEPTS[id]);
    expect(concept.summary).toBe(concept.summary.trim());
    const words = concept.summary.split(' ');
    expect(words.length).toBeGreaterThanOrEqual(12);
    expect(words.length).toBeLessThanOrEqual(20);
    expect(concept.summary.length).toBeLessThanOrEqual(180);
    expect(concept.summary).toContain(', for ');
    expect(concept.summary.endsWith('.')).toBe(true);
    expect(concept.summary).not.toContain('…');
    expect(concept.summary).not.toContain('...');
    expect(concept.summary).not.toContain(String.fromCharCode(10));
    expect(concept.when.length).toBeGreaterThan(40);
    expect(concept.summary).not.toBe(concept.when);
    expect(concept.also.split(' ').length).toBeGreaterThanOrEqual(3);
    expect(templateViewSchema(id as TemplateId)).toBeTruthy();
  });

  it('has no duplicate summaries, including intentionally related website and iframe entries', () => {
    const summaries = Object.values(TEMPLATE_CONCEPTS).map(concept => concept.summary.toLocaleLowerCase());
    expect(new Set(summaries).size).toBe(summaries.length);
    expect(templateConcept('website')).toBeDefined();
    expect(templateConcept('iframe')).toBeDefined();
  });

  it('does not return inherited object properties or invented templates', () => {
    for (const id of ['constructor', '__proto__', 'toString', 'not-a-template', '']) expect(templateConcept(id)).toBeUndefined();
  });

  it('retains important display-only boundaries and distinct selection guidance', () => {
    expect(templateConcept('math')!.when).toContain('Kanvas only displays');
    expect(templateConcept('traffic-demo')!.summary).toContain('never controlling');
    expect(templateConcept('device-preview')!.when).toContain('not device or email-client emulation');
    expect(templateConcept('translation')!.when).toContain('does not translate');
    expect(templateConcept('transcription')!.when).toContain('does not record or transcribe');
    expect(templateConcept('now-playing')!.when).toContain('does not play or control audio');
    expect(templateConcept('product')!.when).toContain('choose comparison for distinct products');
    expect(templateConcept('vocabulary')!.when).toContain('Use flashcards for language practice');
  });
});
