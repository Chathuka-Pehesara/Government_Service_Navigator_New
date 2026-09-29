# API Reference

Base URL: `http://localhost:5119` (the API listens on a hardcoded port; the web dashboard reads `VITE_API_URL` in new code - see `docs/diagrams/system-architecture.md`). Swagger UI is available at `/swagger` when `ASPNETCORE_ENVIRONMENT=Development`.

All request/response bodies are JSON unless marked *multipart*. ASP.NET Core's default `System.Text.Json` camelCases property names in responses (e.g. the C# `FormName` property serializes as `"formName"`), which is reflected below.

Reflects `backend/src/Controllers/` as of 2026-09-29.

**Cross-cutting behaviour** (details in [Performance behaviour](#performance-behaviour)):
- Growing lists are paged with `?page=`; without it they return at most the newest 200 rows.
- Every client is rate limited (default 120 requests per minute) and gets `429` beyond that.
- Responses are Brotli/gzip compressed when the client sends `Accept-Encoding`.
- Changes are pushed over SignalR at `/hubs/applications`, so clients should refetch on a message rather than poll.

---

## How auth actually works - read this first

The JWT middleware is registered globally, but that only makes `Authorization: Bearer <token>` *available* to check. A route rejects unauthenticated requests only if its controller/action carries `[Authorize]`. There are three tiers in the codebase today:

| Tier | Meaning | Where |
|---|---|---|
| **None** | Callable with no token at all | `AuthController` (except `logout`), `AdminController`, `ServicesController`, `TemplateController`, `IntakeAgentController`, `EligibilityAgentController`, `ActionAgentController`, `RagSetupController`, `GET /api/verification/seed` |
| **Any token** | `[Authorize]` - any valid, non-revoked token (citizen, officer or admin) | `ApplicationsController`, `NotificationsController`, `AuditLogsController`, `AnalyticsController`, `AnomalyDetectionController`, the citizen side of `RefundsController`, most of `PaymentsController` and `InstallmentPlansController`, `GET /api/verification/my-applications` |
| **Role** | `[Authorize(Roles = "...")]` - checked against the token's `ClaimTypes.Role` claim | Every other `VerificationController` action, finance actions in `PaymentsController`, staff actions in `InstallmentPlansController` |

The role lists used are:

- `OfficerRoles` (Verification): `Verifying Officer, Department Admin, Auditor, Finance Officer, Officer, Admin, System Admin`
- `FinanceRoles` (Payments): `Finance Officer, Department Admin, Admin, System Admin`
- `StaffRoles` (Installments): `Finance Officer, Department Admin, Verifying Officer, Officer, Admin, System Admin`

Citizens' tokens carry role `User`, so they are excluded from all three.

**Department scoping** is enforced server-side for the verification queue and finance payment views: the caller's `department` claim filters results, and single-item reads/writes for another department return `403`. Callers with role `Admin` or containing `System Admin` (or with no `department` claim) see everything. Everywhere else - officers, service catalog, templates - scoping is still client-side only; see `docs/adr/0004-client-side-department-scoping.md`.

**Things "Any token" does not protect:** analytics, anomaly resolution and all audit-log reads are callable by a *citizen* token too - there's no role check on them (`RefundsController` has a `TODO` saying so). Likewise `GET /api/payments/{id}`, `GET /api/payments/{id}/ledger`, `GET /api/installment-plans/{id}` and `POST /api/installment-plans/{id}/cancel` don't check that the payment/plan belongs to the caller.

### JWT claims

| Token from | Claims |
|---|---|
| `login` (citizen) | `sub`, `email`, `role` (`User`), `fullName`, `nicNumber`, `jti` |
| `officer-login` | `sub`, `email`, `role` (e.g. `Verifying Officer`), `department`, `jti` |
| `admin-login` | `sub`, `email`, `role` (e.g. `Admin`), `jti` |

Tokens are HMAC-SHA256-signed with `JWT_KEY` and expire after **7 days** (hardcoded `DateTime.UtcNow.AddDays(7)` in `AuthService` - `.env`'s `JWT_EXPIRY_HOURS` is **not read anywhere**). The `jti` is checked on every request against Redis, or a short in-memory cache backed by the `RevokedTokens` table when Redis is not configured (`docs/adr/0001-jwt-auth-with-revocation-table.md`, `docs/adr/0013-hybridcache-with-optional-redis.md`). Citizen-facing endpoints identify the caller by the `nicNumber` claim (applications, notifications, installment ownership) or the `email` claim (payments/refunds "mine").

---

## Validation

Request bodies are validated before a controller runs. Every validation failure is a `400` with one shape, which the mobile app (`service_api_client.dart`, `auth_service.dart`) and the web (`apiFetch`, `parseApiError` in `web/src/utils/validation.ts`) both read:

```json
{ "message": "all problems in one line", "errors": ["..."], "fields": { "email": "Enter a valid email address..." } }
```

The rules live in `backend/src/Validation` and are mirrored in `mobile/lib/utils/validators.dart` and `web/src/utils/validation.ts` - change all three together.

| Rule | Accepts |
|---|---|
| NIC (`[SriLankaNic]`) | Old format 9 digits + V/X (`881234567V`, year 19YY) or new format 12 digits (`198812345678`). The day-of-year digits must be 001-366 (men) or 501-866 (women), day 060 only in a leap year, and the birth date cannot be in the future |
| Email (`[Email]`) | `name@domain.tld`, at most 254 characters. Login keeps the looser `[EmailAddress]` so older accounts still sign in |
| Phone (`[SriLankaPhone]`) | `0XXXXXXXXX`, `+94XXXXXXXXX` or `0094XXXXXXXXX` (spaces and dashes ignored). Department contact numbers also accept hotlines such as `1919` |
| Password (`[StrongPassword]`) | 8-64 characters with an uppercase letter, a lowercase letter and a number, no spaces. Applies to registration, new officers and password resets - not to login |
| Name (`[PersonName]`) | 2-100 letters in any script (Sinhala and Tamil included), spaces, dots, apostrophes, hyphens |
| Money (`[Money]`) | More than 0, at most 10,000,000, at most 2 decimal places. Service fees may be 0 |
| Free text (`[PlainText]`) | No HTML tags; each field has its own length limit |

Other checks worth knowing:

- Registration rejects a second account with the same NIC or email (email is compared case-insensitively and stored lower-case).
- Application answers (`submit`, `submit-stage`) must suit the template field: numbers, dates between 1900 and 2100, dropdown answers from the listed options, and text fields whose label mentions NIC, email or phone must hold a valid one (`ApplicationAnswersValidator`). Invalid answers come back as `invalidFields: { label: message }`.
- Templates: labels must be unique among input fields (answers are stored by label) and dropdowns need at least one option.
- Collection slots: 06:00-20:00, end after start, at least 15 minutes, capacity 1-500, and no overlap with another slot of the same department on the same day.
- A reason is required when rejecting a refund, rejecting a manual payment, or rejecting / sending back an application.
- The service catalog endpoints bind EF entities directly, so they are checked in code (`ServiceCatalogValidator`) instead of with attributes, which would change the database model.

---

## Auth - `AuthController`, `api/auth`

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/auth/register` | None | [`RegisterRequest`](#registerrequest) → [`AuthResponse`](#authresponse) with `user` |
| POST | `/api/auth/login` | None | [`LoginRequest`](#loginrequest) → `AuthResponse` with `user` |
| POST | `/api/auth/officer-login` | None | `LoginRequest` → `AuthResponse` with `officer` |
| POST | `/api/auth/admin-login` | None | `LoginRequest` → `AuthResponse` with `admin` |
| POST | `/api/auth/logout` | Any token | *(no body)* → `AuthResponse { success: true }` |

### `LoginRequest`
```json
{ "email": "string (required, email format)", "password": "string (required)" }
```

### `RegisterRequest`
```json
{ "fullName": "string", "email": "string (email)", "password": "string (min 6 chars)", "nicNumber": "string" }
```
Creates a `User` row (citizen). Fails with `{ success: false, errorMessage: "User with this email already exists." }` (still `200 OK`, not `409`) if the email is taken.

### `AuthResponse`
```json
{
  "success": true,
  "token": "eyJ...",
  "errorMessage": null,
  "user": { "email": "", "fullName": "", "nicNumber": "", "role": "" },
  "officer": { "email": "", "fullName": "", "department": "", "role": "" },
  "admin": { "email": "", "role": "" }
}
```
Only one of `user`/`officer`/`admin` is populated. **These actions return `200 OK` even on failure** - check `success`/`errorMessage`, not the status code.

`logout` reads the caller's `jti`/`exp` and inserts a `RevokedToken` row, so that exact token is rejected from then on regardless of expiry.

---

## Admin - `AdminController`, `api/admin`

**Auth: None** on every action.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/admin/officers?department=X` (optional) | → `OfficerDetailsDto[]` |
| POST | `/api/admin/officers` | [`CreateOfficerRequest`](#createofficerrequest) → `200` with `OfficerDto`, or `400 { message }` |
| PUT | `/api/admin/officers/{id}` | `{ "fullName": "", "department": "", "role": "" }` → `200 { message }` or `404` |
| POST | `/api/admin/officers/{id}/reset-password` | `{ "newPassword": "string (min 6)" }` → `200 { message }` or `404` |
| PATCH | `/api/admin/officers/{id}/suspend` | → `200 { message }` or `404` (sets `Status = "Suspended"`) |
| PATCH | `/api/admin/officers/{id}/activate` | → `200 { message }` or `404` (sets `Status = "Active"`) |

`OfficerDetailsDto`: `{ id, name, email, role, department, status }`.

### `CreateOfficerRequest`
```json
{ "fullName": "", "email": "", "password": "", "department": "", "role": "" }
```
`role` and `department` are free-form strings - only the web UI's dropdowns constrain them. Because role-gated endpoints compare against these exact strings, a typo here (e.g. `Finance officer`) silently locks that officer out of finance endpoints. Email and status can't be changed through `PUT`.

---

## Services / Eligibility - `ServicesController`, `api/services`

**Auth: None** on every action.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/services` | → `ServiceProcedure[]` (excludes `Retired`; includes documents + fees, **not** eligibility rules). Cached, cleared on any catalog write |
| GET | `/api/services/{id}` | → `ServiceProcedure` with rules, documents and fees, or `404`. Cached, cleared on any catalog write |
| POST | `/api/services` | `ServiceProcedure` → `201`, or `500` |
| PUT | `/api/services/{id}` | `ServiceProcedure` (only `serviceId`/`name`/`category`/`status` applied) → `200` or `404` |
| DELETE | `/api/services/{id}` | → `204` or `404` - **soft delete**, sets `Status = "Retired"` |
| PUT | `/api/services/{id}/eligibility-rules` | `EligibilityRule[]` (full replace) → `ServiceProcedure` or `404` |
| PUT | `/api/services/{id}/documents` | `DocumentRequirement[]` (diffed by `id`; `id: 0` = new) → `ServiceProcedure` or `404` |
| DELETE | `/api/services/documents/{documentId}` | → `204` or `404` |
| PUT | `/api/services/{id}/fees` | `FeeSchedule[]` (diffed like documents) → `ServiceProcedure` or `404` |
| DELETE | `/api/services/fees/{feeId}` | → `204` or `404` |
| PUT | `/api/services/{id}/workflow` | `{ "totalStages": 2, "workflowDepartments": ["Police Department", "..."] }` → `ServiceProcedure` or `404` |
| GET | `/api/services/{id}/stage/{stageNumber}` | → [stage details](#stage-details) or `404` |
| POST | `/api/services/eligibility-score` | [`EligibilityRequestDto`](#eligibilityrequestdto--eligibilityscoreresultdto) → `EligibilityScoreResultDto` or `404` |

### `ServiceProcedure` entity
```json
{ "id": 0, "serviceId": "GSN-SRV-001", "name": "", "category": "", "status": "Draft | Active | Retired",
  "totalStages": 1, "workflowDepartments": "[\"Police Department\"]",
  "eligibilityRules": [], "documentRequirements": [], "feeSchedules": [] }
```
- `serviceId` is **server-generated** on create (highest `GSN-SRV-NNN` + 1, retired rows included); whatever you send is overwritten.
- `category` must be one of the categories in `web/src/constants/departments.ts` (`Immigration`, `Transport`, `Police`, `Civil`, `Public Administration`) for department scoping and routing to work. The backend doesn't validate it; `ApplicationsController` maps it to a department name, with `Commerce` also mapping to `Divisional Secretariat`.
- `workflowDepartments` is stored as a **JSON-encoded string**, not an array, on the entity.

### `EligibilityRule`
```json
{ "id": 0, "serviceProcedureId": 0, "field": "Age | Citizenship", "operator": ">= | == | <= | !=", "value": "", "isStrict": true }
```
The `eligibility-score` endpoint only evaluates `Age` (`>=`, `==`) and `Citizenship` (`==`); any other field always fails. `isStrict` is stored but not read. (Agent 2's `CheckEligibilityRulesTool` is a separate evaluator - see [Agents](#agentic-ai-endpoints).)

### `DocumentRequirement` / `FeeSchedule`
```json
{ "id": 0, "serviceProcedureId": 0, "documentName": "", "description": "", "isMandatory": true }
{ "id": 0, "serviceProcedureId": 0, "feeType": "", "amount": 0, "effectiveDate": "2026-01-01T00:00:00Z" }
```

### Stage details
```json
{ "serviceId": 0, "serviceCode": "GSN-SRV-001", "serviceName": "", "stageNumber": 1,
  "stageDepartment": "Police Department", "stageDescription": "",
  "documentRequirements": [ /* DocumentRequirement-shaped */ ], "feeSchedules": [ /* FeeSchedule-shaped */ ] }
```
Built from the active template for that stage: each `file`/`document`/`documentUpload` field becomes a document requirement (matched by fuzzy name against the catalog's documents), and a `payment` field's `options.amount` becomes the fee. With no template for stage 1, it falls back to the catalog's own documents and fees.

### `EligibilityRequestDto` / `EligibilityScoreResultDto`
```json
// Request
{ "serviceId": 0, "citizenProfile": { "age": 0, "citizenship": "", "monthlyIncome": 0 } }
// Response
{ "matchPercentage": 0.0, "isEligible": true, "missingCriteria": ["Failed requirement: Age >= 18"] }
```
`monthlyIncome` is accepted but never used.

---

## Templates - `TemplateController`, `api/templates`

**Auth: None** on every action. Templates are the per-stage application forms citizens fill in.

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/templates/create` | [`CreateTemplateRequest`](#createtemplaterequest) → `201` with `Template` |
| GET | `/api/templates/all` | → `Template[]` (fields ordered by `orderIndex`, linked `serviceProcedure` included) |
| GET | `/api/templates/{id}` | → `Template` or `404` |
| GET | `/api/templates/by-service/{serviceProcedureId}` | → `Template[]` linked to that service |
| PUT | `/api/templates/update/{id}` | `CreateTemplateRequest` (full replace, fields included) → `Template` or `500` |
| PATCH | `/api/templates/{id}/status` | `{ "status": "Active" \| "Inactive" \| "Draft" }` → `Template` or `400` |
| DELETE | `/api/templates/{id}` | → `204` or `404` |

### `CreateTemplateRequest`
```json
{
  "formName": "string",
  "subTitle": "string | null",
  "lawText": "string | null",
  "serviceProcedureId": 0,
  "department": "Police Department",
  "stageOrder": 1,
  "stageDescription": "string | null",
  "fields": [ { "label": "", "type": "", "options": null, "required": false } ]
}
```
- `serviceProcedureId` may be `null` (unlinked template - `docs/adr/0006-optional-template-service-link.md`).
- `stageOrder` + `department` make the template the form for that stage of a multi-department workflow (`docs/adr/0009-multi-stage-department-workflow.md`). Only `Active` templates are served to citizens.
- `type` is free-form on the backend. The builder (`TemplateBuilder.tsx`) offers `text`, `textarea`, `number`, `select`, `multiselect`, `date`, `file`, `heading`, `paragraph`, `table` and `payment`. The backend treats `heading`/`paragraph` as display-only, `file`/`document`/`documentUpload` as uploads, and `payment` as the stage's fee, where `options` is a JSON string such as `{"amount": 3500, "feeType": "Passport Fee"}`.

---

## Applications (citizen) - `ApplicationsController`, `api/applications`

**Auth: Any token** on every action, but each action also requires a `nicNumber` claim (so only citizen tokens work) and returns `403` without one.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/applications/form/{serviceProcedureId}?stage=1` | → `{ template, stage, totalStages, workflowDepartments, department: { name, email } }` or `404` |
| GET | `/api/applications/stages/{serviceProcedureId}` | → `{ serviceId, serviceName, totalStages, workflowDepartments, stageForms: [...] }` |
| POST | `/api/applications/documents` | *multipart*: `file`, `fieldLabel` → `{ id, fileName, contentType, sizeBytes }` |
| POST | `/api/applications/submit` | [`SubmitApplicationRequest`](#submitapplicationrequest) → [submitted](#submit-responses) or [payment required](#submit-responses), `400`, `404` |
| POST | `/api/applications/submit-stage` | `{ applicationId, templateId, answers, documents }` → stage submitted or payment required |
| POST | `/api/applications/{applicationId}/finalize` | → submitted, or `402` with payment required |

`form` returns the active template for the requested stage, falling back to the lowest stage. `department.email` is the email of the earliest-created active `Department Admin` in that department.

### Document upload
PDF, JPEG or PNG only, max 10 MB. The type is detected **from the file's bytes**, not the client's `Content-Type`. The upload is stored in `SubmissionDocuments` (as `bytea`) unattached; its `id` goes into `documents` on submit, which attaches it. Documents that belong to another NIC, or are already attached, fail the submit with `400`.

### `SubmitApplicationRequest`
```json
{
  "serviceProcedureId": 0,
  "templateId": "guid | null",
  "answers": { "Full name": "..." },
  "documents": { "Birth certificate": "<upload id>" }
}
```

What `submit` does, in order:

1. Checks that all required non-display fields of the template are answered (`400 { message, missingFields }`).
2. Overwrites the `Presented by` and `Email` answers server-side with the department and its admin email, so the client can't reroute the application.
3. Runs **Agent 4 (Validation & Safety)**. Its checks are:
   - schema and required documents
   - a prompt-injection keyword filter
   - age 16-125, derived from the NIC (falling back to an `age` answer, then to 25)
   - a duplicate check (same NIC + service with an application not `Completed`/`Rejected`)
   - a non-negative fee

   On failure it returns `400 { message: "Application safety validation failed.", errors: [...], summary }`, and **nothing is saved**. The duplicate check also consults a static in-memory registry that's filled on every successful submit and never cleared. Within one API process, a citizen can't apply for the same service twice, even after the first application completes; a restart clears it.
4. Saves the `ApplicationSubmission` and attaches documents.
5. Handles the fee if the stage's template has a `payment` field (or, for a single-stage service without a template, the catalog fee from `CalculateFeeTool`):
   - An uploaded document under the payment field's label → a `Payment` with `Method: "Bank Deposit"`, `Status: "PendingVerification"`, and `manualSlipUrl` pointing to the document.
   - An answer of `"Online Ref: <ref>"` → a `Payment` with `Method: "Online"`, `Status: "Paid"`. Any other non-empty answer → `Bank Deposit`, `PendingVerification`.
   - Neither → responds with **payment required** and does *not* create a verification task.
6. Otherwise creates a `VerificationTask` for the stage's department, and saves Agent 4's compliance checks as `ComplianceCheck` rows on it.

### Submit responses
```json
// Submitted
{ "applicationId": 12, "taskId": 40, "referenceNumber": "APP-12", "serviceName": "", "paymentRequired": false }
// Payment required (200 from submit, 402 from finalize)
{ "applicationId": 12, "referenceNumber": "APP-12", "serviceName": "", "paymentRequired": true,
  "message": "Pay the service fee to submit your application.",
  "amount": 3500, "totalFee": 3500, "amountPaid": 0, "currency": "LKR",
  "feeItems": [ { "feeType": "Passport Fee", "amount": 3500 } ], "userEmail": "" }
```

`finalize` is idempotent: if a task already exists it returns it. Otherwise it creates the task once `Paid` payments cover the stage fee, **or** an `Active`/`Completed` installment plan covering the fee has at least one paid installment.

`submit-stage` submits the form for the next stage of a multi-department service. It runs Agent 4, merges answers into the submission as `"[Stage N] <label>"` keys, moves `CurrentStage`/`CurrentDepartment` to the template's, and creates a new verification task for that department. It then applies the same payment handling as `submit`. **Note:** the task is created *before* the payment check, so a stage that returns "payment required" is already in the officer queue.

---

## Verification - `VerificationController`, `api/verification`

**Auth:** `my-applications` = any token. `seed` = none (`[AllowAnonymous]`). Everything else = **`OfficerRoles`**. "Current officer" in audit rows is `"<email> (<department>)"` from the token.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/verification/my-applications` | Citizen: their tasks with service, stage, amount and latest installment plan summary. Read-only; cached per citizen and cleared on any change to their data |
| GET | `/api/verification/tasks/pending?page=&pageSize=&search=` | → queue rows with `Status` `Pending`/`Revised`/`Revision Requested`, department-scoped, newest first. [Paged](#paging) |
| GET | `/api/verification/tasks/verified?page=&pageSize=&search=&status=` | → decided or reviewed queue rows, department-scoped. `status=Rejected` also includes `Suspended`. [Paged](#paging) |
| GET | `/api/verification/tasks/summary` | → `{ pending, approved, rejected, suspended, verified }` counts, department-scoped |
| GET | `/api/verification/tasks/{id}` | → [task detail](#task-detail), or `403` if it belongs to another department |
| GET | `/api/verification/documents/{documentId}/content` | → the uploaded file's bytes (inline, `nosniff`) |
| GET | `/api/verification/tasks/{id}/agent-draft` | → stored Agent 2 + 3 draft, or `404` if not generated yet |
| POST | `/api/verification/tasks/{id}/agent-draft` | Runs Agent 2 then Agent 3 on the application, stores and returns the draft |
| GET | `/api/verification/stats` | → [`OfficerStatsDto`](#officerstatsdto) |
| POST | `/api/verification/tasks` | `{ applicationId, citizenNic?, department?, stageNumber }` → `VerificationTask` |
| GET | `/api/verification/audit-logs?applicationId=X` | → `AuditLog[]`, newest first |
| GET | `/api/verification/audit-logs/all?page=&pageSize=&search=&action=&applicationIds=` | → `AuditLog[]`, newest first. `action` is `DELETED`, `APPROVED` or `REJECTED`; `applicationIds` is comma separated. [Paged](#paging) |
| GET | `/api/verification/audit-logs/summary` | → `{ total, deleted, approved, rejected }` counts |
| PUT | `/api/verification/tasks/{id}/decision` | [`VerificationDecisionRequest`](#verificationdecisionrequest) → `200`, `400` or `404` |
| PUT | `/api/verification/tasks/{id}/approve-stage` | `{ "notes": "" }` → `{ currentStage, maxStages, status, currentDepartment }` |
| POST | `/api/verification/tasks/bulk-verify` | [`BulkVerifyRequest`](#bulkverifyrequest) → `200` or `400` |
| DELETE | `/api/verification/tasks/{id}?reason=` | → `{ success, message }` - removes from queue, audit-logged |
| POST | `/api/verification/tasks/{id}/delete` | `{ "reason": "" }` → same as above (for clients that can't send a DELETE body) |
| DELETE | `/api/verification/applications/{applicationId}?reason=` | → deletes the application's task, or marks the submission `Deleted`; audit-logged |
| GET / POST | `/api/verification/rejection-reasons` | → `RejectionReason[]` / create one `{ code, description }` |
| PUT / DELETE | `/api/verification/rejection-reasons/{id}` | update → `200` / delete → `204` |
| GET | `/api/verification/seed` | Inserts 5 random `Pending` tasks with fake application IDs - **dev only, unauthenticated** |

### Queue row
```json
{ "id": 40, "applicationId": 12, "status": "Pending", "createdDate": "", "currentStage": 1, "maxStages": 2,
  "department": "Police Department", "stageNumber": 1, "referenceNumber": "APP-12",
  "citizenNic": "", "citizenName": "", "serviceName": "", "category": "" }
```

### Task detail
```json
{ "task": { /* queue row */ }, "submittedAt": "", "userEmail": "",
  "answers": { "Full name": "..." },
  "documents": [ { "id": "guid", "fieldLabel": "", "fileName": "", "contentType": "", "sizeBytes": 0, "uploadedAt": "" } ],
  "payment": { "id": 5, "hasPayment": true, "amount": 3500, "status": "PendingVerification", "isVerified": false,
               "method": "Bank Deposit", "slipUrl": "/api/verification/documents/<guid>/content", "paidDate": null } }
```
`payment` is `null` unless the stage's template has a `payment` field (or it's a single-stage application with a payment). If the fee is due but unpaid, `payment` has `id: null, method: "Unpaid", status: "Pending"`.

### `VerificationDecisionRequest`
```json
{ "status": "Approved | Rejected | Revised", "comments": "string | null", "rejectionReasonId": 0 }
```
Writes an `OfficerReview` and an `AuditLog` in the same transaction. **Approval lock:** if the task's stage template has a `payment` field, `Approved` is refused with `400` until the latest payment for the application is `Paid`. That means a Finance Officer has to verify it first. `approve-stage` has the same lock.

### `approve-stage`
This action advances a multi-stage application:
- If more stages remain, it increments the stage and moves the task to the next stage template's department with `Status: "Pending"` and submission `StageStatus: "StageApproved"`. If there's no template for the next stage, the task stays `Pending` and the submission becomes `AwaitingFeePayment`.
- On the last stage, the task becomes `Approved` and the submission becomes `Completed`.
- It writes an audit row and emails the citizen via SMTP (best effort).

### `BulkVerifyRequest`
```json
{ "taskIds": [1, 2, 3], "status": "Approved | Rejected | Revised", "comments": "string | null" }
```
Applies the decision to all IDs in one transaction and **silently skips unknown IDs**. It does **not** apply the payment approval lock.

### `OfficerStatsDto`
```json
{ "reviewedToday": 0, "reviewedYesterday": 0, "approvedThisMonth": 0, "approvalRate": 66.7 }
```
`approvalRate` is `null` when the officer has no approve/reject decisions yet.

---

## Payments - `PaymentsController`, `api/payments`

Amounts are in `LKR`. `Payment.status` is one of `Pending`, `PendingVerification`, `Paid`, `Failed`.

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/payments/manual` | Any token | `{ applicationId, amount, userEmail, manualSlipUrl }` → `201 Payment` (`PendingVerification`) |
| GET | `/api/payments/{id}` | Any token | → `Payment` or `404` |
| GET | `/api/payments/mine` | Any token | → caller's payments (matched by `email` claim), each with a `department` field. If the caller has none, it currently returns every payment |
| GET | `/api/payments/{id}/ledger` | Any token | → payment with refund ledger |
| POST | `/api/payments/checkout` | Any token | `{ applicationId, amount, userEmail }` → `{ paymentId, checkoutUrl }` (Stripe Checkout) |
| GET | `/api/payments/{id}/confirm` | Any token | → polls Stripe; marks `Paid` if the session is paid |
| GET | `/api/payments/pending-slips` | FinanceRoles | → `PendingVerification` payments with citizen/service details, department-scoped |
| GET | `/api/payments/department-payments` | FinanceRoles | → all payments with citizen/service details, department-scoped |
| POST | `/api/payments/{id}/verify` | FinanceRoles | `{ "approved": true, "note": "" }` → `Payment`; `403` if other department |
| PUT | `/api/payments/{id}/status` | FinanceRoles | `{ "status": "Paid", "note": "" }` → `Payment`; `403` if other department |

- `verify` with `approved: true` sets `Paid` and `paidDate`, and sets the submission's `StageStatus` to `Completed`. With `approved: false` it sets `Failed`. Both write an audit row and send a payment-status email.
- `status` normalises `paid`/`verified` → `Paid`, `failed`/`rejected` → `Failed`, and `pending`/`pendingverification` → `PendingVerification`. Any other string is stored as-is.
- Stripe has **no webhook**. The client calls `confirm` after the checkout page closes, and Stripe's success/cancel URLs are `https://example.com/...` placeholders (`docs/adr/0011-stripe-checkout-without-webhooks.md`).

---

## Installment plans - `InstallmentPlansController`, `api`

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| PUT | `/api/payments/{id}/installment-plan` | Any token | `{ "numberOfInstallments": 3, "intervalDays": 30 }` → plan |
| GET | `/api/installment-plans/{id}` | Any token | → plan with installments |
| POST | `/api/installment-plans/{id}/cancel` | Any token | → plan (`Cancelled`) |
| GET | `/api/installment-plans/bank-details` | Any token | → `{ accountName, bankName, branch, accountNumber }` from `BANK_*` env vars |
| POST | `/api/installment-plans/installments/{installmentId}/checkout` | Any token + owner | → `{ checkoutUrl }` (Stripe, this installment's amount) |
| POST | `/api/installment-plans/installments/{installmentId}/confirm` | Any token + owner | → installment (`Paid` if Stripe says paid, else `400`) |
| POST | `/api/installment-plans/installments/{installmentId}/bank-transfer` | Any token + owner | *multipart* `receipt` (PDF/JPEG/PNG ≤ 10 MB) → installment (`PendingVerification`) |
| POST | `/api/installment-plans/installments/{installmentId}/pay` | StaffRoles | → installment (`Paid`) |
| POST | `/api/installment-plans/installments/{installmentId}/reject-transfer` | StaffRoles | → installment (payable again) |
| GET | `/api/installment-plans/installments/{installmentId}/receipt` | StaffRoles | → receipt bytes, inline |

"Owner" means the installment's application belongs to the caller's `nicNumber` or `email`. Otherwise the endpoint returns `404`.

Rules:
- A plan needs at least 2 installments.
- A payment can have only one active plan.
- A plan can't be cancelled once any installment is paid.
- When every installment is paid, the plan becomes `Completed` and its payment `Paid`.
- Installment status is `Pending`, `Overdue`, `PendingVerification` or `Paid`.

**Background job (`InstallmentMonitorService`)** runs hourly, starting 30 seconds after startup:
- It sends one reminder (in-app `CitizenNotification` + email) when an unpaid installment is due within 3 days.
- When an installment passes its due date unpaid, it **cancels the plan, the application's verification tasks and the application**.
- Bank transfers awaiting verification aren't treated as unpaid.

---

## Refunds - `RefundsController`, `api/refunds`

**Auth:** `POST /api/refunds`, `GET /mine`, `GET /{id}` and `GET /{id}/status` take any token. The list and the approve/reject/process/complete actions need a finance role (`Finance Officer`, `Department Admin`, `Admin`, `System Admin`).

**Department scoping:** when a refund is created, the department of its payment's application (`ApplicationSubmissions.CurrentDepartment`) is saved on it as `departmentName`, and it stays with that department even if the application moves on. Refunds created before this column existed are backfilled at startup. A finance officer only sees and acts on refunds for their own `department` claim; any other refund returns `404`. `Admin` / `System Admin` see all refunds. `GET /{id}` and `/{id}/status` also return `404` unless the caller requested the refund or is finance staff of its department.

**Rules on create:** the payment must belong to the caller (by `email` claim, otherwise `404`), be `Paid`, and have been paid within the last 7 days (`RefundService.RefundWindowDays`). A payment with a pending, approved, processing or completed refund cannot get another one; after a rejected or failed refund the citizen can ask again. The mobile app hides those payments from its refund list. The refund amount is always the full payment amount - `refundAmount` in the body is ignored.

**Emails to the citizen:** HTML emails from `RefundEmailTemplate`: "Refund Request Received" when the request is created, "Refund Request Rejected" (with the officer's note, and whether the citizen can still ask again inside the 7-day window) when it is rejected, and "Refund Successful" when it is completed. Approve and process still send the short plain-text status emails.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/refunds?status=Pending` | Finance → the caller's department's refunds, optionally filtered |
| POST | `/api/refunds` | `{ "paymentId": 0, "reason": "" }` → `201` refund |
| GET | `/api/refunds/{id}` | → refund |
| GET | `/api/refunds/{id}/status` | → `{ id, status }` |
| GET | `/api/refunds/mine` | → caller's refunds (by `email` claim) |
| POST | `/api/refunds/{id}/approve` | Finance, `{ "note": "" }` → refund |
| POST | `/api/refunds/{id}/reject` | Finance, `{ "note": "" }` → refund |
| POST | `/api/refunds/{id}/process` | Finance, `{ "transactionRef": "" }` → refund |
| POST | `/api/refunds/{id}/complete` | Finance → refund |

Status lifecycle: `Pending → Approved | Rejected`, then `Approved → Processing → Completed` (`Failed` also exists). `create` and the decisions record the email via `User.Identity.Name`. That name isn't mapped from the `email` claim by default, so these fields can come out as `unknown@user` / `unknown@officer`.

---

## Notifications - `NotificationsController`, `api/notifications`

**Auth: Any token.** A notification is "mine" if its `citizenNic` matches the `nicNumber` claim, or its `userEmail` matches the `email` claim.

| Method | Path | Response |
|---|---|---|
| GET | `/api/notifications/mine` | → latest 100 `CitizenNotification`s, newest first |
| POST | `/api/notifications/{id}/read` | → notification with `readAt` set |
| POST | `/api/notifications/read-all` | → `204` |

---

## Audit logs - `AuditLogsController`, `api/audit-logs`

**Auth: Any token.**

| Method | Path | Response |
|---|---|---|
| GET | `/api/audit-logs?applicationId=X` | → logs for one application |
| GET | `/api/audit-logs/{id}` | → one log |
| GET | `/api/audit-logs/by-performer?email=` | → logs whose `performedBy` equals `email` exactly |
| GET | `/api/audit-logs/by-action?action=` | → logs with that exact `action` |
| GET | `/api/audit-logs/recent?page=1&pageSize=20` | → `{ page, pageSize, totalCount, totalPages, items }` (pageSize ≤ 100) |

Officer actions record `performedBy` as `"<email> (<department>)"`, so `by-performer` with a bare email won't match those rows.

---

## Analytics & anomalies - `AnalyticsController` (`api`), `AnomalyDetectionController` (`api/anomalies`)

**Auth: Any token.**

| Method | Path | Response |
|---|---|---|
| GET | `/api/analytics/daily?date=` | → daily summary |
| GET | `/api/analytics/weekly?weekStart=` | → weekly summary |
| GET | `/api/analytics/monthly?year=&month=` | → monthly summary |
| GET | `/api/analytics/yearly?year=` | → yearly summary |
| GET | `/api/analytics/approval-likelihood/{serviceProcedureId}` | → historical approval likelihood |
| POST / GET | `/api/report-snapshots` | save `{ title, period, dataJson }` / list snapshots |
| DELETE | `/api/report-snapshots/{id}` | → `204` or `404` |
| POST | `/api/analytics/anomaly-detection` | → `{ newFlagsCount, flags }` |
| GET | `/api/analytics/anomaly-detection/open` | → open flags |
| POST | `/api/analytics/anomaly-detection/{id}/resolve?status=` | → flag (status **not** validated) |
| POST | `/api/anomalies/scan` | → new flags |
| GET | `/api/anomalies/open` | → open flags |
| POST | `/api/anomalies/{id}/resolve` | `{ "status": "Reviewed" \| "Dismissed" }` → flag, `400` for any other status |

The anomaly scan is rule-based. `HighAmount` flags any `Paid` payment of LKR 100,000 or more, and `RapidRefund` flags refunds requested soon after payment. The two controllers expose the same service; the `api/anomalies` routes validate the resolve status and the `api/analytics/...` routes don't.

---

## Agentic AI endpoints

The four agents live in `agentic-ai/` and run **in-process** inside the API (project reference, not a separate service). They are **deterministic - no LLM is called** (`docs/adr/0008-deterministic-in-process-agents.md`). In normal use, Agent 4 runs inside `applications/submit`, and Agents 2 + 3 run from the officer's `verification/tasks/{id}/agent-draft`. The endpoints below expose each agent directly.

**Auth: None** on all of them.

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/IntakeAgent/ask` | `{ "text": "I need to renew my passport" }` → `{ recommendedService, requiredDocuments, stepByStepPlan, retrievedContextSnippets }` |
| POST | `/api/EligibilityAgent/evaluate` | [`EligibilityAgentQueryDto`](#eligibilityagentquerydto) → eligibility + missing-documents plan |
| POST | `/api/EligibilityAgent/orchestrate` | same body → `WorkflowExecutionState` after the Agent 2 stage |
| POST | `/api/ActionAgent/draft` | [`ActionAgentQueryDto`](#actionagentquerydto) → pre-filled draft, fee, proposed appointment |
| POST | `/api/ActionAgent/orchestrate` | same body → `WorkflowExecutionState` after the Agent 3 stage |

- **Agent 1 (Intake & Planning)** embeds the text, takes the top 3 vector matches, and accepts one only if it shares a keyword with the request. Otherwise it returns `recommendedService: "Service Not Found"`.
- **Agent 2 (Eligibility & Documents)** evaluates the catalog's eligibility rules (`CheckEligibilityRulesTool`) and required documents (`GetDocumentRequirementsTool`), plus retrieved policy chunks.
- **Agent 3 (Action/Tool)** calls `PrefillApplicationTool`, `CalculateFeeTool` and `FindAppointmentSlotTool` (Mon-Fri 09:00-15:00 SLT, 30-min slots, ≥ 2 working days out). A slot is only a proposal until an officer approves.
- **Agent 4 (Validation & Safety)** is not exposed directly. It runs `SchemaValidatorTool` + `DuplicateCheckTool` from `applications/submit` and `submit-stage`.

### `EligibilityAgentQueryDto`
```json
{ "serviceName": "", "serviceId": 0, "age": 25, "citizenshipStatus": "Sri Lankan", "annualIncome": 0,
  "employmentStatus": "Employed", "providedDocuments": [], "planSummary": null, "applicationId": 0, "citizenNic": null, "stage": null }
```
Missing `age`, `citizenshipStatus` and `employmentStatus` default to `25`, `Sri Lankan` and `Employed`. `orchestrate` defaults `applicationId` to `1001` and `citizenNic` to a placeholder.

### `ActionAgentQueryDto`
```json
{ "applicationId": 0, "serviceProcedureId": 1, "serviceName": "", "citizenNic": "", "fullName": "", "email": "",
  "age": 0, "citizenshipStatus": "Sri Lankan", "annualIncome": 0, "employmentStatus": "", "providedDocuments": [],
  "additionalAttributes": {}, "preferredAppointmentDateUtc": null, "expressProcessing": false,
  "planSummary": null, "stage": null, "eligibility": null }
```
`serviceProcedureId` and `serviceName` are required (`400` otherwise). If `eligibility` is omitted, Agent 2 runs first.

---

## RAG knowledge base - `RagSetupController`, `api/RagSetup`

Manages the `KnowledgeChunks` table in the **separate pgvector database** (`ConnectionStrings:VectorDb`). **Auth: None** - anyone who can reach the API can wipe or rewrite the knowledge base.

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/RagSetup/seed` | Replaces the catalog chunks (one per live service: documents + fees). Leaves `ActionTool:*` chunks alone |
| POST | `/api/RagSetup/seed-action-agent` | Replaces the `ActionTool:*` chunks: fee schedules, active linked templates, appointment policy |
| POST | `/api/RagSetup/upload-policy` | *multipart*: `serviceProcedureId`, `documentTitle`, `policyText` and/or `file` → chunks it (paragraphs, ≤ 1000 chars) under `Service:{id}:{serviceId}` |
| GET | `/api/RagSetup/service-knowledge/{serviceProcedureId}` | → chunks for that service |
| DELETE | `/api/RagSetup/service-knowledge/{serviceProcedureId}` | → removes that service's `Service:*` chunks |
| POST | `/api/RagSetup/ingest-local-documents` | Ingests `backend/src/Data/KnowledgeDocuments/*.md` into the matching service |

`ingest-local-documents` maps files to hardcoded service codes by filename (`passport` → `GSN-IMM-001`, `driving` → `GSN-DMT-002`, `police` → `GSN-POL-003`, `business` → `GSN-COM-004`, `death` → `GSN-CIV-005`). Files whose service code doesn't exist in the catalog are skipped silently.

**Re-seed after catalog changes:** chunks are a snapshot. Adding a service or changing fees isn't reflected in agent answers until `seed` / `seed-action-agent` are called again. The same applies if the embedding algorithm in `LocalEmbeddingService` changes.

---

## Performance behaviour

Added 2026-09-29 for 1000+ daily users. The reasoning is in `docs/performance-and-redis.md`; the decisions are ADR-0012 to ADR-0014.

### Paging

`tasks/pending`, `tasks/verified` and `audit-logs/all` accept:

| Parameter | Meaning |
|---|---|
| `page` | 1-based page. **Its presence switches the response to the envelope below** |
| `pageSize` | Default 25, maximum 100 |
| `search` | Tasks: application id (`APP-123` or `123`) or part of a NIC. Audit logs: also the action, officer and remarks |

With `page`:

```json
{ "items": [ /* rows */ ], "total": 312, "page": 2, "pageSize": 25, "totalPages": 13 }
```

Without `page`, the response is a plain array (the shape older clients expect), limited to the newest 200 rows. Use the `summary` endpoints for counts instead of counting rows.

### Realtime hub - `/hubs/applications`

SignalR, `[Authorize]`. Send the JWT as `?access_token=` (WebSockets cannot set headers); `accessTokenFactory` in the SignalR clients does this. Browsers must connect with `withCredentials: false`, because CORS allows any origin.

| Message | Sent to | Payload | Client should |
|---|---|---|---|
| `applicationsChanged` | The citizen (every connection with that `nicNumber`) | none | Refetch `my-applications` and notifications |
| `refundUpdated` | The citizen | refund ids | Refetch their refunds |
| `queueUpdated` | All staff (tokens without `nicNumber`) | none | Refetch the page of the queue/audit list on screen, debounced |

Messages carry no data, only "something changed". They are sent after the change is committed and after the cache is cleared, so a refetch always sees the new state. Writes made with raw SQL or `ExecuteUpdate` do not trigger them (ADR-0012).

### Rate limiting

Fixed window per caller: citizen NIC, else officer/admin email, else IP. Default **120 requests per minute** (`RATE_LIMIT_PER_MINUTE`). Over the limit the API returns `429 Too Many Requests` with no body. Hub connections are not counted.

### Caching

| Response | Cached for | Cleared by |
|---|---|---|
| `GET /api/services`, `GET /api/services/{id}` | 10 min (30 s in process memory) | Any write to services, templates, form fields, fees, eligibility rules, documents or departments |
| `GET /api/verification/my-applications` | 5 min (10 s in process memory) | Any write to that citizen's tasks, submission, payments, installment plans, installments, notifications or refunds |

With `REDIS_URL` set the cache is shared by all API instances; without it, each instance caches in its own memory.

### Compression

Responses are compressed with Brotli or gzip (fastest level) when the request sends `Accept-Encoding`. The applications list shrinks by about 60%.

---

## Other

`GET /WeatherForecast` (`[Authorize]`) is the leftover ASP.NET template controller and isn't used by either client.
