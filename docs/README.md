# Documentation

Documentation for Government Service Navigator v3.0.0, as built. The citizen mobile app ships as **LankaServe**. These documents describe the code as it is, including known gaps. The original plan is kept separately for reference.

## Start here

| Document | What it covers |
|---|---|
| [System architecture](diagrams/system-architecture.md) | Components, request flow, what is actually enforced, configuration, client base URLs, build and delivery |
| [API reference](api.md) | Every endpoint, with auth tier, request and response shapes, validation rules and side effects |
| [Hosting on Azure and Vercel](azure-hosting.md) | The Docker image, the App Service and registry, app settings, the deploy workflow, the web dashboard on Vercel |

## Diagrams

| Document | What it covers |
|---|---|
| [End-to-end workflow](diagrams/end-to-end-workflow.md) | The Flutter → API → agents → React path, step by step, including payments, stages and collection bookings |
| [Agentic AI architecture](diagrams/agentic-ai-architecture.md) | The four agents, their tools, the optional Groq LLM layer, RAG, booking, and the pipeline state machine |
| [Human-in-the-loop workflow](diagrams/human-in-the-loop-workflow.md) | Where the workflow pauses, who resumes it, the guards, and where the loop is weak |
| [ER diagram](diagrams/er-diagram.md) | Both databases, table by table, and the soft links between them |

## Decisions and background

| Document | What it covers |
|---|---|
| [Architecture Decision Records](adr/README.md) | 16 decisions, from JWT auth to the LLM layer and hosting |
| [Performance and Redis](performance-and-redis.md) | The analysis behind paging, caching, SignalR push and rate limiting for 1000+ daily users |
| [Project plan](Government_Service_Navigator_Project_Plan.md) | The original SE3090 plan, kept as written |

## Keeping these up to date

- Update a document whenever you change what it describes. Don't add dates to the docs; git history records when things changed.
- New decisions go in `adr/` as the next numbered ADR, and in `adr/README.md`.
- Validation rules live in three places (`backend/src/Validation`, `mobile/lib/utils/validators.dart`, `web/src/utils/validation.ts`) and are summarised in `api.md`. Change all of them together.
