namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateManualPaymentDto
    {
        public int ApplicationId { get; set; }
        public decimal Amount { get; set; }
        public string UserEmail { get; set; } = string.Empty;
        public string ManualSlipUrl { get; set; } = string.Empty;
    }

    public class VerifyManualPaymentDto
    {
        // true = mark Paid, false = mark Failed/Rejected
        public bool Approved { get; set; }
        public string? Note { get; set; }
    }

    public class CreateCheckoutSessionDto
    {
        public int ApplicationId { get; set; }
        public decimal Amount { get; set; }
        public string UserEmail { get; set; } = string.Empty;
    }

    public class UpdatePaymentStatusDto
    {
        public string Status { get; set; } = string.Empty; // "Paid", "Verified", "Failed", "Rejected", "Pending", "PendingVerification"
        public string? Note { get; set; }
    }

    public class DepartmentPaymentDto
    {
        public string Department { get; set; } = string.Empty;
        public string? ServiceName { get; set; }
        public decimal Amount { get; set; }
        public string PaymentMethod { get; set; } = "Online"; // "Online" or "Manual" / "BankTransfer"
        public string CitizenNic { get; set; } = string.Empty;
        public string UserEmail { get; set; } = string.Empty;
        public string? CitizenName { get; set; }
        public string? ManualSlipUrl { get; set; }
        public string? Notes { get; set; }
        public int? ApplicationId { get; set; }
    }

    public class RaiseConcernDto
    {
        public string Subject { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? ContactPhone { get; set; }
    }
}