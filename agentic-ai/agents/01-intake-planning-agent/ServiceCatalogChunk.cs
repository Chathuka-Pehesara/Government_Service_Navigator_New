using System;
using System.Collections.Generic;
using System.Linq;

namespace AgenticAi.Agents.IntakePlanningAgent;

/// <summary>
/// Reads back a service catalog chunk written by RagSetupController.SeedDatabase:
/// "{Name} ({Category}): To apply for this service, citizens must provide the following documents: {docs}. The applicable fees are: {fees}."
/// </summary>
public record ServiceCatalogChunk(string ServiceName, string Category, List<string> RequiredDocuments, string FeeText)
{
    private const string DocsMarker = "the following documents: ";
    private const string FeesMarker = ". The applicable fees are: ";
    private const string NoDocuments = "No specific documents required";

    public static ServiceCatalogChunk? TryParse(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;

        // Policy chunk format: "[ServiceName - Title]: Content..."
        if (content.StartsWith('[') && content.Contains("]: "))
        {
            var closingBracket = content.IndexOf("]: ", StringComparison.Ordinal);
            var header = content.Substring(1, closingBracket - 1);
            var dashIdx = header.IndexOf(" - ", StringComparison.Ordinal);
            string svcName = dashIdx > 0 ? header.Substring(0, dashIdx).Trim() : header.Trim();
            string category = dashIdx > 0 ? header.Substring(dashIdx + 3).Trim() : "Policy";

            return new ServiceCatalogChunk(svcName, category, new List<string>(), string.Empty);
        }

        var headerEnd = content.IndexOf("): ", StringComparison.Ordinal);
        var categoryStart = headerEnd < 0 ? -1 : content.LastIndexOf(" (", headerEnd, StringComparison.Ordinal);
        var docsStart = content.IndexOf(DocsMarker, StringComparison.Ordinal);
        var feesStart = content.IndexOf(FeesMarker, StringComparison.Ordinal);
        if (categoryStart < 0 || docsStart < 0 || feesStart < docsStart) return null;

        var name = content[..categoryStart].Trim();
        var cat = content[(categoryStart + 2)..headerEnd].Trim();
        var docsText = content[(docsStart + DocsMarker.Length)..feesStart].Trim();
        var feeText = content[(feesStart + FeesMarker.Length)..].TrimEnd('.', ' ');

        var documents = docsText.Equals(NoDocuments, StringComparison.OrdinalIgnoreCase)
            ? new List<string>()
            : docsText.Split(", ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

        return new ServiceCatalogChunk(name, cat, documents, feeText);
    }

    public List<string> KeywordTokens() => TextTokenizer.Tokenize($"{ServiceName} {Category}");
}
