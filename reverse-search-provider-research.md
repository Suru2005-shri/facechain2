# Reverse-search provider research

Verified 2026-09-03 from official SerpApi documentation.

## Provider selected for development

SerpApi Google Lens API is a third-party Google-Lens-compatible reverse-image-search API. Its official documentation states that the endpoint is `https://serpapi.com/search?engine=google_lens` and that uploaded images are supported through the SerpApi Image API: upload the image first, extract the returned `image_id`, then pass `image_id` to the Google Lens search. The `url` parameter can be omitted when `image_id` is used.

The provider returns structured Google Lens visual-search data, including result links and related metadata. The application must normalize only fields actually returned by the provider and must not invent similarity scores.

## Development pricing

The official SerpApi pricing page currently lists a Free plan at $0/month with 250 searches per month and 50 throughput per hour. A server-side API key is still required. Paid plans are available when the free allowance is exceeded; the application should show a clear configuration or provider-quota error rather than silently falling back to manual search.

## Official sources

- Google Lens API: https://serpapi.com/google-lens-api
- Google Lens image upload: https://serpapi.com/google-lens-upload-an-image
- SerpApi pricing: https://serpapi.com/pricing
