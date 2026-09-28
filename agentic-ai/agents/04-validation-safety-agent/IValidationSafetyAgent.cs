using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Schemas;

namespace Government_Service_Navigator.AgenticAi.Agents.ValidationSafety
{
    public interface IValidationSafetyAgent
    {
        Task<ValidationResult> ValidateAndEnqueueAsync(
            DraftApplication draft, 
            List<string>? requiredDocuments = null,
            CancellationToken cancellationToken = default);
    }
}
