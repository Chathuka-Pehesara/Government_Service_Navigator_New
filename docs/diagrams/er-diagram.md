# Database ER Diagram

Reflects the actual EF Core model in `backend/src/Models/Entities/`, `backend/src/Data/Context/AppDbContext.cs` and the idempotent schema SQL in `Program.cs`, as of 2026-09-27. It doesn't show the aspirational schema in `docs/Government_Service_Navigator_Project_Plan.md`.

There are **two databases**:
- the **app DB** (`AppDbContext`, 27 tables)
- a **vector DB** (`VectorDbContext`, one table) used by the agents

The app DB is split into several diagrams below for readability. Dashed notes mark columns that look like foreign keys but aren't.

## Identity & auth

```mermaid
erDiagram
    User {
        int Id PK
        string Email UK
        string PasswordHash
        string FullName
        string NicNumber "used as the citizen key everywhere"
        string Role "User"
        datetime CreatedAt
    }
    Officer {
        int Id PK
        string Name
        string Email UK
        string PasswordHash
        string Role "Verifying Officer, Department Admin, Auditor, Finance Officer"
        string Department
        string Status "Active, Suspended"
        datetime CreatedAt
    }
    Admin {
        int Id PK
        string Email UK
        string PasswordHash
        string Role "Admin"
        datetime CreatedAt
    }
    RevokedToken {
        int Id PK
        string Jti UK
        datetime ExpiresAt
        datetime RevokedAt
    }
```

These tables have no relationships. `User`, `Officer` and `Admin` are unrelated tables (`docs/adr/0003-separate-user-officer-admin-tables.md`). `RevokedToken` stores only a JWT `jti` (`docs/adr/0001-jwt-auth-with-revocation-table.md`).

## Service catalog & forms

```mermaid
erDiagram
    ServiceProcedure {
        int Id PK
        string ServiceId UK "GSN-SRV-NNN"
        string Name
        string Category
        string Status "Draft, Active, Retired"
        int TotalStages
        string WorkflowDepartments "JSON array as text"
    }
    EligibilityRule {
        int Id PK
        int ServiceProcedureId FK
        string Field
        string Operator
        string Value
        bool IsStrict
    }
    DocumentRequirement {
        int Id PK
        int ServiceProcedureId FK
        string DocumentName
        string Description
        bool IsMandatory
    }
    FeeSchedule {
        int Id PK
        int ServiceProcedureId FK
        string FeeType
        decimal Amount
        datetime EffectiveDate
    }
    Template {
        guid Id PK
        string FormName
        string SubTitle
        string LawText
        string Status "Active, Inactive, Draft"
        datetime CreatedAt
        int ServiceProcedureId FK "nullable, SetNull on delete"
        string Department "department that reviews this stage"
        int StageOrder
        string StageDescription
    }
    FormField {
        guid Id PK
        guid TemplateId FK
        string Label
        string Type "text, file, payment, heading, ..."
        string Options "payment: JSON amount + feeType"
        bool IsRequired
        int OrderIndex
    }

    ServiceProcedure ||--o{ EligibilityRule : has
    ServiceProcedure ||--o{ DocumentRequirement : has
    ServiceProcedure ||--o{ FeeSchedule : has
    ServiceProcedure |o--o{ Template : "optionally links (SetNull)"
    Template ||--o{ FormField : "cascade delete"
```

## Applications & verification

```mermaid
erDiagram
    ApplicationSubmission {
        int Id PK "reference APP-{Id}"
        int ServiceProcedureId FK
        guid TemplateId "no FK"
        string CitizenNic "no FK to User"
        string UserEmail
        string FormDataJson "label to answer map"
        datetime SubmittedAt
        int CurrentStage
        int MaxStages
        string StageStatus "PendingReview, StageApproved, AwaitingFeePayment, Completed, Deleted, ..."
        string CurrentDepartment
        string DepartmentHistoryJson "unused"
    }
    SubmissionDocument {
        guid Id PK
        int ApplicationId "nullable, no FK - null until attached"
        string FieldLabel
        string FileName
        string ContentType "detected from bytes"
        long SizeBytes
        bytea Content
        string UploaderNic
        datetime UploadedAt
    }
    VerificationTask {
        int Id PK
        int ApplicationId "no FK"
        string Status "Pending, Approved, Rejected, Revised, Cancelled"
        datetime CreatedDate
        string CitizenNic
        int CurrentStage
        int MaxStages
        string Department
        int StageNumber
    }
    OfficerReview {
        int Id PK
        int TaskId FK
        string OfficerId "email (department), not an FK"
        datetime ReviewDate
        string Comments
        int RejectionReasonId FK "nullable"
    }
    ComplianceCheck {
        int Id PK
        int TaskId FK
        string CheckType "written by Agent 4"
        bool IsPassed
        string Details
    }
    RejectionReason {
        int Id PK
        string Code
        string Description
    }
    AgentDraft {
        int Id PK
        int ApplicationId UK "no FK"
        string DraftJson "Agent 2 + 3 output"
        datetime CreatedAt
    }
    AuditLog {
        int Id PK
        int ApplicationId "no FK"
        string Action
        string PerformedBy
        datetime Timestamp
        string OldValues
        string NewValues
    }

    ServiceProcedure ||--o{ ApplicationSubmission : "applied for"
    VerificationTask ||--o{ OfficerReview : has
    VerificationTask ||--o{ ComplianceCheck : has
    RejectionReason |o--o{ OfficerReview : "optionally explains"
```

`ServiceProcedure` is repeated here only as the target of the one real foreign key. An application can have several `VerificationTask`s — one per stage submitted — all sharing its `ApplicationId`.

## Payments, installments, refunds

```mermaid
erDiagram
    Payment {
        int Id PK
        int ApplicationId "no FK"
        decimal Amount
        string Currency "LKR"
        string Method "Online, Bank Deposit"
        string Status "Pending, PendingVerification, Paid, Failed"
        string StripePaymentIntentId "Stripe session id or citizen online ref"
        string ManualSlipUrl "points to a SubmissionDocument"
        string UserEmail
        datetime CreatedDate
        datetime PaidDate
    }
    InstallmentPlan {
        int Id PK
        int PaymentId FK
        int NumberOfInstallments
        decimal TotalAmount
        string Status "Active, Completed, Cancelled"
        datetime CreatedDate
    }
    Installment {
        int Id PK
        int InstallmentPlanId FK
        int InstallmentNumber
        decimal Amount
        datetime DueDate
        string Status "Pending, Overdue, PendingVerification, Paid"
        datetime PaidDate
        string PaymentMethod
        string StripeSessionId
        guid ReceiptId "no FK"
        datetime ReminderSentAt
    }
    PaymentReceipt {
        guid Id PK
        int InstallmentId "no FK"
        string FileName
        string ContentType
        long SizeBytes
        bytea Content
        datetime UploadedAt
    }
    RefundRequest {
        int Id PK
        int PaymentId FK
        decimal RefundAmount
        string Reason
        enum Status "Pending, Approved, Rejected, Processing, Completed, Failed"
        string RefundTransactionRef
        string RequestedByEmail
        string DecidedByEmail
        string DecisionNote
        datetime RequestedDate
        datetime DecidedDate
        datetime CompletedDate
    }

    Payment ||--o{ InstallmentPlan : "cascade delete"
    InstallmentPlan ||--o{ Installment : "cascade delete"
    Payment ||--o{ RefundRequest : "cascade delete"
```

## Notifications & analytics

```mermaid
erDiagram
    CitizenNotification {
        int Id PK
        string CitizenNic
        string UserEmail
        string Type
        string Title
        string Message
        int ApplicationId "nullable, no FK"
        int InstallmentPlanId "nullable, no FK"
        datetime CreatedAt
        datetime ReadAt
    }
    AnomalyFlag {
        int Id PK
        int PaymentId "nullable, no FK"
        string AnomalyType "HighAmount, RapidRefund"
        string Description
        string Status "Open, Reviewed, Dismissed"
        datetime DetectedDate
        string ReviewedByEmail
        datetime ReviewedDate
    }
    ServiceUsageStat {
        int Id PK
        int ServiceProcedureId "no FK"
        datetime Date
        int TotalApplications
        int ApprovedCount
        int RejectedCount
        double AverageProcessingHours
    }
    ReportSnapshot {
        int Id PK
        string Title
        string Period
        datetime GeneratedDate
        string DataJson
        string GeneratedByEmail
    }
```

## Vector DB (`VectorDbContext`)

```mermaid
erDiagram
    KnowledgeChunk {
        guid Id PK
        string Content
        string SourceCategory "service category, Service:{id}:{code}, or ActionTool:*"
        vector Embedding "vector(768), HNSW cosine index"
    }
```

This table is in a **separate PostgreSQL database** with the `pgvector` extension (`ConnectionStrings:VectorDb`). It has no link to the app DB — chunks are text snapshots of catalog data, rebuilt with the `api/RagSetup` endpoints.

## Notes on real gaps (not diagram omissions)

- **Most application links are soft.** `ApplicationSubmission.Id` is the application's identity, but `VerificationTask`, `AuditLog`, `Payment`, `AgentDraft`, `SubmissionDocument` and `CitizenNotification` all reference it as a plain `int` with no foreign key. Deleting a submission leaves orphans, and nothing prevents a row pointing at an application that doesn't exist. `Program.cs` removes tasks with `ApplicationId == 0` on startup for this reason. When the task table is empty, it also **seeds four mock tasks with made-up application IDs**, so a fresh database always has orphan queue rows.
- **Citizens are linked by NIC string, not `User.Id`.** Submissions, tasks, documents and notifications store `CitizenNic`. Payments and refunds store an email instead, so "my payments" and "my applications" match on different identifiers.
- **Uploaded files live in the database** as `bytea` (`SubmissionDocument`, `PaymentReceipt`) — see `docs/adr/0010-uploaded-files-stored-in-database.md`.
- **Schema isn't fully captured by migrations.** `backend/src/Migrations` is gitignored, and newer tables and columns are created with `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` in `Program.cs`. Those include `AgentDrafts`, `SubmissionDocuments`, `InstallmentPlans`, `Installments`, `PaymentReceipts`, `CitizenNotifications`, and the stage columns on `ApplicationSubmissions`, `VerificationTasks`, `Templates` and `ServiceProcedures`. See `docs/adr/0005-auto-apply-migrations-on-startup.md`.
- **`OfficerReview.OfficerId`** is the string `"<email> (<department>)"` from the token, not a foreign key to `Officer.Id`.
