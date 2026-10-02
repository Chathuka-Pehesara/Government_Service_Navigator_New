using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Schemas;

namespace Government_Service_Navigator.AgenticAi.Tools.ValidateSchema
{
    public class SchemaValidatorTool : ISchemaValidatorTool
    {
        // Sri Lankan NIC regex: 9 digits + V/X OR 12 digits
        private static readonly Regex NicPattern = new(@"^([0-9]{9}[vVxX]|[0-9]{12})$", RegexOptions.Compiled);

        // Adversarial prompt injection keywords as required by SE3090 evaluation spec
        private static readonly string[] AdversarialInjectionPatterns = new[]
        {
            "ignore previous instructions",
            "ignore all instructions",
            "disregard rules",
            "system prompt",
            "you are now in developer mode",
            "<script>",
            "drop table",
            "--",
            "exec(",
            "grant all"
        };

        public Task<SchemaValidationOutcome> ValidateAsync(DraftApplication draft, List<string>? requiredDocuments = null)
        {
            var outcome = new SchemaValidationOutcome();

            if (draft == null)
            {
                outcome.IsValid = false;
                outcome.Errors.Add("SCHEMA-000: Draft application object cannot be null.");
                return Task.FromResult(outcome);
            }

            // 1. Identity / NIC Validation
            bool isNicValid = !string.IsNullOrWhiteSpace(draft.CitizenNic) && NicPattern.IsMatch(draft.CitizenNic.Trim());
            if (!isNicValid)
            {
                outcome.Errors.Add($"SCHEMA-NIC-001: Invalid National Identity Card format '{draft.CitizenNic}'. Expected 9 digits with 'V/X' or 12 digits.");
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Identity Format Check", false, "NIC format failed regex specification."));
            }
            else
            {
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Identity Format Check", true, $"NIC '{draft.CitizenNic}' format verified."));
            }

            // 2. Citizen Age Validation
            bool isAgeValid = draft.CitizenAge >= 16 && draft.CitizenAge <= 125;
            if (!isAgeValid)
            {
                outcome.Errors.Add($"SCHEMA-AGE-002: Citizen age '{draft.CitizenAge}' is out of legal bounds (16 - 125).");
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Age Legal Bound Check", false, $"Age {draft.CitizenAge} is invalid."));
            }
            else
            {
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Age Legal Bound Check", true, $"Age {draft.CitizenAge} within legal bounds."));
            }

            // 3. Document Completeness Check
            var neededDocs = requiredDocuments ?? new List<string> { "Identity Document" };
            var attached = draft.AttachedDocumentNames ?? new List<string>();

            var missingDocs = neededDocs.Where(needed => 
                !attached.Any(a => 
                    a.IndexOf(needed, StringComparison.OrdinalIgnoreCase) >= 0 || 
                    needed.IndexOf(a, StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (needed.Contains("Identity", StringComparison.OrdinalIgnoreCase) && 
                     (a.Contains("NIC", StringComparison.OrdinalIgnoreCase) || 
                      a.Contains("Passport", StringComparison.OrdinalIgnoreCase) || 
                      a.Contains("License", StringComparison.OrdinalIgnoreCase) || 
                      a.Contains("ID", StringComparison.OrdinalIgnoreCase))) ||
                    (needed.Contains("NIC", StringComparison.OrdinalIgnoreCase) && 
                     (a.Contains("Identity", StringComparison.OrdinalIgnoreCase) || 
                      a.Contains("NIC", StringComparison.OrdinalIgnoreCase) || 
                      a.Contains("ID", StringComparison.OrdinalIgnoreCase)))
                )
                && !(draft.FormFields != null && draft.FormFields.Any(kv =>
                    !string.IsNullOrWhiteSpace(kv.Value) && (
                        kv.Key.IndexOf(needed, StringComparison.OrdinalIgnoreCase) >= 0 ||
                        needed.IndexOf(kv.Key, StringComparison.OrdinalIgnoreCase) >= 0 ||
                        (needed.Contains("NIC", StringComparison.OrdinalIgnoreCase) && kv.Key.Contains("NIC", StringComparison.OrdinalIgnoreCase))
                    )))
            ).ToList();

            if (missingDocs.Any())
            {
                foreach (var missing in missingDocs)
                {
                    outcome.Errors.Add($"DOC-002: Mandatory document missing: '{missing}'.");
                }
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Document Completeness", false, $"Missing required documents: {string.Join(", ", missingDocs)}."));
            }
            else
            {
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Document Completeness", true, $"All {neededDocs.Count} required document(s) attached."));
            }

            // 4. Adversarial Prompt Injection & Safety Check
            bool injectionDetected = false;
            string detectedPattern = string.Empty;

            var allTexts = new List<string> { draft.CitizenName ?? string.Empty };
            if (draft.FormFields != null)
            {
                allTexts.AddRange(draft.FormFields.Keys);
                allTexts.AddRange(draft.FormFields.Values);
            }

            foreach (var text in allTexts)
            {
                if (string.IsNullOrWhiteSpace(text)) continue;
                foreach (var pattern in AdversarialInjectionPatterns)
                {
                    if (text.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        injectionDetected = true;
                        detectedPattern = pattern;
                        break;
                    }
                }
                if (injectionDetected) break;
            }

            if (injectionDetected)
            {
                outcome.Errors.Add($"SAFETY-001: Adversarial input or injection attempt detected containing pattern '{detectedPattern}'.");
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Input Safety & Injection Defense", false, "Safety filter triggered by suspicious text string."));
            }
            else
            {
                outcome.ComplianceChecks.Add(new ComplianceCheckItem("Input Safety & Injection Defense", true, "Text fields cleared adversarial safety checks."));
            }

            outcome.IsValid = outcome.Errors.Count == 0;
            return Task.FromResult(outcome);
        }
    }
}
