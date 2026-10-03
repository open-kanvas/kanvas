import { safeMapPopup } from './map-popup';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '../icons';
import './map-surface.css';

interface Coordinate { lat: number; lng: number }
export interface MapData {
  markers?: (Coordinate & { label?: string; description?: string; color?:string;accuracyKm?:number;iconUrl?:string;popupHtml?:string;contentDisplay?:'popup'|'permanent';key?:string;indexLabel?:string })[];
  routes?: { name?: string; coordinates: Coordinate[]; color?: string; dashed?:boolean }[];
  polygons?: { name?: string; coordinates: Coordinate[]; color?: string }[];
  contentDisplay?:'popup'|'permanent';
  center?: Coordinate;
  zoom?: number;
}
export default function MapRenderer({ data, onReady, onError, renderIdentity, showControls = false, onMarkerSelect }: { onMarkerSelect?:(key:string)=>void; data: MapData; onReady?: () => void; onError?: () => void; renderIdentity?: number | string; showControls?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const latest = useRef(data); latest.current = data;
  const leaflet = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const readyCallback = useRef(onReady); readyCallback.current = onReady;
  const [tilesLoading, setTilesLoading] = useState(true);
  const draw = (fit: boolean) => {
    const L = leaflet.current, map = mapRef.current, current = latest.current;
    if (!L || !map) return;
    layerRef.current?.remove();
    const group = L.layerGroup().addTo(map); layerRef.current = group;
    const coordinates: Leaflet.LatLngTuple[] = [];
    const textNode = (text: string) => { const node = document.createElement('span'); node.textContent = text; return node; };
    for (const marker of current.markers ?? []) {
      const point: Leaflet.LatLngTuple = [marker.lat, marker.lng]; coordinates.push(point);
      const badge=document.createElement('span');badge.textContent=marker.indexLabel??'';badge.style.backgroundColor=marker.color??'#2563eb';
      const node = marker.indexLabel ? L.marker(point,{icon:L.divIcon({html:badge,className:'itinerary-stop-icon',iconSize:[36,36],iconAnchor:[18,18]})}).addTo(group) : marker.iconUrl ? L.marker(point,{icon:L.icon({iconUrl:marker.iconUrl,iconSize:[32,40],iconAnchor:[16,40],popupAnchor:[0,-36]})}).addTo(group) : L.circleMarker(point, { radius: 8, color: '#203227', weight: 3, fillColor: marker.color??'#b9ed87', fillOpacity: 1 }).addTo(group);
      if(marker.accuracyKm&&marker.accuracyKm>0)L.circle(point,{radius:marker.accuracyKm*1000,color:marker.color??'#86b89d',weight:1,fillOpacity:.08,interactive:false}).addTo(group);
      const permanent=(marker.contentDisplay??current.contentDisplay)==='permanent';
      const content=()=>marker.popupHtml?safeMapPopup(marker.popupHtml):textNode([marker.label,marker.description].filter(Boolean).join(' — '));
      if(permanent)node.bindTooltip(content(),{direction:'top',permanent:true,interactive:true,className:'map-permanent-content'});
      else {if(marker.label)node.bindTooltip(textNode(marker.label),{direction:'top',permanent:(current.markers?.length??0)<7});if(marker.popupHtml||marker.description||marker.label)node.bindPopup(content());}
      if(marker.key && onMarkerSelect)node.on('click',()=>onMarkerSelect(marker.key!));
    }
    for (const route of current.routes ?? []) {
      const points = route.coordinates.map(p => [p.lat, p.lng] as Leaflet.LatLngTuple); coordinates.push(...points);
      const line = L.polyline(points, { color: route.color ?? '#41735d', weight: 5, opacity: .95, lineJoin: 'round', dashArray:route.dashed?'8 7':undefined }).addTo(group);
      if (route.name) line.bindTooltip(textNode(route.name));
    }
    for (const polygon of current.polygons ?? []) {
      const points = polygon.coordinates.map(p => [p.lat, p.lng] as Leaflet.LatLngTuple); coordinates.push(...points);
      const region = L.polygon(points, { color: polygon.color ?? '#41735d', weight: 2, fillOpacity: .22 }).addTo(group);
      if (polygon.name) region.bindTooltip(textNode(polygon.name));
    }
    if (fit) {
      if (current.center) map.setView([current.center.lat, current.center.lng], current.zoom ?? 11);
      else if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [65, 65], maxZoom: 15 });
      else if (coordinates.length === 1) map.setView(coordinates[0], current.zoom ?? 12);
      else map.setView([25, 0], 2);
    }
  };
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    Promise.all([import('leaflet'), fetch('/api/map/config').then(r=>r.json()).then(x=>x.data).catch(()=>({url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'OpenStreetMap contributors'}))]).then(([L,tileConfig]) => {
      if (disposed || !container.current) return;
      leaflet.current = L;
      // The schema bounds vectors to 500 markers + 24 paths. Leaflet's public
      // SVG renderer preserves that geometry and supports synchronous disposal,
      // without stale Canvas redraw callbacks after replacing a display leaf.
      const map = L.map(container.current, { zoomControl: false, attributionControl: true, renderer: L.svg(), scrollWheelZoom: true });
      mapRef.current = map;
      const tileUrl = tileConfig.url as string;
      const attribution = document.createElement('a'); attribution.href = tileConfig.attributionUrl ?? 'https://www.openstreetmap.org/copyright'; attribution.textContent=tileConfig.attribution; attribution.target='_blank'; attribution.rel='noopener noreferrer';
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; '+attribution.outerHTML, referrerPolicy: 'strict-origin-when-cross-origin' })
        .on('loading',()=>{if(!disposed)setTilesLoading(true);})
        .on('tileerror', () => { if (!disposed) { setTileError(true); setTilesLoading(false); onError?.(); } })
        .on('load', () => { if (!disposed) setTilesLoading(false); }).addTo(map);
      const surface=container.current as HTMLDivElement & {kanvasCoordinate?:(x:number,y:number)=>{lat:number;lng:number};kanvasProject?:(lat:number,lng:number)=>{x:number;y:number}};
      surface.kanvasCoordinate=(x,y)=>{const r=surface.getBoundingClientRect();const ll=map.containerPointToLatLng([x-r.left,y-r.top]).wrap();return{lat:ll.lat,lng:ll.lng};};
      surface.kanvasProject=(lat,lng)=>{const r=surface.getBoundingClientRect(),p=map.latLngToContainerPoint([lat,lng]);return{x:r.left+p.x,y:r.top+p.y};};
      map.on('move',()=>surface.dispatchEvent(new CustomEvent('kanvas-map-move',{bubbles:true})));
      draw(true); setReady(true);
      observer = new ResizeObserver(() => { if (!disposed) map.invalidateSize(); }); observer.observe(container.current);
    }).catch(() => { if (!disposed) {setMapError(true);onError?.();} });
    return () => {
      disposed = true; observer?.disconnect();
      // Dispose our layers before their renderer; capture the old instance so
      // cleanup cannot clear a later map, and retain no detached frame queue.
      const map = mapRef.current; mapRef.current = null;
      map?.stop();
      layerRef.current?.remove(); layerRef.current = null;
      map?.remove();
    };
  }, []);
  useEffect(() => { if (ready) { draw(true); } }, [data, ready]);
  useEffect(() => {
    if (!ready || !showControls || !leaflet.current || !mapRef.current) return;
    const controls = leaflet.current.control.zoom().addTo(mapRef.current);
    return () => { controls.remove(); };
  }, [ready, showControls]);
  useEffect(() => { if (ready && !tilesLoading && !tileError && !mapError) readyCallback.current?.(); }, [ready, tilesLoading, tileError, mapError, renderIdentity]);
  return <div className={`map-content${showControls && ready ? ' has-map-controls' : ''}`}><div ref={container} className="map-surface" role="region" aria-label="Interactive map of supplied locations and geometry" />
    <div className="map-notices">
      {!!data.routes?.length && <span className="map-geometry-note">Supplied path · not turn-by-turn navigation</span>}
      {mapError && <div className="map-status">The map renderer could not load. Reload to try again.</div>}
      {tileError && !mapError && <div className="map-status">Some map tiles are unavailable. Supplied locations and paths are still shown.</div>}
      {ready && tilesLoading && !tileError && <div className="map-status">Loading basemap…</div>}
      {!ready && !mapError && <div className="map-status">Loading map…</div>}
    </div>
    {showControls && ready && <button className="map-recenter" onClick={() => draw(true)} aria-label="Fit all locations"><Icon name="fullscreen" size={18} /></button>}
  </div>;
}
