using System.ComponentModel.DataAnnotations;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateInstallmentPlanDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "A valid payment is required.")]
        public int PaymentId { get; set; }

        // Same limits as the web plan form (admin_installment_plans.tsx)
        [Range(2, 60, ErrorMessage = "Number of installments must be between 2 and 60.")]
        public int NumberOfInstallments { get; set; }

        // Days between each installment's due date (e.g. 30 for monthly).
        [Range(1, 365, ErrorMessage = "Days between installments must be between 1 and 365.")]
        public int IntervalDays { get; set; } = 30;
    }

    public class MarkInstallmentPaidDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "A valid installment is required.")]
        public int InstallmentId { get; set; }
    }
}
