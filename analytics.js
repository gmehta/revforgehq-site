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

  var AI_REFERRER_PATTERNS = [
    { pattern: /chatgpt\.com|chat\.openai\.com/i, source: 'chatgpt' },
    { pattern: /perplexity\.ai/i, source: 'perplexity' },
    { pattern: /claude\.ai|anthropic\.com/i, source: 'claude' },
    { pattern: /gemini\.google\.com|bard\.google\.com/i, source: 'gemini' },
    { pattern: /copilot\.microsoft\.com|bing\.com\/chat/i, source: 'copilot' },
    { pattern: /you\.com/i, source: 'you_com' },
    { pattern: /phind\.com/i, source: 'phind' }
  ];

  var ref = document.referrer || '';
  for (var i = 0; i < AI_REFERRER_PATTERNS.length; i++) {
    if (AI_REFERRER_PATTERNS[i].pattern.test(ref)) {
      gtag('event', 'ai_referrer_visit', {
        ai_source: AI_REFERRER_PATTERNS[i].source,
        page_location: window.location.href,
        page_referrer: ref
      });
      break;
    }
  }

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
  document.head.appendChild(script);

  window.trackEvent = function (name, params) {
    gtag('event', name, params || {});
  };
})();
