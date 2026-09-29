using System.Globalization;
using System.Text.Json;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Validation
{
    /// <summary>
    /// Checks a citizen's answers against the template's fields: the value must suit the field
    /// type, dropdown answers must be one of the options, and text fields whose label names an
    /// NIC, email or phone number must hold a valid one. Required-field checks stay in the
    /// controller. Mirrored by the mobile form (application_form_screen.dart).
    /// </summary>
    public static class ApplicationAnswersValidator
    {
        public const int MaxTextLength = 1000;
        public const int MaxTextAreaLength = 5000;

        /// <summary>Label -> problem, for every answered field that is invalid.</summary>
        public static Dictionary<string, string> Validate(IEnumerable<FormField> fields, IReadOnlyDictionary<string, string> answers)
        {
            var errors = new Dictionary<string, string>();
            foreach (var field in fields)
            {
                if (!answers.TryGetValue(field.Label, out var raw) || string.IsNullOrWhiteSpace(raw)) continue;
                var error = Check(field, raw.Trim());
                if (error != null) errors[field.Label] = $"{field.Label}: {error}";
            }
            return errors;
        }

        private static string? Check(FormField field, string value)
        {
            switch (field.Type)
            {
                case "number":
                    return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _)
                        ? null : "must be a number.";

                case "date":
                    if (!DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                        return "must be a valid date.";
                    return date.Year is < 1900 or > 2100 ? "must be a date between 1900 and 2100." : null;

                case "select":
                    return Options(field).Contains(value, StringComparer.OrdinalIgnoreCase)
                        ? null : "choose one of the listed options.";

                case "multiselect":
                    var allowed = Options(field);
                    var chosen = value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                    return chosen.All(c => allowed.Contains(c, StringComparer.OrdinalIgnoreCase))
                        ? null : "choose only from the listed options.";

                case "table":
                    try
                    {
                        using var doc = JsonDocument.Parse(value);
                        return doc.RootElement.ValueKind == JsonValueKind.Array ? null : "table data is not valid.";
                    }
                    catch (JsonException)
                    {
                        return "table data is not valid.";
                    }

                case "textarea":
                    return value.Length > MaxTextAreaLength ? $"must be at most {MaxTextAreaLength} characters." : null;

                case "text":
                    if (value.Length > MaxTextLength) return $"must be at most {MaxTextLength} characters.";
                    return CheckByLabel(field.Label, value);

                default:
                    return null;
            }
        }

        // Plain text fields are often an NIC, email or phone number; the label is the only hint
        private static string? CheckByLabel(string label, string value)
        {
            var l = label.ToLowerInvariant();
            if (l.Contains("nic") || l.Contains("identity card") || l.Contains("national id"))
                return SriLankaNic.Validate(value);
            if (l.Contains("email") || l.Contains("e-mail"))
                return EmailAttribute.Pattern.IsMatch(value) ? null : "must be a valid email address.";
            if (l.Contains("phone") || l.Contains("mobile") || l.Contains("telephone") || l.Contains("contact no"))
                return SriLankaPhoneAttribute.Pattern.IsMatch(SriLankaPhoneAttribute.Normalize(value))
                    ? null : "must be a valid Sri Lankan phone number, e.g. 0771234567.";
            return null;
        }

        private static List<string> Options(FormField field) =>
            (field.Options ?? string.Empty)
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .ToList();
    }
}
