"""Deterministically package vetted Kenney GLBs with their CC0 palette embedded.
No decimation/resegmentation; originals are already small low-poly game assets.
"""
import pathlib,zipfile,json,struct,hashlib,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
manifest=[]
for kit,models in [('car-kit',['sedan','debris-drivetrain','debris-drivetrain-axle','debris-bolt','wheel-default']),('watercraft-kit',['boat-sail-a','boat-fishing-small','boat-fan'])]:
 archive=(root/(kit+'.zip')).read_bytes();z=zipfile.ZipFile(root/(kit+'.zip'));(out/(kit+'-LICENSE.txt')).write_bytes(z.read('License.txt'))
 for model in models:
  path='Models/GLB format/'+model+'.glb';raw=z.read(path);length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:]);assert len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0]
  palette_hashes=[]
  for image in doc.get('images',[]):
   uri=image.pop('uri');assert uri=='Textures/colormap.png';palette=z.read('Models/GLB format/'+uri);palette_hashes.append(hashlib.sha256(palette).hexdigest())
   binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(palette);index=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(palette)});image['bufferView']=index;image['mimeType']='image/png'
  doc['buffers'][0]['byteLength']=len(binary);binary.extend(b'\0'*((-len(binary))%4));j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
  result=struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
  (out/(model+'.glb')).write_bytes(result)
  mesh_nodes=[{'node':i,'name':n['name'],'mesh':n['mesh']} for i,n in enumerate(doc['nodes']) if 'mesh' in n]
  offsets={}
  def walk(i,parent):
   node=doc['nodes'][i];assert not any(k in node for k in ['rotation','scale','matrix']), 'Source transforms changed; review converter'
   offset=[parent[a]+node.get('translation',[0,0,0])[a] for a in range(3)];offsets[i]=offset
   for child in node.get('children',[]):walk(child,offset)
  for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,[0,0,0])
  bounds={}
  for part in mesh_nodes:
   accessors=[doc['accessors'][p['attributes']['POSITION']] for p in doc['meshes'][part['mesh']]['primitives']]
   lo=[min(a['min'][axis] for a in accessors)+offsets[part['node']][axis] for axis in range(3)];hi=[max(a['max'][axis] for a in accessors)+offsets[part['node']][axis] for axis in range(3)]
   bounds[part['name']]={'min':lo,'max':hi}
  lo=[min(b['min'][a] for b in bounds.values()) for a in range(3)];hi=[max(b['max'][a] for b in bounds.values()) for a in range(3)];size=[hi[a]-lo[a] for a in range(3)];center=[(hi[a]+lo[a])/2 for a in range(3)]
  for part in mesh_nodes:
   b=bounds[part['name']];part['normalizedCenter']=[round(((b['min'][a]+b['max'][a])/2-center[a])/size[a],8) for a in range(3)];part['normalizedSize']=[round((b['max'][a]-b['min'][a])/size[a],8) for a in range(3)]
  manifest.append({'id':'kenney-'+model,'file':model+'.glb','source':'https://kenney.nl/assets/'+kit,'author':'Kenney','license':'CC0-1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','licenseFile':kit+'-LICENSE.txt','sourceArchiveSHA256':hashlib.sha256(archive).hexdigest(),'sourcePath':path,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'preparedSHA256':hashlib.sha256(result).hexdigest(),'bytes':len(result),'paletteSHA256':palette_hashes,'parts':mesh_nodes,'sourceBounds':{'center':center,'size':size},'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),'fidelity':'Stylized low-poly game prop; not engineering-accurate','processing':'Embedded original CC0 palette PNG; geometry/node names unchanged; no external URIs','retrievedAt':'2026-11-03'})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2));print('TOTAL GLB BYTES',sum(m['bytes'] for m in manifest))

# Generated metadata is intentionally small; full provenance stays alongside the files.
catalog=[{'id':m['id'],'label':m['file'].removesuffix('.glb').replace('-',' ').title(),'file':m['file'],'parts':[p['name'] for p in m['parts']],'partBounds':{p['name']:{'center':p['normalizedCenter'],'size':p['normalizedSize']} for p in m['parts']},'bytes':m['bytes']} for m in manifest]
if len(sys.argv)>3:pathlib.Path(sys.argv[3]).write_text('// Curated public CC0 game props. Full provenance: public/scene-assets/manifest.json\nexport const SCENE_ASSETS = '+json.dumps(catalog,indent=2)+' as const;\nexport type SceneAssetId = typeof SCENE_ASSETS[number]["id"];\nexport const sceneAsset = (id:string)=>SCENE_ASSETS.find(asset=>asset.id===id);\n')
