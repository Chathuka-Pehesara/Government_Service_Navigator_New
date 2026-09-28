using Government_Service_Navigator.Backend.Hubs;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Caching.Hybrid;

namespace Government_Service_Navigator.Backend.Services
{
    public class CitizenChangeNotifier : ICitizenChangeNotifier
    {
        private readonly HybridCache _cache;
        private readonly IHubContext<ApplicationHub> _hub;

        public CitizenChangeNotifier(HybridCache cache, IHubContext<ApplicationHub> hub)
        {
            _cache = cache;
            _hub = hub;
        }

        public async Task ApplicationsChangedAsync(IReadOnlyCollection<string> nics, CancellationToken cancellationToken = default)
        {
            if (nics.Count == 0) return;
            // Invalidate before notifying, otherwise the phone refetches and gets the old cached copy
            await _cache.RemoveByTagAsync(nics.Select(CacheKeys.CitizenTag), cancellationToken);
            await _hub.Clients.Users(nics.ToList()).SendAsync("applicationsChanged", cancellationToken);
        }

        public async Task RefundsChangedAsync(IReadOnlyDictionary<string, List<int>> refundIdsByNic, CancellationToken cancellationToken = default)
        {
            foreach (var (nic, refundIds) in refundIdsByNic)
            {
                await _hub.Clients.User(nic).SendAsync("refundUpdated", refundIds, cancellationToken);
            }
        }

        public Task OfficerQueueChangedAsync(CancellationToken cancellationToken = default) =>
            _hub.Clients.Group(ApplicationHub.OfficersGroup).SendAsync("queueUpdated", cancellationToken);

        public async Task CatalogChangedAsync(CancellationToken cancellationToken = default) =>
            await _cache.RemoveByTagAsync(CacheKeys.CatalogTag, cancellationToken);
    }
}
