import { isSafeUrl } from '../../shared/urls';
/** Parse inertly, copy only passive formatting; never attach caller DOM. */
export function safeMapPopup(html: string): HTMLElement {
  const source = new DOMParser().parseFromString(html, 'text/html'), root = document.createElement('div');
  const allowed = new Set(['B','STRONG','EM','I','P','BR','UL','OL','LI','A','CODE']);
  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent ?? '')); return; }
    if (!(node instanceof Element) || ['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE'].includes(node.tagName)) return;
    const target = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createElement('span');
    if (target instanceof HTMLAnchorElement) { const href = node.getAttribute('href'); if (href && isSafeUrl(href)) { target.href=href; target.target='_blank';target.rel='noopener noreferrer'; } }
    for (const child of node.childNodes) copy(child,target); parent.appendChild(target);
  };
  for (const child of source.body.childNodes) copy(child,root); return root;
}
