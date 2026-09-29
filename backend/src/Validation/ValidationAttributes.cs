using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace Government_Service_Navigator.Backend.Validation
{
    // Field rules shared by the request DTOs. Empty values pass so they can be combined with
    // [Required] or left optional. The same rules live in mobile validators.dart and web validation.ts.

    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class SriLankaNicAttribute : ValidationAttribute
    {
        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            var error = SriLankaNic.Validate(s);
            return error == null ? ValidationResult.Success : new ValidationResult(ErrorMessage ?? error, Member(context));
        }

        internal static string[] Member(ValidationContext context) =>
            context.MemberName == null ? Array.Empty<string>() : new[] { context.MemberName };
    }

    /// <summary>
    /// An email address with a dotted domain (stricter than [EmailAddress], which accepts "a@b").
    /// Unlike [EmailAddress], an empty value passes, so it works on optional fields.
    /// </summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class EmailAttribute : ValidationAttribute
    {
        public static readonly Regex Pattern = new(@"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$", RegexOptions.Compiled);

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            var trimmed = s.Trim();
            return trimmed.Length <= 254 && Pattern.IsMatch(trimmed)
                ? ValidationResult.Success
                : new ValidationResult(ErrorMessage ?? "Enter a valid email address, e.g. name@example.com.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>
    /// Sri Lankan phone number: 0XXXXXXXXX or +94XXXXXXXXX (spaces and dashes allowed).
    /// AllowShortCode also accepts 3-4 digit government hotlines such as 1919.
    /// </summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class SriLankaPhoneAttribute : ValidationAttribute
    {
        public static readonly Regex Pattern = new(@"^(?:\+94|0094|0)[1-9][0-9]{8}$", RegexOptions.Compiled);
        private static readonly Regex ShortCode = new(@"^1[0-9]{2,3}$", RegexOptions.Compiled);

        public bool AllowShortCode { get; set; }

        public static string Normalize(string value) => Regex.Replace(value.Trim(), @"[\s\-()]", "");

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            var normalized = Normalize(s);
            return Pattern.IsMatch(normalized) || (AllowShortCode && ShortCode.IsMatch(normalized))
                ? ValidationResult.Success
                : new ValidationResult(ErrorMessage ?? "Enter a valid Sri Lankan phone number, e.g. 0771234567 or +94771234567.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>8-64 characters with an uppercase letter, a lowercase letter and a number.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class StrongPasswordAttribute : ValidationAttribute
    {
        public const int MinLength = 8;
        public const int MaxLength = 64;

        public static string? Check(string password)
        {
            if (password.Length < MinLength) return $"Password must be at least {MinLength} characters.";
            if (password.Length > MaxLength) return $"Password must be at most {MaxLength} characters.";
            if (!password.Any(char.IsUpper)) return "Password must contain an uppercase letter.";
            if (!password.Any(char.IsLower)) return "Password must contain a lowercase letter.";
            if (!password.Any(char.IsDigit)) return "Password must contain a number.";
            if (password.Any(char.IsWhiteSpace)) return "Password must not contain spaces.";
            return null;
        }

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || s.Length == 0) return ValidationResult.Success;
            var error = Check(s);
            return error == null ? ValidationResult.Success : new ValidationResult(ErrorMessage ?? error, SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>A person's name: 2-100 letters (any script, so Sinhala and Tamil work), spaces, dots, apostrophes and hyphens.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class PersonNameAttribute : ValidationAttribute
    {
        private static readonly Regex Pattern = new(@"^\p{L}[\p{L}\p{M} .'\-]{1,99}$", RegexOptions.Compiled);

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            return Pattern.IsMatch(s.Trim())
                ? ValidationResult.Success
                : new ValidationResult(ErrorMessage ?? "Name must be 2-100 characters and contain only letters, spaces, dots, apostrophes or hyphens.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>A money amount in LKR: more than 0, at most 10,000,000 and no more than 2 decimal places.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class MoneyAttribute : ValidationAttribute
    {
        public const decimal Max = 10_000_000m;

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not decimal d) return ValidationResult.Success;
            string? error = null;
            if (d <= 0) error = "Amount must be greater than 0.";
            else if (d > Max) error = $"Amount must not exceed LKR {Max:N0}.";
            else if (decimal.Round(d, 2) != d) error = "Amount can have at most 2 decimal places.";
            return error == null ? ValidationResult.Success : new ValidationResult(ErrorMessage ?? error, SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>A 24-hour time of day, HH:mm or HH:mm:ss.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class TimeOfDayAttribute : ValidationAttribute
    {
        private static readonly Regex Pattern = new(@"^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$", RegexOptions.Compiled);

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            return Pattern.IsMatch(s.Trim())
                ? ValidationResult.Success
                : new ValidationResult(ErrorMessage ?? "Time must be in 24-hour HH:mm format.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>An http(s) URL.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class WebUrlAttribute : ValidationAttribute
    {
        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            var ok = Uri.TryCreate(s.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
            return ok ? ValidationResult.Success : new ValidationResult(ErrorMessage ?? "Enter a valid web address starting with http:// or https://.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>
    /// An image: an http(s) URL (max 2048 characters) or an uploaded image as a base64 data URL
    /// (PNG, JPEG, GIF or WebP, at most 2 MB before encoding).
    /// </summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class ImageUrlAttribute : ValidationAttribute
    {
        private static readonly Regex DataUrl = new(@"^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$", RegexOptions.Compiled);
        // 2 MB of bytes is about 2.8 M base64 characters, plus the data: prefix
        private const int MaxDataUrlLength = 2_900_000;

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || string.IsNullOrWhiteSpace(s)) return ValidationResult.Success;
            var trimmed = s.Trim();
            bool ok;
            if (trimmed.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                ok = trimmed.Length <= MaxDataUrlLength && DataUrl.IsMatch(trimmed);
            else
                ok = trimmed.Length <= 2048
                     && Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
                     && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
            return ok
                ? ValidationResult.Success
                : new ValidationResult(ErrorMessage ?? "Logo must be a PNG, JPEG, GIF or WebP image up to 2 MB, or a web address starting with http:// or https://.", SriLankaNicAttribute.Member(context));
        }
    }

    /// <summary>Text that must not be only whitespace and must not contain HTML tags.</summary>
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
    public sealed class PlainTextAttribute : ValidationAttribute
    {
        private static readonly Regex Tag = new(@"<\s*/?\s*[a-zA-Z][^>]*>", RegexOptions.Compiled);

        protected override ValidationResult? IsValid(object? value, ValidationContext context)
        {
            if (value is not string s || s.Length == 0) return ValidationResult.Success;
            return Tag.IsMatch(s)
                ? new ValidationResult(ErrorMessage ?? $"{context.DisplayName} must not contain HTML.", SriLankaNicAttribute.Member(context))
                : ValidationResult.Success;
        }
    }
}
