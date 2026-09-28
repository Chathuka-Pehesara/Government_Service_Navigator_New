using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Services.Interfaces
{
    public interface IVerificationService
    {
        Task<VerificationTask> CreateTaskAsync(CreateTaskRequest request, string agentId);
        Task<bool> RecordDecisionAsync(int taskId, VerificationDecisionRequest request, string officerId);
        Task<bool> DeleteTaskAsync(int taskId, string officerId, string? reason = null);
        Task<bool> BulkVerifyAsync(BulkVerifyRequest request, string officerId);
        Task<List<AuditLog>> GetAuditLogsAsync(int applicationId);
        // Newest first; page is null for the capped, unpaged list (Paging.UnpagedLimit rows)
        Task<PagedResult<AuditLog>> GetAllAuditLogsAsync(AuditLogQuery query, int? page, int pageSize);
        Task<AuditLogSummaryDto> GetAuditLogSummaryAsync();
        Task<PagedResult<VerificationTask>> GetPendingTasksAsync(string? department, int? page, int pageSize, string? search = null);
        Task<PagedResult<VerificationTask>> GetVerifiedTasksAsync(string? department, int? page, int pageSize, string? search = null, string? status = null);
        Task<TaskSummaryDto> GetTaskSummaryAsync(string? department);
        Task<List<VerificationTask>> GetTasksForCitizenAsync(string citizenNic);
        Task<OfficerStatsDto> GetOfficerStatsAsync(string officerId);
        Task<List<RejectionReason>> GetRejectionReasonsAsync();
        Task<RejectionReason> CreateRejectionReasonAsync(RejectionReason reason);
        Task<bool> UpdateRejectionReasonAsync(int id, RejectionReason reason);
        Task<bool> DeleteRejectionReasonAsync(int id);
    }
}
