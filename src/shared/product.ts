import { z } from 'zod';
import { isSafeUrl } from './urls.js';

const text = z.string().max(4000), label = z.string().min(1).max(240);
const key = z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/).refine(value => !['__proto__','constructor','prototype'].includes(value), 'Reserved attribute name.');
const value = z.union([text, z.number().finite(), z.boolean(), z.null()]);
export const productSchema = z.object({
  name: label, description: text.optional(),
  image: z.object({ url: z.string().refine(isSafeUrl), alt: label }).strict().optional(),
  layout: z.enum(['image-led', 'compact', 'multi-vendor', 'comparison']).default('image-led').describe('One product offered by several sellers: use multi-vendor. comparison is a legacy alias. For distinct items use the standalone comparison template.'),
  offers: z.array(z.object({
    vendor: label, price: label, availability: text.optional(), sizes: text.optional(),
    hours: label.optional(), distance: label.optional(), shipping: text.optional(),
    shippingCost: text.optional(), delivery: text.optional(), returns: text.optional(), restrictions: text.optional(),
    url: z.string().max(2048).refine(isSafeUrl).optional(), attributes: z.record(key, value).optional(),
  }).strict()).min(1).max(20),
  attributes: z.array(z.object({ key, label }).strict()).min(1).max(24).refine(items => new Set(items.map(item => item.key)).size === items.length, 'Comparison attributes must be unique.').optional(),
  details: z.array(z.object({ label, value: text }).strict()).max(20).optional(),
}).strict();
export type ProductData = z.infer<typeof productSchema>;
export const PRODUCT_ATTRIBUTES = [
  { key: 'price', label: 'Price' }, { key: 'availability', label: 'Availability' },
  { key: 'sizes', label: 'Sizes' }, { key: 'shipping', label: 'Shipping' },
];
export function productAttribute(offer: ProductData['offers'][number], attribute: string): string | number | boolean | null | undefined {
  if (['vendor','price','availability','sizes','hours','distance','shipping','shippingCost','delivery','returns','restrictions','url'].includes(attribute)) return offer[attribute as keyof typeof offer] as string | undefined;
  return offer.attributes?.[attribute];
}
