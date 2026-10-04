using Government_Service_Navigator.Backend.Validation;
using Microsoft.AspNetCore.SignalR;

namespace Government_Service_Navigator.Backend.Hubs
{
    // Routes Clients.User(nic) to every open connection of that citizen (phone, tablet, web)
    public class NicUserIdProvider : IUserIdProvider
    {
        public string? GetUserId(HubConnectionContext connection)
        {
            var nic = connection.User?.FindFirst("nicNumber")?.Value ?? connection.User?.FindFirst("nic")?.Value;
            return string.IsNullOrWhiteSpace(nic) ? null : SriLankaNic.Normalize(nic);
        }
    }
}
