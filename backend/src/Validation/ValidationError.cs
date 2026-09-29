namespace Government_Service_Navigator.Backend.Validation
{
    /// <summary>
    /// Body for a validation failure found in a controller, in the same shape as the automatic
    /// model-validation response (Program.cs): { message, errors, fields }.
    /// </summary>
    public static class ValidationError
    {
        public static object Body(IReadOnlyList<string> errors) => new
        {
            message = string.Join(" ", errors),
            errors,
            fields = new Dictionary<string, string>()
        };

        public static object Body(string message, string? field = null) => new
        {
            message,
            errors = new[] { message },
            fields = field == null
                ? new Dictionary<string, string>()
                : new Dictionary<string, string> { [field] = message }
        };
    }
}
