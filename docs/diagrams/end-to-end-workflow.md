# End-to-End Cross-Platform Workflow

This is the minimum acceptance workflow from `docs/Government_Service_Navigator_Project_Plan.md` §3: the citizen applies in the **Flutter** app, the **ASP.NET Core** API validates and stores the application in **PostgreSQL**, the **agents** plan, check, draft and validate, an **officer in the React dashboard** decides, and the citizen's app shows the new status.

The steps below are the path the code actually takes as of 2026-09-29, with each hop mapped to its screen and endpoint. Related docs:
- `docs/api.md` for the request and response shapes
- `docs/diagrams/agentic-ai-architecture.md` for the agent internals
- `docs/diagrams/human-in-the-loop-workflow.md` for the review gate

## The pattern

Every cross-platform hop follows the same pattern:

1. **Clients never talk to each other.** Flutter and React share no channel. All state passes through the API and the app database.
2. **The API owns every state change.** Clients send intent (a submit, a decision); the server sets department, stage, payment status and task status.
3. **Agents run inside the API.** They run synchronously when a submit arrives, and on demand when an officer asks. They never write a final decision.
4. **A human commits every high-impact change.** Only an officer approves a stage, and only a finance officer verifies a slip. See the HITL doc.
5. **Clients pull status.** The citizen sees updates when the app refetches `my-applications`; nothing is pushed live. Email (SMTP) is the only push channel for application status.

## Swimlane overview

```mermaid
flowchart LR
    subgraph C["Flutter - Citizen"]
        C1["Describe need<br/>describe_need_screen"]
        C2["Intake plan result<br/>intake_plan_result_screen"]
        C3["Procedure detail and<br/>eligibility self-check"]
        C4["Application form<br/>application_form_screen"]
        C5["Pay fee<br/>payment_screen"]
        C6["Applications tab<br/>status and stage tracker"]
    end

    subgraph A["ASP.NET Core API"]
        A1["POST /api/IntakeAgent/ask"]
        A2["GET /api/applications/form"]
        A3["POST /api/applications/documents"]
        A4["POST /api/applications/submit"]
        A5["POST /api/applications/{id}/finalize"]
        A6["GET /api/verification/my-applications"]
    end

    subgraph AI["Agentic AI (in-process)"]
        G1["Agent 1<br/>Intake and Planning"]
        G4["Agent 4<br/>Validation and Safety"]
        G23["Agents 2 and 3<br/>Eligibility and Draft"]
    end

    subgraph D["PostgreSQL"]
        D1[("ApplicationSubmissions<br/>SubmissionDocuments")]
        D2[("VerificationTasks<br/>ComplianceChecks")]
        D3[("Payments")]
        D4[("AgentDrafts")]
        D5[("OfficerReviews<br/>AuditLogs")]
    end

    subgraph R["React - Officer and Finance"]
        R1["Pending reviews<br/>department queue"]
        R2["Verification workspace<br/>answers, documents, agent draft"]
        R3["Finance dashboard<br/>verify deposit slip"]
        R4["Decision<br/>approve, reject, revise"]
    end

    C1 --> A1 --> G1 --> C2 --> C3 --> C4
    C4 --> A2
    C4 --> A3 --> D1
    C4 --> A4 --> G4
    G4 -- "pass" --> D1
    G4 -- "pass" --> D2
    A4 -- "fee due" --> C5 --> A5 --> D2
    A4 -- "slip or ref" --> D3
    D2 --> R1 --> R2
    R2 -- "generate draft" --> G23 --> D4
    D3 --> R3
    R2 --> R4 --> D5
    R4 --> D2
    D2 --> A6 --> C6
```

## Step-by-step sequence (single-stage service)

```mermaid
sequenceDiagram
    autonumber
    actor Cit as Citizen (Flutter)
    participant API as ASP.NET Core API
    participant AG as Agents (in-process)
    participant DB as PostgreSQL
    participant VDB as Vector DB
    actor Fin as Finance Officer (React)
    actor VO as Verifying Officer (React)

    Note over Cit,API: 1. Discover
    Cit->>API: POST /api/auth/login
    API-->>Cit: JWT (role User, nicNumber)
    Cit->>API: POST /api/IntakeAgent/ask { text }
    API->>AG: Agent 1 GeneratePlanAsync
    AG->>VDB: top-3 cosine match
    AG-->>Cit: recommended service, documents, steps

    Note over Cit,DB: 2. Apply
    Cit->>API: GET /api/applications/form/{serviceId}?stage=1
    API-->>Cit: template, department, totalStages
    loop each file field
        Cit->>API: POST /api/applications/documents (multipart)
        API->>DB: SubmissionDocument (unattached)
        API-->>Cit: document id
    end
    Cit->>API: POST /api/applications/submit { answers, documents }
    API->>API: required fields, set department footer
    API->>AG: Agent 4 ValidateAndEnqueueAsync
    alt Agent 4 rejects
        AG-->>API: RejectionReasons
        API-->>Cit: 400 safety validation failed (nothing saved)
    else Agent 4 passes
        API->>DB: ApplicationSubmission + attach documents
        alt fee due, no slip or ref
            API-->>Cit: paymentRequired: true
            Cit->>API: Stripe checkout or installment plan
            Cit->>API: POST /api/applications/{id}/finalize
        else slip uploaded or ref given
            API->>DB: Payment (PendingVerification or Paid)
        end
        API->>DB: VerificationTask (Pending, department) + ComplianceChecks
        API-->>Cit: referenceNumber APP-{id}, taskId
    end

    Note over Fin,DB: 3. Verify payment
    Fin->>API: GET /api/payments/pending-slips (dept scoped)
    Fin->>API: GET /api/verification/documents/{id}/content
    Fin->>API: POST /api/payments/{id}/verify { approved }
    API->>DB: Payment Paid + AuditLog
    API-->>Cit: payment status email (SMTP)

    Note over VO,DB: 4. Review (human in the loop)
    VO->>API: GET /api/verification/tasks/pending (dept scoped)
    VO->>API: GET /api/verification/tasks/{id}
    VO->>API: POST /api/verification/tasks/{id}/agent-draft
    API->>AG: Agent 2 then Agent 3 (then Agent 4 re-check)
    AG->>DB: AgentDraft
    API-->>VO: eligibility, prefill, fee, slot, tool calls
    VO->>API: PUT /api/verification/tasks/{id}/decision { status }
    API->>API: payment lock (stage fee must be Paid)
    API->>DB: task status + OfficerReview + AuditLog

    Note over Cit,DB: 5. Status back to citizen
    Cit->>API: GET /api/verification/my-applications
    API-->>Cit: status, stage, stageStatus, installment plan
```

## Multi-stage, multi-department services

When a service has `TotalStages > 1`, steps 2-4 repeat once per stage. Each stage uses its own template, and each goes to its own department's queue (`docs/adr/0009-multi-stage-department-workflow.md`).

```mermaid
sequenceDiagram
    autonumber
    actor Cit as Citizen (Flutter)
    participant API as API
    actor D1 as Dept A Officer
    actor D2 as Dept B Officer

    Cit->>API: submit (stage 1 form, Dept A)
    API-->>D1: task in Dept A queue
    D1->>API: PUT tasks/{id}/approve-stage
    API->>API: stage 2, move task to Dept B, StageStatus StageApproved
    API-->>Cit: email "Stage 1 approved, submit Stage 2"
    Cit->>API: GET applications/form/{id}?stage=2
    Cit->>API: POST applications/submit-stage
    API->>API: Agent 4, merge "[Stage 2]" answers
    API-->>D2: task in Dept B queue
    D2->>API: PUT tasks/{id}/approve-stage (last stage)
    API->>API: task Approved, StageStatus Completed
    Cit->>API: GET verification/my-applications
    API-->>Cit: Completed
```

The web workspace picks the endpoint automatically: **Approve** calls `approve-stage` while `currentStage < maxStages`, and `decision` otherwise. Reject and Revise always call `decision`.

## Status the citizen sees

`GET /api/verification/my-applications` returns two status fields, and the applications tab reads both:

| Field | Source | Values | Shown as |
|---|---|---|---|
| `status` | `VerificationTask.Status` | `Pending`, `Approved`, `Rejected`, `Revised`, `Cancelled` | Officer outcome |
| `stageStatus` | `ApplicationSubmission.StageStatus` | `PendingReview`, `StageApproved`, `AwaitingFeePayment`, `Completed`, `Deleted` | Stage tracker and next-action banner ("submit next stage", "pay fee") |

The two fields are updated by different code paths:
- `decision` changes only the task `status`. A rejection or revision leaves `stageStatus` at `PendingReview` and sends the citizen no email.
- `approve-stage` changes both fields and sends an email.
- Finance verifying a payment sets `stageStatus` to `Completed`, even on a multi-stage application that still has stages left.

## How "real time" is achieved

| Channel | Used for | Mechanism |
|---|---|---|
| SignalR push (`/hubs/applications`) | Application status, payments, installments, notifications, refunds (citizen); queue and audit lists (staff) | An EF Core interceptor sees the commit, clears the cache, and sends `applicationsChanged` / `refundUpdated` to the citizen or `queueUpdated` to staff. Clients refetch over REST (ADR-0012) |
| Refetch on screen load / pull-to-refresh | Everything | Riverpod providers (`myApplicationsProvider`, `notificationsProvider`) and TanStack Query on the web re-query the API |
| Fallback polling | Application list (30 s), open refund (60 s) | Only while the app is in the foreground; catches anything a dropped connection missed |
| Email (SMTP) | Stage approved, payment status changed, installment reminder/cancellation | `NotificationService`, best effort |
| In-app notifications | Installment reminders and cancellations only | `InstallmentMonitorService` writes `CitizenNotification` rows |

An officer's decision normally reaches the citizen's open screen in about a second. The mobile app closes its socket in the background; on resume it refetches and reconnects. There are still no OS-level push notifications (FCM/APNs), so a citizen with the app closed only sees the change when they open it, or by email for the events above.

## Failure paths on the workflow

| Where | What happens | Citizen sees |
|---|---|---|
| Agent 1 finds no keyword match | `recommendedService: "Service Not Found"` | "Please contact the main helpdesk" plan |
| Required field missing | `400 { missingFields }` | Field errors on the form |
| Agent 4 rejects (injection, age, duplicate, missing docs) | `400 { errors, summary }`, nothing saved | Rejection reasons |
| Fee not covered on `finalize` | `402` with the outstanding amount | Payment screen again |
| Finance rejects the slip | Payment `Failed`; officer approval stays locked | Payment status email |
| Installment passes its due date unpaid | Hourly job cancels the plan, tasks and application | In-app notification + email |
| Officer rejects / requests revision | Task `Rejected` / `Revised` + `OfficerReview` comment | Status change on next refresh (no email) |
