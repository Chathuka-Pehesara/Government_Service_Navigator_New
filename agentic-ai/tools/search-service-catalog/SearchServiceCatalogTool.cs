using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Government_Service_Navigator.AgenticAi.Tools.SearchServiceCatalog;

public record ServiceCatalogItem(
    int ServiceProcedureId,
    string ServiceName,
    string Department,
    string Description,
    bool IsActive);

public interface IServiceCatalogRepository
{
    Task<List<ServiceCatalogItem>> GetAllActiveServicesAsync(CancellationToken cancellationToken = default);
}

public interface ISearchServiceCatalogTool
{
    Task<List<ServiceCatalogItem>> SearchAsync(string query, CancellationToken cancellationToken = default);
    Task<List<ServiceCatalogItem>> GetActiveServicesAsync(CancellationToken cancellationToken = default);
}

public class SearchServiceCatalogTool : ISearchServiceCatalogTool
{
    private readonly IServiceCatalogRepository? _repository;

    public SearchServiceCatalogTool(IServiceCatalogRepository? repository = null)
    {
        _repository = repository;
    }

    public async Task<List<ServiceCatalogItem>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return new List<ServiceCatalogItem>();

        var allServices = await GetActiveServicesAsync(cancellationToken);
        var q = query.Trim().ToLowerInvariant();
        var tokens = q.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        return allServices
            .Where(s => s.IsActive && (
                s.ServiceName.ToLowerInvariant().Contains(q) ||
                s.Description.ToLowerInvariant().Contains(q) ||
                tokens.Any(t => s.ServiceName.ToLowerInvariant().Contains(t) || s.Description.ToLowerInvariant().Contains(t))))
            .ToList();
    }

    public async Task<List<ServiceCatalogItem>> GetActiveServicesAsync(CancellationToken cancellationToken = default)
    {
        if (_repository != null)
        {
            try
            {
                var repoServices = await _repository.GetAllActiveServicesAsync(cancellationToken);
                if (repoServices != null && repoServices.Count > 0)
                    return repoServices;
            }
            catch
            {
                // Fallback to baseline default catalog
            }
        }

        return GetDefaultCatalog();
    }

    private static List<ServiceCatalogItem> GetDefaultCatalog() => new()
    {
        new(1, "Passport Renewal (General & Urgent)", "Department of Immigration and Emigration", "Standard and urgent biometric passport renewal for Sri Lankan citizens.", true),
        new(2, "National Identity Card (NIC) Issuance", "Department for Registration of Persons", "First-time issuance and renewal of National Identity Cards.", false),
        new(3, "Driving License Renewal", "Department of Motor Traffic", "Renewal and conversion of Sri Lanka driving license.", false)
    };
}
