/* Google Tag Manager — set GTM_CONTAINER_ID below (also used for the noscript fallback in HTML) */
(function () {
  'use strict';

  var GTM_CONTAINER_ID = 'GTM-XXXXXXX';

  if (!GTM_CONTAINER_ID || GTM_CONTAINER_ID === 'GTM-XXXXXXX') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_CONTAINER_ID);
  var first = document.getElementsByTagName('script')[0];
  if (first && first.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    document.head.appendChild(script);
  }

  window.trackEvent = function (name, params) {
    window.dataLayer.push(Object.assign({}, params || {}, { event: name }));
  };
})();
