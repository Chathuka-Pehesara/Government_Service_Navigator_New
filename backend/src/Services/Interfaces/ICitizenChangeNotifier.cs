namespace Government_Service_Navigator.Backend.Services.Interfaces
{
    /// <summary>
    /// Called (by the EF Core change interceptor) after a commit that changes what citizens or
    /// officers see. Always invalidates the cache first, then pushes, so a client that refetches
    /// on the push never reads the old cached copy.
    /// </summary>
    public interface ICitizenChangeNotifier
    {
        Task ApplicationsChangedAsync(IReadOnlyCollection<string> nics, CancellationToken cancellationToken = default);
        Task RefundsChangedAsync(IReadOnlyDictionary<string, List<int>> refundIdsByNic, CancellationToken cancellationToken = default);
        Task OfficerQueueChangedAsync(CancellationToken cancellationToken = default);
        Task CatalogChangedAsync(CancellationToken cancellationToken = default);
    }
}
