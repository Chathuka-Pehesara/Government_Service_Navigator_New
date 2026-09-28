using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Government_Service_Navigator.Backend.Hubs
{
    /// <summary>
    /// Realtime push instead of polling. The server only sends small "something changed" messages;
    /// clients then refetch through the normal (cached) REST endpoints.
    /// - Citizens are addressed by NIC (see <see cref="NicUserIdProvider"/>): "applicationsChanged", "refundUpdated".
    /// - Staff join <see cref="OfficersGroup"/> and receive "queueUpdated" when tasks, submissions or payments change.
    /// </summary>
    [Authorize]
    public class ApplicationHub : Hub
    {
        public const string Path = "/hubs/applications";
        public const string OfficersGroup = "officers";

        public override async Task OnConnectedAsync()
        {
            // Citizens carry a nicNumber claim; every other signed-in account is staff
            if (string.IsNullOrEmpty(Context.User?.FindFirst("nicNumber")?.Value))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, OfficersGroup);
            }
            await base.OnConnectedAsync();
        }
    }
}
