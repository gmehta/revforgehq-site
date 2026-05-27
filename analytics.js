/* Google Analytics 4 */
(function () {
  'use strict';

  var GA_MEASUREMENT_ID = 'G-623PSZ7HJD';

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
  document.head.appendChild(script);

  window.trackEvent = function (name, params) {
    gtag('event', name, params || {});
  };
})();
