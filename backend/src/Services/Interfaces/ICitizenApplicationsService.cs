using Government_Service_Navigator.Backend.DTOs.Responses;

namespace Government_Service_Navigator.Backend.Services.Interfaces
{
    public interface ICitizenApplicationsService
    {
        // The citizen's application cards, newest first. Read-only.
        Task<List<MyApplicationDto>> GetMyApplicationsAsync(string nic, CancellationToken cancellationToken = default);
    }
}
