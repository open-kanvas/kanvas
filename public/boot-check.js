/* KANVAS boot check: plain ES5 without dependencies. If the app has not rendered
   after 12 seconds, the browser most likely cannot run it (for example an old
   smart-TV browser without JavaScript module support). Show readable guidance
   instead of a blank screen; remove it again if the app starts later. */
(function () {
  var notice = null, timer = null;
  function mounted() {
    var root = document.getElementById('root');
    return !!(root && root.firstChild);
  }
  function line(tag, text, style) {
    var element = document.createElement(tag);
    element.style.cssText = style;
    element.appendChild(document.createTextNode(text));
    return element;
  }
  function show() {
    if (notice || mounted() || !document.body) return;
    notice = document.createElement('div');
    notice.setAttribute('role', 'alert');
    notice.className = 'kanvas-boot-notice';
    notice.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;background:#111513;color:#ededed;font-family:Arial,Helvetica,sans-serif;text-align:center;padding:10% 24px 24px;overflow:auto';
    notice.appendChild(line('h1', 'KANVAS could not start in this browser', 'font-size:32px;margin:0 0 20px'));
    notice.appendChild(line('p', 'This browser may be too old to run KANVAS. Open this address in a current browser (Chrome, Edge, Firefox or Safari), or show it on another device and cast or mirror that screen.', 'font-size:20px;line-height:1.4;max-width:680px;margin:0 auto 16px'));
    notice.appendChild(line('p', location.host + location.pathname, 'font-size:16px;opacity:.7;margin:0;word-wrap:break-word'));
    document.body.appendChild(notice);
  }
  setTimeout(show, 12000);
  timer = setInterval(function () {
    if (!mounted()) return;
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
    notice = null;
    clearInterval(timer);
  }, 2000);
})();
