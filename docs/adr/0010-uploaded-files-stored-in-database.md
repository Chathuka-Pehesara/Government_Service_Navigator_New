# ADR-0010: Uploaded documents and receipts are stored in PostgreSQL as bytea

## Context

Citizens now upload supporting documents (`file` fields), bank deposit slips, and installment bank-transfer receipts from the Flutter app. Officers and finance staff must preview them in the web dashboard. The API runs as a single process against a hosted Neon database, with no object storage provisioned.

## Options Considered

1. **Object storage** (S3 / Azure Blob / Supabase storage) holding the file, with a key in the database, served via signed URLs.
2. **Local disk** on the API host.
3. **Database `bytea` columns.** `SubmissionDocument.Content` and `PaymentReceipt.Content` are streamed back through authorised endpoints.

## Decision

Option 3.

- Uploads go through `POST /api/applications/documents` and `POST /api/installment-plans/installments/{id}/bank-transfer`.
- They're limited to 10 MB, and the type is detected from magic bytes (`UploadedFileTypes.Detect`). Only PDF, JPEG and PNG are accepted, regardless of the client's `Content-Type`.
- A document is stored unattached (`ApplicationId = NULL`) until a submit claims it. Only the uploader's NIC can attach it.
- Files are served inline with `X-Content-Type-Options: nosniff`:
  - `GET /api/verification/documents/{id}/content` (officer roles)
  - `GET /api/installment-plans/installments/{id}/receipt` (staff roles)
- A deposit slip's `Payment.ManualSlipUrl` is simply that document's content URL.

## Consequences

- No extra infrastructure or credentials. Uploads are transactional with the application and are covered by the database's backups.
- Magic-byte detection plus `nosniff` stops a renamed HTML/script file from being served as something executable.
- **Database size and cost grow with every upload** - on Neon this is the metered resource. Every read streams the whole blob through the API process and into memory (`MemoryStream` on upload, a `byte[]` on read).
- **Orphans accumulate.** Documents uploaded but never submitted keep `ApplicationId = NULL` forever, and nothing cleans them up.
- The document content endpoint checks the officer *role* but not the officer's *department*. Any officer with a document's GUID can read it.
- Moving to object storage later only requires swapping the `Content` column for a storage key and changing the two read endpoints, because clients only ever see the API URLs.

## Amended: lists never load file bytes

The finance slip lists in `PaymentsController` (pending slips and department payments) loaded whole `SubmissionDocument` rows, `Content` included, just to find each slip's id, name and upload time. Every page load pulled every attached file out of Neon. They now project to metadata only (`Id`, `ApplicationId`, `FieldLabel`, `FileName`, `ContentType`, `SizeBytes`, `UploadedAt`), and the single-slip lookup selects only the id.

Rule going forward: only the two content endpoints above may read `Content`. Any other query on `SubmissionDocuments` or `PaymentReceipts` must `Select` the columns it needs. The submit path in `ApplicationsController` still loads full rows because it updates them to attach the documents; that happens once per submission.

