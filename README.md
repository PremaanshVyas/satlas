# Aussie Sky

> Real-time space situational awareness, with an AI agent at the front door.

A live, open platform that lets anyone explore what's happening in Earth orbit — every tracked satellite, rocket body, and piece of debris, visualised in 3D and queryable in plain English.

**Live demo:** _coming soon_  
**Status:** early development — MVP in progress

---

## The pitch

Existing space situational awareness (SSA) tools are either expensive enterprise systems sold to defence and large operators, or fragmented amateur sites that show one slice of the picture. Most students, amateur astronomers, journalists, and curious people don't have a unified, modern view of what's overhead.

Aussie Sky changes that. You open the site and see Earth, with every tracked object orbiting in real time. You ask: _"What's that bright thing crossing Melbourne tonight?"_ The AI agent reasons over orbital data, satellite imagery, and a knowledge base, and tells you — while highlighting the object on the globe.

That's the front door. Behind it sits a stack of services that any developer can also call directly:

- **Orbital compute** — pass predictions, conjunction analysis, position propagation
- **Vision pipeline** — Earth observation imagery (Sentinel-2) with computer vision overlays (fire scars, urban change)
- **Knowledge RAG** — semantic search across mission docs, satellite catalogs, public space data

Everything is open source. Public API. Free for non-commercial use.

---

## Why this exists

**Most people don't realise how busy orbit is.** There are over 30,000 tracked objects and hundreds of thousands of pieces of untracked debris. Showing this is a public good.

**Australia has growing space infrastructure but limited public-facing tools.** Tidbinbilla, the Australian Space Agency, university CubeSat programs — there's no single place a student in Melbourne can see what's overhead and when.

**AI agents over real data is the interesting frontier.** Most "AI" products are chat wrappers around an LLM. This is a working example of an agent that orchestrates real scientific computation, image analysis, and knowledge retrieval to answer questions a single API call can't.

---

## Architecture

```
                    [ Frontend (React + Three.js) ]
                                  |
                         [ AI Agent (Claude API) ]
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
[ Orbital compute ]      [ Vision pipeline ]      [ Knowledge RAG ]
 FastAPI + skyfield       PyTorch + Sentinel-2      pgvector + Postgres
```

The AI agent doesn't generate orbital math. It calls tools that do. Every user query becomes one or more typed tool calls, and the agent composes the results.

Full architecture doc: [`docs/architecture.md`](docs/architecture.md) _(coming soon)_

---

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | TypeScript, React, Three.js / Cesium, Tailwind, Vite | Industry standard for interactive web; Cesium is purpose-built for geospatial 3D |
| Agent | Anthropic Claude API with tool use | Mature tool-use, strong reasoning over structured data |
| Orbital service | Python 3.11, FastAPI, skyfield, sgp4 | The orbital mechanics library ecosystem lives in Python |
| Vision service | Python, PyTorch, Hugging Face Transformers | Pre-trained EO models we can fine-tune later |
| API gateway | Go (chi or echo) | Concurrency, low latency in front of agent (V1+) |
| Database | PostgreSQL with pgvector + PostGIS, TimescaleDB extension | One DB for relational, vector, spatial, and time-series — clean |
| Pipeline | Cron → Temporal (later) | TLE refresh every 8h, conjunction sweeps, imagery ingestion |
| Infra | AWS (ECS Fargate, S3, CloudFront, RDS), Terraform | Maps to what every Australian SWE listing asks for |
| CI/CD | GitHub Actions, Docker | Standard |
| Observability | OpenTelemetry, Sentry | Real production hygiene |

---

## Data sources (all public)

- **TLE catalogs** — [CelesTrak](https://celestrak.org/), Space-Track.org (free with registration)
- **Satellite imagery** — Sentinel-2 via [Sentinel Hub](https://www.sentinel-hub.com/) and Copernicus
- **Space weather** — [NOAA SWPC](https://www.swpc.noaa.gov/)
- **Ground station coordinates** — public ephemerides
- **Knowledge corpus** — NASA/ESA mission documentation, public CubeSat datasheets

---

## Roadmap

### MVP (weeks 1–4)
- [x] Project scaffolding
- [ ] 3D Earth with ~5,000 satellites rendering accurately
- [ ] Click satellite → details
- [ ] Filter by category (Starlink, ISS, debris, etc.)
- [ ] Deployed to a real domain
- [ ] CI/CD wired up

### V1 (weeks 5–8)
- [ ] Full TLE catalog (~30k objects)
- [ ] Pass predictor for any user location
- [ ] Search and filter UI
- [ ] AI agent v1 — natural-language questions, calls orbital tools
- [ ] Public API with docs
- [ ] Rate limiting

### V2 (weeks 9–14) — the differentiator
- [ ] Conjunction analysis service
- [ ] Alert subscriptions (email/SMS for ISS pass, debris near asset, etc.)
- [ ] Vision pipeline integration — Sentinel-2 imagery on demand
- [ ] First CV use case: bushfire scar detection in Australian regions
- [ ] Vector RAG over space documentation
- [ ] Blog post explaining how it all works

### V3 — stretch
- [ ] Space weather overlay (geomagnetic storms, aurora prediction)
- [ ] ML-based orbital prediction error correction
- [ ] Mobile app

---

## Local development

_Setup instructions will land alongside the first scaffolded code._

---

## Contributing

Solo project for now. Designed to be open. Once MVP is live, see `CONTRIBUTING.md` (to be written).

---

## Author

Built by Premaansh ("mickey"), software engineering student at RMIT in Melbourne.

If you're hiring software engineering interns in Australia and what you've just read interests you — get in touch.

LinkedIn: _add link_  
Email: _add email_

---

## License

MIT
