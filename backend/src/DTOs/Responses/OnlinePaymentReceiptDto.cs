namespace Government_Service_Navigator.Backend.DTOs.Responses
{
    // Details emailed to the citizen once a Stripe payment is confirmed.
    public class OnlinePaymentReceiptDto
    {
        public int PaymentId { get; set; }
        public string? StripeReference { get; set; }
        public int ApplicationId { get; set; }
        public string ServiceName { get; set; } = string.Empty;
        public int StageNumber { get; set; } = 1;
        public int MaxStages { get; set; } = 1;
        public string? Department { get; set; }
        public string CitizenNic { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "LKR";
        public DateTime PaidDate { get; set; }
    }
}
