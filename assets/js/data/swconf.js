---
layout: compress
permalink: '/:path/swconf.js'
# Note that this file will be fetched by the ServiceWorker, so it will not be cached.
# Overrides the theme's copy to add entries to `interceptor.urlPrefixes`.
---

const swconf = {
  {% if site.pwa.cache.enabled %}
    cacheName: 'chirpy-{{ "now" | date: "%s" }}',

    {%- comment -%} Resources added to the cache during PWA installation. {%- endcomment -%}
    resources: [
      '{{ "/assets/css/:THEME.css" | replace: ':THEME', site.theme | relative_url }}',
      '{{ "/" | relative_url }}',
      {% for tab in site.tabs %}
        '{{- tab.url | relative_url -}}',
      {% endfor %}

      {% assign cache_list = site.static_files | where: 'swcache', true %}
      {% for file in cache_list %}
        '{{ file.path | relative_url }}'{%- unless forloop.last -%},{%- endunless -%}
      {% endfor %}
    ],

    interceptor: {
      {%- comment -%} URLs containing the following paths will not be cached. {%- endcomment -%}
      paths: [
        {% for path in site.pwa.cache.deny_paths %}
          {% unless path == empty %}
            '{{ path | relative_url }}'{%- unless forloop.last -%},{%- endunless -%}
          {% endunless  %}
        {% endfor %}
      ],

      {%- comment -%} URLs containing the following prefixes will not be cached. {%- endcomment -%}
      urlPrefixes: [
        {% if site.analytics.goatcounter.id != nil and site.pageviews.provider == 'goatcounter' %}
          'https://{{ site.analytics.goatcounter.id }}.goatcounter.com/counter/',
        {% endif %}
        {%- comment -%}
          Site override. The ServiceWorker answers every GET cache-first, including
          cross-origin ones. Judge0 result polling reuses one URL, so a cached
          "In Queue" reply would be served forever. The search model is already
          stored by transformers.js in its own cache.
        {%- endcomment -%}
        'https://ce.judge0.com/',
        'https://huggingface.co/'
      ]
    },

    purge: false
  {% else %}
    purge: true
  {% endif %}
};
