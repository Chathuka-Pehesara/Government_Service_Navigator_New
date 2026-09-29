namespace Government_Service_Navigator.Backend.Validation
{
    /// <summary>
    /// Sri Lankan National Identity Card numbers.
    /// Old format: 9 digits + V/X, e.g. 881234567V (YYDDDSSSC + letter, year 19YY).
    /// New format: 12 digits, e.g. 198812345678 (YYYYDDDSSSSC).
    /// DDD is the day of the year of birth; 500 is added for women. NIC day numbers always count
    /// 29 February, so day 060 only exists in leap years. Mirrored in mobile validators.dart and
    /// web validation.ts - keep the three in step.
    /// </summary>
    public static class SriLankaNic
    {
        public sealed record NicInfo(DateTime BirthDate, bool IsFemale, bool IsOldFormat);

        public static string Normalize(string? nic) => (nic ?? string.Empty).Trim().ToUpperInvariant();

        public static bool IsValid(string? nic) => TryParse(nic, out _, out _);

        /// <summary>Why the NIC is invalid, or null when it's valid.</summary>
        public static string? Validate(string? nic)
        {
            TryParse(nic, out _, out var error);
            return error;
        }

        public static bool TryParse(string? nic, out NicInfo? info, out string? error)
        {
            info = null;
            var value = Normalize(nic);

            int year, day;
            bool isOld;
            if (value.Length == 10 && value[..9].All(char.IsAsciiDigit) && (value[9] == 'V' || value[9] == 'X'))
            {
                year = 1900 + int.Parse(value[..2]);
                day = int.Parse(value.Substring(2, 3));
                isOld = true;
            }
            else if (value.Length == 12 && value.All(char.IsAsciiDigit))
            {
                year = int.Parse(value[..4]);
                day = int.Parse(value.Substring(4, 3));
                isOld = false;
            }
            else
            {
                error = "NIC must be 9 digits followed by V or X (e.g. 881234567V) or 12 digits (e.g. 198812345678).";
                return false;
            }

            var isFemale = day > 500;
            if (isFemale) day -= 500;

            var today = DateTime.UtcNow.Date;
            if (year < 1900 || year > today.Year)
            {
                error = "NIC contains an invalid birth year.";
                return false;
            }
            if (day < 1 || day > 366)
            {
                error = "NIC contains an invalid birth day number.";
                return false;
            }
            if (day == 60 && !DateTime.IsLeapYear(year))
            {
                error = "NIC contains 29 February for a year that is not a leap year.";
                return false;
            }

            // Day numbers count 29 February every year, so walk a leap year and then move to the real year
            var dayInLeapYear = new DateTime(2000, 1, 1).AddDays(day - 1);
            var birthDate = new DateTime(year, dayInLeapYear.Month, dayInLeapYear.Day);
            if (birthDate > today)
            {
                error = "NIC contains a birth date in the future.";
                return false;
            }

            info = new NicInfo(birthDate, isFemale, isOld);
            error = null;
            return true;
        }
    }
}
