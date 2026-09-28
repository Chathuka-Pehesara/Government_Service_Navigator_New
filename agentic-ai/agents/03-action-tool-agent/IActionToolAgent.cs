using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;

namespace Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;

public interface IActionToolAgent
{
    Task<ActionDraftResponse> PrepareDraftAsync(
        ActionDraftRequest request,
        CancellationToken cancellationToken = default);

    Task<AppointmentBookingResponse> BookAppointmentAsync(
        AppointmentBookingRequest request,
        CancellationToken cancellationToken = default);
}
