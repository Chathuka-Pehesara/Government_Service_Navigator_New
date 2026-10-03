using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Tools.SearchServiceCatalog;

namespace Government_Service_Navigator.AgenticAi.Tools.RecommendServices;

public interface IRecommendServicesTool
{
    Task<List<string>> RecommendAlternativesAsync(string citizenQuery, CancellationToken cancellationToken = default);
}

public class RecommendServicesTool : IRecommendServicesTool
{
    private readonly ISearchServiceCatalogTool _catalogTool;

    public RecommendServicesTool(ISearchServiceCatalogTool catalogTool)
    {
        _catalogTool = catalogTool;
    }

    public async Task<List<string>> RecommendAlternativesAsync(string citizenQuery, CancellationToken cancellationToken = default)
    {
        var activeServices = await _catalogTool.GetActiveServicesAsync(cancellationToken);
        if (activeServices == null || activeServices.Count == 0)
        {
            return new List<string>();
        }

        // Return the active services officially configured in the registry
        return activeServices
            .Where(s => s.IsActive)
            .Select(s => s.ServiceName)
            .Distinct()
            .ToList();
    }
}
