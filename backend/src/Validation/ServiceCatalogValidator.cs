using System.Text.RegularExpressions;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Validation
{
    /// <summary>
    /// Checks for the service catalog endpoints. Those bind the EF entities directly, and data
    /// annotations on entities would also change the database model, so the rules live here.
    /// Each method returns the list of problems; empty means valid.
    /// </summary>
    public static class ServiceCatalogValidator
    {
        public static readonly string[] Statuses = { "Draft", "Active", "Retired" };
        public static readonly string[] Operators = { ">=", "<=", "==", "!=" };
        private static readonly Regex ServiceIdPattern = new(@"^[A-Za-z0-9][A-Za-z0-9\-]{1,29}$", RegexOptions.Compiled);

        public static List<string> Service(ServiceProcedure? s)
        {
            var errors = new List<string>();
            if (s == null) { errors.Add("Service details are required."); return errors; }

            if (string.IsNullOrWhiteSpace(s.ServiceId) || !ServiceIdPattern.IsMatch(s.ServiceId.Trim()))
                errors.Add("Service code must be 2-30 letters, numbers or dashes, e.g. GSN-SRV-001.");
            if (string.IsNullOrWhiteSpace(s.Name) || s.Name.Trim().Length is < 3 or > 200)
                errors.Add("Service name must be 3-200 characters.");
            if (string.IsNullOrWhiteSpace(s.Category) || s.Category.Trim().Length > 100)
                errors.Add("Category is required and must be at most 100 characters.");
            if (!Statuses.Contains(s.Status))
                errors.Add("Status must be Draft, Active or Retired.");
            if (s.TotalStages is < 1 or > 50)
                errors.Add("Total stages must be between 1 and 50.");
            return errors;
        }

        public static List<string> EligibilityRules(List<EligibilityRule>? rules)
        {
            var errors = new List<string>();
            if (rules == null) { errors.Add("Send a list of eligibility rules (it may be empty)."); return errors; }
            if (rules.Count > 100) errors.Add("A service can have at most 100 eligibility rules.");

            foreach (var (rule, i) in rules.Select((r, i) => (r, i + 1)))
            {
                if (string.IsNullOrWhiteSpace(rule.Field) || rule.Field.Length > 100)
                    errors.Add($"Rule {i}: choose the field to check.");
                if (!Operators.Contains(rule.Operator))
                    errors.Add($"Rule {i}: operator must be >=, <=, == or !=.");
                if (string.IsNullOrWhiteSpace(rule.Value) || rule.Value.Length > 200)
                    errors.Add($"Rule {i}: value is required and must be at most 200 characters.");
                else if (rule.Field.Equals("Age", StringComparison.OrdinalIgnoreCase)
                         && (!int.TryParse(rule.Value, out var age) || age is < 0 or > 120))
                    errors.Add($"Rule {i}: age must be a whole number between 0 and 120.");
                else if (rule.Field.Contains("Income", StringComparison.OrdinalIgnoreCase)
                         && (!decimal.TryParse(rule.Value, out var income) || income < 0))
                    errors.Add($"Rule {i}: income must be a number of 0 or more.");
            }
            return errors;
        }

        public static List<string> Documents(List<DocumentRequirement>? documents)
        {
            var errors = new List<string>();
            if (documents == null) { errors.Add("Send a list of document requirements (it may be empty)."); return errors; }
            if (documents.Count > 100) errors.Add("A service can have at most 100 required documents.");

            foreach (var (doc, i) in documents.Select((d, i) => (d, i + 1)))
            {
                if (string.IsNullOrWhiteSpace(doc.DocumentName) || doc.DocumentName.Trim().Length > 200)
                    errors.Add($"Document {i}: name is required and must be at most 200 characters.");
                if (doc.Description?.Length > 1000)
                    errors.Add($"Document {i}: description must be at most 1000 characters.");
            }

            var repeated = documents
                .Where(d => !string.IsNullOrWhiteSpace(d.DocumentName))
                .GroupBy(d => d.DocumentName.Trim(), StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToList();
            if (repeated.Count > 0) errors.Add($"Each document can be listed once. Repeated: {string.Join(", ", repeated)}.");
            return errors;
        }

        public static List<string> Fees(List<FeeSchedule>? fees)
        {
            var errors = new List<string>();
            if (fees == null) { errors.Add("Send a list of fees (it may be empty)."); return errors; }
            if (fees.Count > 50) errors.Add("A service can have at most 50 fees.");

            foreach (var (fee, i) in fees.Select((f, i) => (f, i + 1)))
            {
                if (string.IsNullOrWhiteSpace(fee.FeeType) || fee.FeeType.Trim().Length > 100)
                    errors.Add($"Fee {i}: fee type is required and must be at most 100 characters.");
                // A fee of 0 is allowed (free service); negative or over the cap is not
                if (fee.Amount < 0 || fee.Amount > MoneyAttribute.Max)
                    errors.Add($"Fee {i}: amount must be between 0 and {MoneyAttribute.Max:N0}.");
                else if (decimal.Round(fee.Amount, 2) != fee.Amount)
                    errors.Add($"Fee {i}: amount can have at most 2 decimal places.");
                if (fee.EffectiveDate != default && fee.EffectiveDate.Year is < 2000 or > 2100)
                    errors.Add($"Fee {i}: effective date is not a valid date.");
            }
            return errors;
        }

        public static List<string> Workflow(int totalStages, List<string>? departments)
        {
            var errors = new List<string>();
            if (totalStages is < 1 or > 50) errors.Add("Total stages must be between 1 and 50.");
            if (departments == null) return errors;
            if (departments.Count > totalStages)
                errors.Add($"There are more departments ({departments.Count}) than stages ({totalStages}).");
            if (departments.Any(d => string.IsNullOrWhiteSpace(d) || d.Length > 150))
                errors.Add("Every stage needs a department name of at most 150 characters.");
            return errors;
        }
    }
}
