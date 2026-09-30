export function mapConfig(){
  const url=process.env.KANVAS_MAP_TILE_URL??'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||!['{z}','{x}','{y}'].every(x=>url.includes(x)))throw new Error('Map tiles must use a credential-free HTTPS z/x/y template. Use a separately configured map service for provider keys.');
  const attribution=process.env.KANVAS_MAP_ATTRIBUTION??'OpenStreetMap contributors';
  const attributionUrl=process.env.KANVAS_MAP_ATTRIBUTION_URL??'https://www.openstreetmap.org/copyright';
  const attributionAddress=new URL(attributionUrl);if(attributionAddress.protocol!=='https:'||attributionAddress.username||attributionAddress.password)throw new Error('Map attribution must use a public HTTPS URL.');
  return {url,attribution,attributionUrl};
}
