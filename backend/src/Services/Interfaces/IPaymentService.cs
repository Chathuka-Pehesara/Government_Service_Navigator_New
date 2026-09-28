using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Services.Interfaces
{
    public interface IPaymentService
    {
        Task<Payment> CreateManualPaymentAsync(int applicationId, decimal amount, string userEmail, string slipUrl);
        Task<Payment?> GetByIdAsync(int id);
        Task<Payment> VerifyManualPaymentAsync(int id, bool approved, string? note);
        Task<Payment> UpdatePaymentStatusAsync(int id, string status, string? note, string officerId);
        Task<PaymentLedgerDto> GetLedgerAsync(int id);
        Task<(Payment payment, string checkoutUrl)> CreateStripeCheckoutAsync(int applicationId, decimal amount, string userEmail);
        // Opens an LKR Stripe Checkout session for an existing payment, pre-filled with the payment's email
        Task<string> OpenStripeCheckoutAsync(Payment payment, string productName);
        Task<Payment> ConfirmStripePaymentAsync(int paymentId);
        Task<List<Payment>> GetByUserAsync(string email);
    }
}