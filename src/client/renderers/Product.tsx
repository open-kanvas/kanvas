import {MediaImage} from './Image';
import {PRODUCT_ATTRIBUTES,productAttribute,type ProductData} from '../../shared/product';
import {regionalNumber} from '../../shared/regional';
import {useRegional} from './Regional';
import './browsing.css';

export function ProductComparison({ data }: { data: ProductData }) {
  const preferences = useRegional();
  const supplied=data.attributes??[], attributes=[...PRODUCT_ATTRIBUTES,...supplied.filter(a=>!PRODUCT_ATTRIBUTES.some(b=>b.key===a.key))].map(a=>supplied.find(b=>b.key===a.key)??a);
  const cell = (value: ReturnType<typeof productAttribute>) => value === undefined || value === null
    ? <span className="missing-value">Not supplied</span> : typeof value === 'boolean' ? value ? 'Yes' : 'No' : regionalNumber(value, preferences);
  return <div className="product-comparison">
    <header className="product-comparison-intro">{data.image&&<div className="product-comparison-image"><MediaImage entry={data.image}/></div>}<div><h2>{data.name}</h2>{data.description && <p>{data.description}</p>}</div></header>
    <div className="product-comparison-scroll" role="region" aria-label="Vendor comparison" tabIndex={0}>
      <table><thead><tr><th scope="col">Attribute</th>{data.offers.map((offer, index) => <th key={index} scope="col">{offer.vendor}</th>)}</tr></thead>
        <tbody>{attributes.filter(attribute => attribute.key !== 'url').map(attribute => <tr key={attribute.key}><th scope="row">{attribute.label}</th>{data.offers.map((offer, index) => <td key={index}>{cell(productAttribute(offer, attribute.key))}</td>)}</tr>)}
          <tr className="product-url-row"><th scope="row">Product page</th>{data.offers.map((offer, index) => <td key={index}>{offer.url ? <a href={offer.url} target="_blank" rel="noopener noreferrer">{offer.url}</a> : cell(undefined)}</td>)}</tr>
          {data.offers.some(offer => offer.restrictions) && !attributes.some(attribute => attribute.key === 'restrictions') && <tr><th scope="row">Restrictions</th>{data.offers.map((offer, index) => <td key={index}>{cell(offer.restrictions)}</td>)}</tr>}
        </tbody></table>
    </div><p className="product-comparison-note">Prices, currencies and shipping terms as supplied; no currency conversion or delivered-total calculation.</p>
    {!!data.details?.length && <dl className="product-shared-details">{data.details.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
  </div>;
}

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo,Details,Link} from './ContentPrimitives';
import './product.css';

export function ProductRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'product'>; if(d.layout==='comparison'||d.layout==='multi-vendor') return <ProductComparison data={d}/>; return <div className={`product-content layout-${d.layout}`}><div className="product-intro"><Photo image={d.image}/><div><h2>{d.name}</h2><p>{d.description}</p><Details items={d.details} showControls={surface.showControls}/></div></div><div className="product-offers">{d.offers.map((offer,i)=><article key={i}><span className="content-eyebrow"><Link url={offer.url}>{offer.vendor}</Link></span><strong className="offer-price">{offer.price}</strong>{[offer.availability,offer.hours,offer.distance,offer.shipping].filter(Boolean).map((x,j)=><p key={j}>{x}</p>)}{surface.showControls && offer.url && <Link url={offer.url}>View offer</Link>}</article>)}</div></div>; }
}
