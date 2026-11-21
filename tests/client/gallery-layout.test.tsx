import {expect,it} from 'vitest';
import {galleryDataSchema} from '../../src/shared/image-gallery';
import {galleryColumns} from '../../src/client/renderers/ImageGallery';
it('accepts a full 16 by 16 gallery without imposing a smaller renderer column limit',()=>{
 const images=Array.from({length:256},()=>({url:'https://example.com/image.png'}));
 const data=galleryDataSchema.parse({columns:16,images});expect(data.images).toHaveLength(256);expect(data.images[0]).toMatchObject({showTitle:false,showCaption:false});
 expect(galleryColumns(256,1920,1080)).toBeGreaterThan(8);
 expect(galleryDataSchema.safeParse({columns:17,images}).success).toBe(false);expect(galleryDataSchema.safeParse({images:[...images,images[0]]}).success).toBe(false);
});
