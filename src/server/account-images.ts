import { profileImageSchema, type AccountProfile } from '../shared/accounts.js';
import { validateMedia } from './rendering/media.js';
import { AppError, id, Store } from './store.js';

export async function saveAccountImage(store:Store,ownerId:string,raw:unknown,previous?:string) {
  const input=profileImageSchema.parse(raw),media=validateMedia({...input,name:'profile-image'});
  if(media.size>256*1024||!media.width||!media.height||media.width>2048||media.height>2048)throw new AppError('IMAGE_TOO_LARGE','Use a raster image up to 256 KiB and 2048 × 2048 pixels.');
  const imageId=id();
  (await store.db.prepare('INSERT INTO assets(id,bytes) VALUES(?,?)').run(imageId,media.bytes));
  (await store.put('account-image',{id:imageId,ownerId,mimeType:media.mimeType}));
  if(previous)(await removeAccountImage(store,ownerId,previous));
  return imageId;
}
export async function removeAccountImage(store:Store,ownerId:string,imageId:string) {
  if((await store.get<{ownerId:string}>('account-image',imageId))?.ownerId!==ownerId)return;
  (await store.delete('account-image',imageId));(await store.db.prepare('DELETE FROM assets WHERE id=?').run(imageId));
}
export async function avatarUrl(store:Store,userId:string) {
  const imageId=(await store.get<AccountProfile>('profile',userId))?.avatarId;
  return imageId?`/api/account-images/${imageId}`:undefined;
}
