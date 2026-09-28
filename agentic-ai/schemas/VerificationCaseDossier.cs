using System;
using System.Collections.Generic;

namespace Government_Service_Navigator.AgenticAi.Schemas
{
    /// <summary>
    /// Official verification case dossier compiled autonomously by Agent 4.
    /// Provides cryptographic integrity sealing and officer queue routing.
    /// </summary>
    public class VerificationCaseDossier
    {
        public string DossierNumber { get; set; } = string.Empty;
        public int ApplicationId { get; set; }
        public string CitizenNic { get; set; } = string.Empty;
        public string CitizenName { get; set; } = string.Empty;
        public string ServiceName { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public int RiskScore { get; set; } // 0-100 (0 = Lowest Risk, 100 = Severe Risk)
        public string RiskTier { get; set; } = "Low"; // "Low", "Medium", "High", "Critical"
        public string AssignedQueueTier { get; set; } = "Fast-Track Verification Desk";
        public string IntegritySealHash { get; set; } = string.Empty; // SHA-256 Anti-Tamper Seal
        public string StatutoryComplianceSummary { get; set; } = string.Empty;
        public List<ComplianceCheckItem> VerifiedChecks { get; set; } = new();
        public List<string> FlaggedDefects { get; set; } = new();
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Autonomous legal determination order prepared by Agent 4 for 1-click human officer sign-off.
    /// </summary>
    public class DecisionOrderDraft
    {
        public string OrderType { get; set; } = "Approval"; // "Approval", "RevisionRequired", "Rejection"
        public string OrderTitle { get; set; } = string.Empty;
        public string LegalStatutoryBasis { get; set; } = string.Empty;
        public string FindingsAndEvidence { get; set; } = string.Empty;
        public List<string> TermsAndConditions { get; set; } = new();
        public string OfficerSignOffText { get; set; } = string.Empty;
        public string RecommendedNextStep { get; set; } = string.Empty;
        public DateTime DraftedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Autonomous remediation notice dispatched to citizen when application needs corrections.
    /// </summary>
    public class RemediationNotice
    {
        public string NoticeNumber { get; set; } = string.Empty;
        public int ApplicationId { get; set; }
        public string CitizenNic { get; set; } = string.Empty;
        public string CitizenName { get; set; } = string.Empty;
        public string ServiceName { get; set; } = string.Empty;
        public int GracePeriodDays { get; set; } = 7;
        public DateTime HoldUntilDate { get; set; } = DateTime.UtcNow.AddDays(7);
        public List<string> RequiredActions { get; set; } = new();
        public string InstructionsText { get; set; } = string.Empty;
        public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
    }
}
