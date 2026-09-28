namespace Government_Service_Navigator.Backend.DTOs.Responses
{
    // One card in the citizen app's application list (GET /api/verification/my-applications).
    // A concrete type rather than an anonymous object so the response can be cached in Redis.
    public class MyApplicationDto
    {
        public int Id { get; set; }
        public int ApplicationId { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
        public string ReferenceNumber { get; set; } = string.Empty;
        public string? ServiceName { get; set; }
        public string? Category { get; set; }
        public string? Department { get; set; }
        public string? CurrentDepartment { get; set; }
        public string? WorkflowDepartments { get; set; }
        public int ServiceProcedureId { get; set; }
        public int CurrentStage { get; set; }
        public int MaxStages { get; set; }
        public string? StageStatus { get; set; }
        public double Amount { get; set; }
        public string UserEmail { get; set; } = string.Empty;
        public string PaymentStatus { get; set; } = "None";
        public bool IsPaymentVerified { get; set; }
        public bool IsStagePaymentRequired { get; set; }
        public string? PaymentMethod { get; set; }
        public double PaymentAmount { get; set; }
        public MyApplicationInstallmentPlanDto? InstallmentPlan { get; set; }
    }

    public class MyApplicationInstallmentPlanDto
    {
        public int PlanId { get; set; }
        public string Status { get; set; } = string.Empty;
        public int NumberOfInstallments { get; set; }
        public int PaidCount { get; set; }
        public decimal? NextAmount { get; set; }
        public DateTime? NextDueDate { get; set; }
        public string? NextStatus { get; set; }
    }
}
