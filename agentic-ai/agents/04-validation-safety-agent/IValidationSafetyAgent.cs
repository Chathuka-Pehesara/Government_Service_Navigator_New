using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Schemas;

namespace Government_Service_Navigator.AgenticAi.Agents.ValidationSafety
{
    public interface IValidationSafetyAgent
    {
        /// <summary>
        /// Executes full multi-layer safety validation, anti-fraud checks, and enqueuing gate.
        /// </summary>
        Task<ValidationResult> ValidateAndEnqueueAsync(
            DraftApplication draft, 
            List<string>? requiredDocuments = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Agent Action 1: Compiles an official Verification Case Dossier with cryptographic integrity seal
        /// and determines intelligent routing to the appropriate human officer queue tier.
        /// </summary>
        Task<VerificationCaseDossier> CompileCaseDossierAsync(
            DraftApplication draft,
            List<string>? requiredDocuments = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Agent Action 2: Generates a formal legal determination order (Approval, Revision, Rejection)
        /// with statutory legal citations for 1-click human officer sign-off.
        /// </summary>
        Task<DecisionOrderDraft> DraftDecisionOrderAsync(
            DraftApplication draft,
            string determinationType, // "Approval", "RevisionRequired", "Rejection"
            string? officerNotes = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Agent Action 3: Generates an actionable remediation notice with a 7-day hold window
        /// and clear step-by-step correction instructions for the citizen.
        /// </summary>
        Task<RemediationNotice> DraftRemediationNoticeAsync(
            DraftApplication draft,
            List<string> defects,
            CancellationToken cancellationToken = default);
    }
}
