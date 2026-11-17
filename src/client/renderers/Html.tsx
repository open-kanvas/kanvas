

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';
import {CustomHtml} from './CustomHtml';

import './html.css';

export function HtmlRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const data = view.data as TemplateData<'html'>; return <CustomHtml html={data.html} css={data.css} description={data.description} onReady={onReady}/>; }
}
