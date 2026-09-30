import { PRODUCT_ATTRIBUTES, productAttribute, type ProductData } from '../../shared/product';
import { regionalNumber } from '../../shared/regional';
import { useRegional } from './Regional';
import './browsing.css';

export function ProductComparison({ data }: { data: ProductData }) {
  const preferences = useRegional();
  const attributes = data.attributes ?? PRODUCT_ATTRIBUTES;
  const cell = (value: ReturnType<typeof productAttribute>) => value === undefined || value === null
    ? <span className="missing-value">Not supplied</span> : typeof value === 'boolean' ? value ? 'Yes' : 'No' : regionalNumber(value, preferences);
  return <div className="product-comparison">
    <header><h2>{data.name}</h2>{data.description && <p>{data.description}</p>}</header>
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
