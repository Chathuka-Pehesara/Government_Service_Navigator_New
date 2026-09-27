# ADR-0009: Multi-department services are modelled as ordered stage templates

## Context

Some procedures pass through more than one department in sequence. For example, a police clearance step can come before the Immigration department's passport step, and each department reviews its own form and may charge its own fee. The original model had one template per service and one verification task per application, both with no notion of department or order.

## Options Considered

1. **A dedicated workflow model** - `WorkflowStage` rows with their own department, form, fee and transitions, plus an application state machine.
2. **Separate applications per department**, linked by a parent reference.
3. **Reuse templates as stages.** Add `StageOrder`, `Department` and `StageDescription` to `Template`, `TotalStages` and `WorkflowDepartments` to `ServiceProcedure`, and stage/department tracking columns to `ApplicationSubmission` and `VerificationTask`. A template's `payment` field defines that stage's fee.

## Decision

Option 3.

- The admin configures `TotalStages`/`WorkflowDepartments` (`PUT /api/services/{id}/workflow`), then builds one active template per `StageOrder`, each tagged with the reviewing department.
- The citizen submits stage 1 (`submit`). The officer in that department approves the stage (`PUT /api/verification/tasks/{id}/approve-stage`), which moves the task to the next template's department and emails the citizen. The citizen then submits the next form (`submit-stage`), which creates a new verification task for that department.
- Answers from later stages are merged into the same `FormDataJson` with a `"[Stage N] "` key prefix.
- A stage whose template has a `payment` field can't be approved until the latest `Payment` for the application is `Paid`. This lock is applied in both `decision` and `approve-stage`.

## Consequences

- No new tables. The builder, form endpoint and officer queue all worked with small additions.
- **Stage configuration is implicit and unvalidated.** Nothing checks that `TotalStages` matches the number of active templates, or that each template's `Department` appears in `WorkflowDepartments`. A missing stage template leaves the application in `AwaitingFeePayment` with no form to submit.
- The payment lock checks the application's **latest** payment, not a payment for *this* stage. A paid stage-1 fee can satisfy the check for stage 2 if stage 2's payment row hasn't been created yet.
- `submit-stage` creates the next verification task before checking whether that stage's fee is paid, so an unpaid stage can appear in the next department's queue (the approval lock still stops it from being approved).
- Bulk verification (`tasks/bulk-verify`) bypasses the payment lock.
- Stage state is duplicated between `ApplicationSubmission` (`CurrentStage`, `CurrentDepartment`, `StageStatus`) and each `VerificationTask` (`CurrentStage`, `StageNumber`, `Department`, `Status`), and the controllers update both by hand. `DepartmentHistoryJson` exists but is never written, so the audit log is the only history of which department handled which stage.
