# Synthetic datasets

Drop a `.json` file in this folder and it appears under **Data source → Synthetic demo data**
on the home page (restart is not required). Use it for demos, training and testing: the
investigation runs the normal pipeline (safety scan, entity extraction, graph, briefing) over your
pages, and makes no network requests for search or scraping.

```json
{
  "id": "my-scenario",
  "title": "Short name shown on the card",
  "description": "One or two sentences about the story.",
  "suggested_query": "What the query box is filled with",
  "highlights": ["Something worth pointing out in the demo"],
  "pages": [
    { "url": "http://exampleexampleexampleexampleexampleexampleexampleexample.onion/post/1",
      "title": "Page title",
      "text": "The page text the pipeline will read." }
  ]
}
```

* `id` may use letters, digits, `-` and `_`. Built-in scenarios win if an id clashes.
* Each page needs a unique `url` and some `text`. At most 200 pages, 60,000 characters each.
* Use invented identifiers. The extractor discards reserved documentation values
  (`192.0.2.x`/`198.51.100.x`/`203.0.113.x` addresses, `.example` domains), so use random-looking
  domains instead; if one happens to exist, that is a coincidence.
* Handles with digits or mixed case (`Gh0stwr1ter77`) are recognised as actor aliases more reliably than
  plain words (`ghostwriter`).
* Synthetic runs are labelled "Synthetic data" in the UI. They never touch the shared corpus,
  actor profiles or external lookup services.

## Frozen 50-document corpus

`research_evaluation/data/frozen_50.json` is the sanitized, public `SYN-001`
through `SYN-050` corpus.
The application validates every document hash and the complete dataset hash
before returning it from the authenticated evaluation endpoint. It contains no
private generator labels, annotator identities, adjudication, credentials, or
human-study results. The private construction key must remain outside this
repository and outside every deployment.
