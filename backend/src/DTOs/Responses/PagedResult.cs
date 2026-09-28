namespace Government_Service_Navigator.Backend.DTOs.Responses
{
    // One page of a list endpoint. Lists that grow without bound (tasks, audit logs) return this
    // when the caller passes ?page=, so the browser never downloads a whole table.
    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling((double)Total / PageSize);
    }

    public static class Paging
    {
        // Callers that do not ask for a page still get at most this many (newest) rows
        public const int UnpagedLimit = 200;
        public const int MaxPageSize = 100;

        public static (int Page, int PageSize) Normalize(int? page, int pageSize, int defaultPageSize = 25)
        {
            var p = page is null or < 1 ? 1 : page.Value;
            var size = pageSize < 1 || pageSize > MaxPageSize ? defaultPageSize : pageSize;
            return (p, size);
        }
    }

    public class TaskSummaryDto
    {
        public int Pending { get; set; }
        public int Approved { get; set; }
        public int Rejected { get; set; }
        public int Suspended { get; set; }
        // Every task in the verified list (decided or reviewed)
        public int Verified { get; set; }
    }

    public class AuditLogSummaryDto
    {
        public int Total { get; set; }
        public int Deleted { get; set; }
        public int Approved { get; set; }
        public int Rejected { get; set; }
    }

    public class AuditLogQuery
    {
        public List<int>? ApplicationIds { get; set; }
        // "DELETED", "APPROVED", "REJECTED" or null for all
        public string? Action { get; set; }
        public string? Search { get; set; }
    }
}
