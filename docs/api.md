# API Reference

Base URL: `http://localhost:5119` locally, `https://gsn-api-dpa2agb6c5h7gyar.southeastasia-01.azurewebsites.net` when hosted (the API uses port 5119 unless `ASPNETCORE_HTTP_PORTS`/`ASPNETCORE_URLS` is set, as in Docker; the web dashboard reads `BASE_URL` - see `docs/diagrams/system-architecture.md`). Swagger UI is available at `/swagger` when `ASPNETCORE_ENVIRONMENT=Development`.

All request/response bodies are JSON unless marked *multipart*. ASP.NET Core's default `System.Text.Json` camelCases property names in responses (e.g. the C# `FormName` property serializes as `"formName"`), which is reflected below.

Reflects the current `backend/src/Controllers/`.

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
| **None** | Callable with no token at all | `AuthController` (except `logout`), `AdminController`, `DepartmentsController`, `ServicesController`, `TemplateController`, `IntakeAgentController`, `EligibilityAgentController`, `ActionAgentController`, `ValidationAgentController`, `RagSetupController`, `GET /api/verification/seed`, the `GET` actions of `CollectionSlotsController`, `POST /api/applications/{id}/raise-concern`, `POST /api/applications/{id}/submit-revision` |
| **Any token** | `[Authorize]` - any valid, non-revoked token (citizen, officer or admin) | `ApplicationsController`, `NotificationsController`, `AuditLogsController`, `AnalyticsController`, `AnomalyDetectionController`, the citizen side of `RefundsController`, most of `PaymentsController` and `InstallmentPlansController`, `GET /api/verification/my-applications` |
| **Role** | `[Authorize(Roles = "...")]` - checked against the token's `ClaimTypes.Role` claim | Every other `VerificationController` action, finance actions in `PaymentsController` and `RefundsController`, staff actions in `InstallmentPlansController`, writes in `CollectionSlotsController` |

The role lists used are:

- `OfficerRoles` (Verification): `Verifying Officer, Department Admin, Auditor, Finance Officer, Officer, Admin, System Admin`
- `FinanceRoles` (Payments, Refunds): `Finance Officer, Department Admin, Admin, System Admin`
- `StaffRoles` (Installments): `Finance Officer, Department Admin, Verifying Officer, Officer, Admin, System Admin`
- Collection slot writes: `Admin, System Admin, Officer, SuperAdmin, Department Admin, DepartmentAdmin, Verifying Officer, Finance Officer`

Citizens' tokens carry role `User`, so they are excluded from all of these.

**Department scoping** is enforced server-side for the verification queue, finance payment views and refunds: the caller's `department` claim filters results, and single-item reads/writes for another department return `403`. Callers with role `Admin` or containing `System Admin` (or with no `department` claim) see everything. Everywhere else - officers, departments, service catalog, templates, collection slots - scoping is still client-side only; see `docs/adr/0004-client-side-department-scoping.md`.

**Things "Any token" does not protect:** analytics, anomaly resolution and all audit-log reads are callable by a *citizen* token too - there's no role check on them. Likewise `GET /api/payments/{id}`, `GET /api/payments/{id}/ledger`, `GET /api/installment-plans/{id}` and `POST /api/installment-plans/{id}/cancel` don't check that the payment/plan belongs to the caller.

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
{ "fullName": "string ([PersonName])", "email": "string ([Email])", "password": "string ([StrongPassword])", "nicNumber": "string ([SriLankaNic])" }
```
Creates a `User` row (citizen). A body that breaks the [validation rules](#validation) gets the usual `400`. A taken email or NIC fails with `{ success: false, errorMessage: "User with this email already exists." }` or `"An account with this NIC number already exists."`, still `200 OK`, not `409`.

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
| PUT | `/api/admin/officers/{id}` | `{ "fullName": "", "department": "", "role": "" }` (same rules as create) → `200 { message }` or `404` |
| POST | `/api/admin/officers/{id}/reset-password` | `{ "newPassword": "string ([StrongPassword])" }` → `200 { message }` or `404` |
| PATCH | `/api/admin/officers/{id}/suspend` | → `200 { message }` or `404` (sets `Status = "Suspended"`) |
| PATCH | `/api/admin/officers/{id}/activate` | → `200 { message }` or `404` (sets `Status = "Active"`) |

`OfficerDetailsDto`: `{ id, name, email, role, department, status }`.

### `CreateOfficerRequest`
```json
{ "fullName": "", "email": "", "password": "", "department": "", "role": "" }
```
`role` must be one of `Verifying Officer`, `Finance Officer`, `Auditor` or `Department Admin` (`[AllowedValues]`), so a typo can no longer lock an officer out of the role-gated endpoints. `department` is still a free-form string (at most 150 characters) and has to match the department names used elsewhere for scoping to work. Email and status can't be changed through `PUT`.

---

## Departments - `DepartmentsController`, `api/departments`

**Auth: None** on every action. Used by the System Admin's department management pages and by every page that lists departments.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/departments?search=&status=` | → departments with officer counts (see below). `status=all` or empty returns every status |
| GET | `/api/departments/next-code` | → `{ nextCode }`, the next free `DEP-NNN` code |
| GET | `/api/departments/{id}` | → `Department` or `404` |
| POST | `/api/departments` | `DepartmentCreateDto` → `201 Department`, or `400 { message }` |
| PUT | `/api/departments/{id}` | `DepartmentUpdateDto` → `Department`, `400` or `404` |
| PATCH | `/api/departments/{id}/status` | `{ "status": "Active" \| "Inactive" }` (empty toggles) → `{ id, status }`, `400` or `404` |
| DELETE | `/api/departments/{id}` | → `{ message }`, or `400` while any officer is assigned to it |

```json
{ "departmentCode": "DEP-004 (optional)", "name": "3-150 chars, required on create", "category": "", "logoUrl": "https://... or data: URL",
  "contactNumber": "0112345678 or a hotline such as 1919", "email": "", "website": "", "address": "", "description": "", "status": "Active | Inactive" }
```

- The list adds `officerCount`, `verifyingOfficerCount`, `financeOfficerCount` and `hasRequiredOfficers` to each department. Officers are matched to a department by name, case-insensitively, and suspended or inactive officers aren't counted.
- **Two-officer rule:** a department can only be created as, updated to, or toggled to `Active` when it has at least one active Verifying Officer (roles `Verifying Officer`, `Verification Officer` or `Officer`) and one active Finance Officer. Otherwise the request fails with `400` naming what's missing. New departments default to `Inactive`.
- Names are unique (case-insensitive). On create, a code that is empty or already taken is replaced with the next generated one; on update, a taken code is a `400`.
- Renaming a department doesn't rename `Officer.Department`, templates or submissions, which store the name as a string.

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
- `category` is one of the thematic categories in `SERVICE_CATEGORIES` (`web/src/constants/departments.ts`): `Personal & Family`, `Transport & Travel`, `Legal & Security`, `Business & Trade`, `Public & Community Services`, `General`. The backend doesn't validate it. `ApplicationsController` maps it to a department: `Personal & Family` → Registration of Persons, `Transport & Travel` → Motor Traffic, `Legal & Security` → Police, the other three → Divisional Secretariat. The old categories (`Immigration`, `Transport`, `Police`, `Civil`, `Public Administration`, `Commerce`) are still mapped for older rows.
- On startup, `Program.cs` rewrites old categories in place: `Identity` and `Transport` → `Transport & Travel`, `Police` → `Legal & Security`, `Commerce` → `Business & Trade`, `Civil` → `Personal & Family`. `Immigration` and `Public Administration` are left alone.
- **Known gap:** department-admin scoping on the web still uses the old categories (`DEPARTMENTS[].category`, for example `Police Department` → `Police`). Once a service has been migrated to a thematic category, a department admin's catalog, eligibility and template screens no longer match it.
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

**Auth: Any token** on every action, but each action also requires a `nicNumber` claim (so only citizen tokens work) and returns `403` without one. The exceptions are `raise-concern` and `submit-revision`, which are `[AllowAnonymous]` and check neither the token nor ownership.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/applications/form/{serviceProcedureId}?stage=1` | → `{ template, stage, totalStages, workflowDepartments, department: { name, email } }` or `404` |
| GET | `/api/applications/stages/{serviceProcedureId}` | → `{ serviceId, serviceName, totalStages, workflowDepartments, stageForms: [...] }` |
| POST | `/api/applications/documents` | *multipart*: `file`, `fieldLabel` → `{ id, fileName, contentType, sizeBytes }` |
| POST | `/api/applications/submit` | [`SubmitApplicationRequest`](#submitapplicationrequest) → [submitted](#submit-responses) or [payment required](#submit-responses), `400`, `404` |
| POST | `/api/applications/submit-stage` | `{ applicationId, templateId, answers, documents }` → stage submitted or payment required |
| POST | `/api/applications/{applicationId}/finalize` | → submitted, or `402` with payment required |
| POST | `/api/applications/save-draft` | `{ applicationId, stageNumber, templateId, answers, documents, paymentReference, paymentMethod }` → `{ message, stage }` |
| GET | `/api/applications/{id}/draft?stage=1` | → `{ hasDraft: true, stage, data }` or `{ hasDraft: false, stage }` |
| POST | `/api/applications/{id}/raise-concern` | `{ subject, message, contactPhone }` → `{ ticketReference, applicationId, department, serviceName, subject, status: "ConcernLogged", message }` |
| POST | `/api/applications/{id}/submit-revision` | `{ notes, documentAttachmentName }` → `{ success, applicationId, message }` or `404` |

`form` returns the active template for the requested stage, falling back to the lowest stage.

**Drafts.** `save-draft` stores the unfinished form of an existing application (the caller's own NIC only) inside `FormDataJson` under the key `"[Draft Stage N]"`. It sets `StageStatus` to `Draft` when that stage has no verification task yet. `draft` reads it back.

**Concerns.** `raise-concern` needs no token and doesn't check that the application belongs to the caller. It only writes an `AuditLog` row (`Citizen Support Concern Raised`) with a `CONCERN-{id}-XXXXXX` ticket reference; nothing notifies the department. `department.email` is the email of the earliest-created active `Department Admin` in that department.

**Revisions.** `submit-revision` is how the citizen answers a "Revised" decision. `notes` is required (5-2000 characters, plain text) and `documentAttachmentName` is optional (up to 255 characters). It:

- sets the application's latest verification task back to `Pending` and the submission's `StageStatus` to `PendingReview`, so it reappears in the officer queue
- writes a `Citizen Revision Submitted` audit row with the notes and file name
- if `documentAttachmentName` is given, links the newest upload with that file name that is unattached or already on this application, labelling it `Revised Document` when it has no label

Like `raise-concern`, it needs no token and doesn't check ownership, so anyone who knows an application id can put it back in the queue. The mobile app calls it and, if it gets a `404` (an API that predates the endpoint), falls back to `raise-concern` with the notes and file name. That fallback only logs a concern; it doesn't put the application back in the queue.

### Document upload
PDF, JPEG or PNG only, max 10 MB. The type is detected **from the file's bytes**, not the client's `Content-Type`. The upload is stored in `SubmissionDocuments` (as `bytea`) unattached; its `id` goes into `documents` on submit, which attaches it. Documents that belong to another NIC, or are already attached, fail the submit with `400`.

### `SubmitApplicationRequest`
```json
{
  "serviceProcedureId": 0,
  "applicationId": "int | null",
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
   - a duplicate check (see below)
   - a non-negative fee
   - when the Groq LLM is on, its consistency flags (see [Agent 4](#agentic-ai-endpoints))

   On failure it returns `400 { message: "Application safety validation failed.", errors: [...], summary }`, and **nothing is saved**.

   **Duplicates are flagged, not blocked.** `ValidationSafetyConfig.BlockDuplicateSubmissions` is `false`, so a duplicate shows up in the compliance checks for the officer but doesn't fail the submit. An application counts as a duplicate when the same NIC has another application for the same service that is not `Completed`, `Rejected`, `Deleted`, `Draft` or `AwaitingFeePayment`. A `PendingReview` application only counts while its verification task is `Pending`, `Revised` or `Revision Requested`. The tool's in-memory registry is now always checked against the database, and an entry is dropped when the database shows no conflict.
4. Saves the `ApplicationSubmission` and attaches documents. It reuses an existing row instead of creating a new one, in this order:
   - the `applicationId` sent in the request, if it belongs to the caller's NIC
   - otherwise the caller's newest application for this service that is `Draft`, `AwaitingFeePayment`, or `PendingReview` with no verification task

   After saving, the caller's other `Draft`/`AwaitingFeePayment` rows for the service, and `PendingReview` rows with no task, are marked `Deleted`.
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
  "documents": [ { "id": "guid", "fieldLabel": "", "fileName": "", "contentType": "", "sizeBytes": 0, "uploadedAt": "",
                   "category": "stage | payment | other" } ],
  "payment": { "id": 5, "hasPayment": true, "amount": 3500, "status": "PendingVerification", "isVerified": false,
               "method": "Bank Deposit", "slipUrl": "/api/verification/documents/<guid>/content", "paidDate": null } }
```
`documents` lists every upload on the application, with a `category` so the workspace can separate the current stage's documents:

- `payment` - the upload referenced by the payment's `manualSlipUrl`, or whose label matches the stage template's payment field or fee type, or whose label or file name contains a payment word (`slip`, `deposit`, `payment`, `receipt`, `transfer`)
- `stage` - everything else on a single-stage application, or when the current stage's template has no file fields, or when the label matches (or partly matches) one of the current stage's file fields
- `other` - uploads from other stages

The current stage is the submission's `CurrentStage`, falling back to the task's stage.

`payment` is filled when the current stage's template has a `payment` field with a fee, or whenever a payment record exists for the application. If the fee is due but unpaid, `payment` has `id: 0, method: "Pending", status: "Pending"`.

### `VerificationDecisionRequest`
```json
{ "status": "Approved | Rejected | Revised", "comments": "string | null", "rejectionReasonId": 0 }
```
Writes an `OfficerReview` and an `AuditLog` in the same transaction. `Revised` (or `Revision Requested`) sets the submission's `StageStatus` to `ActionRequired`; the citizen answers with [`submit-revision`](#applications-citizen---applicationscontroller-apiapplications). **Approval lock:** if the task's stage template has a `payment` field, `Approved` is refused with `400` until the latest payment for the application is `Paid`. That means a Finance Officer has to verify it first. `approve-stage` has the same lock.

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
| POST | `/api/payments/department-pay` | Any token | [`DepartmentPaymentDto`](#department-pay) → payment summary, with a Stripe `checkoutUrl` for `Online` |

- `verify` with `approved: true` sets `Paid` and `paidDate`, and sets the submission's `StageStatus` to `Completed`. With `approved: false` it sets `Failed`. Both write an audit row and send a payment-status email.
- `status` normalises `paid`/`verified` → `Paid`, `failed`/`rejected` → `Failed`, and `pending`/`pendingverification` → `PendingVerification`. Any other string is stored as-is.
- `mine` also returns each payment's `department` (the application's `CurrentDepartment`), so the app can show who will handle a refund.
- Stripe has **no webhook**. The client calls `confirm` after the checkout page closes, and Stripe's success/cancel URLs are `https://example.com/...` placeholders (`docs/adr/0011-stripe-checkout-without-webhooks.md`).

### Department pay

```json
{ "department": "Police Department", "serviceName": "", "amount": 3500, "paymentMethod": "Online | Manual | BankTransfer",
  "applicationId": null, "citizenNic": "", "citizenName": "", "userEmail": "", "manualSlipUrl": "", "notes": "" }
```

The mobile app uses this for stage payments:

- With no `applicationId`, it reuses the caller's newest `Draft` or `AwaitingFeePayment` application for the department's service (updating its department), or creates an `ApplicationSubmission` with `StageStatus: "AwaitingFeePayment"` if there is none.
- `Online` creates a `Pending` payment and starts Stripe Checkout (`502` if Stripe fails).
- `Manual` and `BankTransfer` need a slip (`400` otherwise) and create a `Bank Deposit` payment in `PendingVerification`. The payment links the slip given in `manualSlipUrl` or, failing that, the application's latest upload whose label or file name mentions a slip, deposit or payment.
- The email comes from the token when it has one, and an audit row is written either way.

Response: `{ paymentId, paymentReference, checkoutUrl, applicationId, department, amount, status, method, citizenNic, userEmail, paidDate, createdDate }`.

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

**Emails to the citizen:** HTML emails from `RefundEmailTemplate`: "Refund Request Received" when the request is created, "Refund Request Rejected" (with the officer's note, and whether the citizen can still ask again inside the 7-day window) when it is rejected, and "Refund Successful" when it is completed. Approve still sends a short plain-text status email; process sends none.

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

Status lifecycle: `Pending → Approved | Rejected`, then `Approved → Processing → Completed` (`Failed` also exists). `create` and the decisions record the caller's `email` claim, falling back to `unknown@user` only for a token without one. A reject needs a `note` (`400` otherwise), because the rejection email shows it as the reason.

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

The four agents live in `agentic-ai/` and run **in-process** inside the API (project reference, not a separate service). Each agent first runs its deterministic tools. When `GROQ_API_KEY` is set, it then asks the Groq LLM (`GROQ_MODEL`, default `openai/gpt-oss-120b`) to reason over the tool results and the retrieved policy text. If the key is missing, or the LLM call fails or returns unusable JSON, the agent falls back to its deterministic answer (`docs/adr/0015-groq-llm-over-deterministic-agents.md`).

In normal use, Agent 4 runs inside `applications/submit`, and Agents 2 + 3 run from the officer's `verification/tasks/{id}/agent-draft`. The endpoints below expose each agent directly.

**Auth: None** on all of them.

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/IntakeAgent/ask` | `{ "text": "I need to renew my passport" }` (2-1000 chars) → `{ recommendedService, requiredDocuments, stepByStepPlan, retrievedContextSnippets }` |
| POST | `/api/EligibilityAgent/evaluate` | [`EligibilityAgentQueryDto`](#eligibilityagentquerydto) → eligibility + missing-documents plan |
| POST | `/api/EligibilityAgent/orchestrate` | same body → `WorkflowExecutionState` after the Agent 2 stage |
| POST | `/api/ActionAgent/draft` | [`ActionAgentQueryDto`](#actionagentquerydto) → pre-filled draft, fee, proposed appointment |
| POST | `/api/ActionAgent/orchestrate` | same body → `WorkflowExecutionState` after the Agent 3 stage |
| POST | `/api/ActionAgent/book-appointment` | [`AppointmentBookingRequestDto`](#book-appointment) → booking result or suggested slots |
| POST | `/api/ValidationAgent/validate` | [`ValidateDraftDto`](#validatedraftdto) → `ValidationResult` |
| POST | `/api/ValidationAgent/orchestrate` | same body → `WorkflowExecutionState` after the Agent 4 stage |
| GET | `/api/ValidationAgent/application/{applicationId}/briefing` | → `ValidationResult` for a stored application, or `404` |
| GET | `/api/ValidationAgent/status` | → `{ agentName, version, status, llmConfigured, llmModel, adversarialDefenseActive, blockDuplicateSubmissions, minimumLegalAge, activeFeatures }` |
| GET | `/api/ValidationAgent/evaluation/golden-cases` | → runs 4 built-in cases (valid, bad NIC, missing document, prompt injection) → `{ totalCases, allSafelyHandled, results }` |
| POST | `/api/ValidationAgent/dossier` | `ValidateDraftDto` → `VerificationCaseDossier` |
| POST | `/api/ValidationAgent/decision-order` | `{ applicationId, serviceProcedureId, serviceName, citizenNic, citizenName, calculatedFee, determinationType, officerNotes, attachedDocumentNames }` → `DecisionOrderDraft` |
| POST | `/api/ValidationAgent/remediation-notice` | `{ applicationId, serviceName, citizenNic, citizenName, defects }` → `RemediationNotice` (7-day hold) |

- **Agent 1 (Intake & Planning)** embeds the text and takes the top 8 vector matches. With the LLM, it asks for a plan grounded in those chunks, using the exact service name from the chunk headers and only the fees the context states. It answers `"Service Not Found"` when the context holds nothing relevant and points the citizen to the service catalog or the Divisional Secretariat. Without the LLM, it accepts the first match that shares a keyword with the request. The controller then matches `recommendedService` against the live catalog (by name, loosely) and, on a match, replaces it with the catalog name and merges the catalog's document requirements into `requiredDocuments`.
- **Agent 2 (Eligibility & Documents)** runs `CheckEligibilityRulesTool` and `GetDocumentRequirementsTool` and retrieves policy chunks. The LLM then decides `isEligible`, `matchPercentage`, missing documents and `reasoning`. It is told to audit only the documents required for this service and stage, and to treat an upload as suspicious when its file name suggests something unrelated (a diagram, screenshot, packaging label and so on), even if it was uploaded into the right slot. Any missing, unlabelled or suspicious mandatory document means not eligible. After the LLM answers, a code check removes from `missingDocuments` anything that matches an uploaded document.
- **Agent 3 (Action/Tool)** calls `PrefillApplicationTool`, `CalculateFeeTool` and `FindAppointmentSlotTool` (Mon-Fri 09:00-15:00 SLT, 30-min slots, ≥ 2 working days out). The LLM only rewrites the reasoning and adds officer notes; the draft, fee and slot always come from the tools. The fee is calculated even when eligibility isn't met yet, so the officer always sees it. The stage fee comes from the stage template's `payment` field (`amount` or `feeAmount`, as a number or a string), falling back to the service's catalog fee schedules.
- **Agent 4 (Validation & Safety)** runs `SchemaValidatorTool`, `DuplicateCheckTool`, a fee check and a PII filter that masks card numbers and passwords in answers. A required document also counts as provided when a non-empty form answer has a matching label. The LLM gets the stage number, total stages, department and `RequiredDocumentsForStage`, and adds a risk level, a structured officer briefing (identity, stage documents, compliance, recommended action) and consistency flags. It **can't clear a submission**: any deterministic failure rejects it regardless of the LLM. It **can now fail one**: each consistency flag that survives a code filter is added as an `INCONSISTENCY-FLAG` rejection reason. The filter drops flags about the NIC when one is attached or answered, about the department field, about extra or payment uploads, about stage numbers or the payload's own fields, and vague "ambiguous" flags. In the normal flow it runs from `applications/submit` and `submit-stage`.

### `ValidateDraftDto`
```json
{ "applicationId": 0, "serviceProcedureId": 0, "serviceName": "", "citizenNic": "", "citizenName": "", "citizenAge": 0,
  "citizenIncome": 0, "calculatedFee": 0, "stage": 1, "formFields": {}, "attachedDocumentNames": [], "requiredDocuments": [] }
```

**Side effects.** `validate`, `orchestrate`, `briefing` and `dossier` all call `ValidateAndEnqueueAsync`. When the checks pass and `applicationId` is a real application, that call **creates or reuses the application's verification task and sets it back to `Pending`**, and it registers the NIC + service in the duplicate registry. The web's "compile dossier" button calls `dossier` on an application that is already in review, so it has the same effect as regenerating the agent draft (see [Known gaps](diagrams/agentic-ai-architecture.md#known-gaps)).

- **Dossier:** a risk score (5-98) from the validation result and fee, a queue tier (`Fast-Track Verification Desk` below 30, `Standard Officer Desk` up to 60, `Senior Regulatory Compliance Desk` above), and a SHA-256 "integrity seal" over the key fields.
- **Decision order:** a formal approval, revision or rejection order drafted by the LLM, or a fixed template without it. The officer can apply it in the workspace; the order itself changes nothing.
- **Remediation notice:** always deterministic, with a 7-day hold date. It isn't sent to the citizen.

### Book appointment

```json
{ "applicationId": "APP-12", "serviceName": "", "citizenNic": "CITIZEN", "preferredTimeInput": "next Tuesday around 10",
  "departmentName": null, "serviceProcedureId": null, "stage": null }
```

Books a collection appointment from free text. In order:

1. Fills in the NIC when it is empty or `CITIZEN`: from the token, else from the application's owner.
2. Resolves the department: the one sent, else the application's `CurrentDepartment`, else the last of the service's `workflowDepartments`, else its category. Names are normalised (for example anything with "police" becomes `Police Department`).
3. Loads that department's active [collection slots](#collection-slots---collectionslotscontroller-apiadmincollection-slots) and how many confirmed bookings each has per date.
4. Agent 3 parses the time (LLM, with a regex fallback; a night hour without "pm" is moved to the morning) and books it when it falls inside an active slot with space.

The response is `{ success, isBooked, confirmationCode, bookedDate, bookedTime, departmentName, departmentContact, departmentAddress, suggestedSlots, message, agentReasoning }`:

- **Booked:** the booking is saved in `CollectionBookings` as `Confirmed` with a code `SL-APT-NNNN`, and the citizen gets an `AppointmentConfirmed` in-app notification.
- **Not booked** (Sunday, outside a slot, or full): `isBooked: false` and `suggestedSlots` holds open slots for that day or the next working day.
- **One booking per application:** booking again moves the existing booking and keeps its confirmation code.
- **No slots configured:** 09:00-15:30 on any day but Sunday is accepted, with no capacity check.

Declared holidays aren't checked here, only on the admin timeline, and the department contact and address in the response are fixed placeholders.

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

## Collection slots - `CollectionSlotsController`, `api/admin/collection-slots`

Weekly counter hours per department, declared holidays, and the appointments booked into them by Agent 3. The department admin manages them on the web's **Collection Slots** page, and the mobile app reads `bookings`.

**Auth:** every `GET` is anonymous (`[AllowAnonymous]`). Writes need one of the collection-slot roles listed under [auth](#how-auth-actually-works---read-this-first), with no department check.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/admin/collection-slots?department=` | → slots with `bookedCount` and `remainingCapacity` for the next date of that weekday, plus `nextDate` |
| GET | `/api/admin/collection-slots/daily-schedule?department=&days=14` | → one entry per day from today (Sri Lanka time), 1-60 days, with holiday status and each slot's live status |
| GET | `/api/admin/collection-slots/holidays?department=` | → declared holidays, oldest first |
| POST | `/api/admin/collection-slots/holidays` | `{ departmentName, holidayDate: "yyyy-MM-dd", reason }` → `{ message }`. Declaring the same date again updates the reason |
| DELETE | `/api/admin/collection-slots/holidays/{id}` | → `{ message }` |
| GET | `/api/admin/collection-slots/bookings?department=&scope=` | → at most 200 bookings. `scope`: `upcoming` (today on), `past` (archived), or all |
| POST | `/api/admin/collection-slots` | [`CollectionTimeSlotDto`](#collectiontimeslotdto) → `{ message }` or `400` |
| PUT | `/api/admin/collection-slots/{id}` | `CollectionTimeSlotDto` → `{ message }`, `400` or `404` |
| DELETE | `/api/admin/collection-slots/{id}` | → `{ message }` |

### `CollectionTimeSlotDto`
```json
{ "departmentId": null, "departmentName": "Police Department", "dayOfWeek": 1, "specificDate": null,
  "startTime": "09:00", "endTime": "12:00", "maxCapacity": 10, "isActive": true }
```

- `dayOfWeek` is 1 (Monday) to 7 (Sunday). A `specificDate` makes a one-off slot for that date, and its weekday is taken from the date. On that date, date-specific slots replace the weekly ones.
- The [validation rules](#validation) apply: 06:00-20:00, at least 15 minutes, capacity 1-500, no overlap with the department's other slots on the same weekday or date.
- In `daily-schedule`, a day is a holiday when it is declared or is a Sunday without a date-specific slot. Each slot's `status` is `Active Now`, `Ended`, `Fully Booked` or `Open`.
- Department names are matched with `LIKE '%name%'`, so `Police` also matches `Police Department`.
- The tables (`CollectionTimeSlots`, `DepartmentHolidays`, `CollectionBookings`) are created with raw SQL on first use, not by migrations. If the slot table has no department rows, the first request seeds Mon-Fri 09:00-12:00 and 13:00-15:30 slots (capacity 10) for `Police Department`.
- Deleting a slot doesn't touch bookings already made in it.

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

`ingest-local-documents` matches each file to a service whose `serviceId` or name appears in the file name (or whose name contains the file name). If none matches, it falls back to keywords: `passport` → `GSN-IMM-001` or a name containing "Passport", `driving` → `GSN-DMT-002` / "Driving", `police` → `GSN-POL-003` / "Police", `business` → `GSN-COM-004` / "Business", `death` → `GSN-CIV-005` / "Death". Files that match nothing are skipped silently.

**Re-seed after catalog changes:** chunks are a snapshot. Adding a service or changing fees isn't reflected in agent answers until `seed` / `seed-action-agent` are called again. The same applies if the embedding algorithm in `LocalEmbeddingService` changes.

---

## Performance behaviour

Added for 1000+ daily users. The reasoning is in `docs/performance-and-redis.md`; the decisions are ADR-0012 to ADR-0014.

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
