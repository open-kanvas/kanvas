import {type JsonData} from '../../shared/connection-views';
import {JsonExplorer} from './JsonExplorer';
import {JsonRaw} from './JsonRaw';
import './json-raw.css';

export function JsonView({data}:{data:JsonData}){
 return (data.view??'raw')==='tree'?<JsonExplorer data={data}/>:<JsonRaw source={data.json}/>;
}
