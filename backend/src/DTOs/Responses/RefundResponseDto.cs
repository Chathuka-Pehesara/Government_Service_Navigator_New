using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.DTOs.Responses
{
    public class RefundResponseDto
    {
        public int Id { get; set; }
        public int PaymentId { get; set; }
        public decimal RefundAmount { get; set; }
        public string Reason { get; set; } = string.Empty;
        public RefundStatus Status { get; set; }
        public string? RefundTransactionRef { get; set; }
        public string RequestedByEmail { get; set; } = string.Empty;
        public string? DepartmentName { get; set; }
        public string? DecidedByEmail { get; set; }
        public string? DecisionNote { get; set; }
        public DateTime RequestedDate { get; set; }
        public DateTime? DecidedDate { get; set; }
        public DateTime? CompletedDate { get; set; }

        public static RefundResponseDto FromEntity(RefundRequest r) => new RefundResponseDto
        {
            Id = r.Id,
            PaymentId = r.PaymentId,
            RefundAmount = r.RefundAmount,
            Reason = r.Reason,
            Status = r.Status,
            RefundTransactionRef = r.RefundTransactionRef,
            RequestedByEmail = r.RequestedByEmail,
            DepartmentName = r.DepartmentName,
            DecidedByEmail = r.DecidedByEmail,
            DecisionNote = r.DecisionNote,
            RequestedDate = r.RequestedDate,
            DecidedDate = r.DecidedDate,
            CompletedDate = r.CompletedDate
        };
    }
}