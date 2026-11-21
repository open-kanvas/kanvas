

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {profileContactTarget,type ProfileDetail} from '../../shared/profile-contact';
import {isSafeUrl} from '../../shared/urls';
import {Photo,Details,Link} from './ContentPrimitives';
import './profile.css';
function ProfileContacts({ items }: { items: ProfileDetail[] }) {
  return <dl className="profile-contacts" aria-label="Contact details">{items.map((item, index) => {
    const target = profileContactTarget(item);
    return <div className="profile-contact-detail" data-contact-type={item.type} key={index}>
      <dt>{item.label}</dt>
      <dd>{item.type === 'address' ? <><span className="profile-contact-value">{item.value}</span>{target && <a className="profile-contact-map" href={target.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open ${item.label} in Maps: ${item.value}`}>Open in Maps <span aria-hidden="true">↗</span></a>}</> : target ?
        <a className="profile-contact-action" href={target.href} target={target.external ? '_blank' : undefined} rel={target.external ? 'noopener noreferrer' : undefined} referrerPolicy={target.external ? 'no-referrer' : undefined} aria-label={`${item.label}: ${item.value}`}><span className="profile-contact-value">{item.value}</span>{target.external && <span className="profile-contact-arrow" aria-hidden="true">↗</span>}</a>
        : <span className="profile-contact-value">{item.value}</span>}
      </dd>
    </div>;
  })}</dl>;
}
export function ProfileRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  {
      const d=view.data as TemplateData<'profile'>;
      const contacts = d.details?.filter(item => item.type && item.type !== 'text') ?? [], plain = d.details?.filter(item => !item.type || item.type === 'text');
      return <div className={`profile-content profile-${d.kind} profile-contact-layout ${contacts.length ? 'profile-has-contacts' : ''}`}>
        <Photo key={d.image?.url} image={d.image}/>
        <div className="profile-copy">
          <header className="profile-identity"><h2 className="profile-name">{d.name}</h2>{d.role && <p className="profile-role">{d.role}</p>}</header>
          {!!contacts.length && <ProfileContacts items={contacts}/>}
          {!!d.links?.length && <nav className="profile-links" aria-label="Profile links">{d.links.map((link,i)=><Link key={i} url={isSafeUrl(link.url) ? link.url : undefined}>{link.label}</Link>)}</nav>}
          {d.description && <p className="profile-description">{d.description}</p>}
          <Details items={plain} showControls={surface.showControls}/>
        </div>
      </div>;
    }
}
