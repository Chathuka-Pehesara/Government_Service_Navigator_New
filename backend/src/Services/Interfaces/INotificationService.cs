using Government_Service_Navigator.Backend.DTOs.Responses;

namespace Government_Service_Navigator.Backend.Services.Interfaces
{
    public interface INotificationService
    {
        // body is the plain-text version; pass htmlBody to also send an HTML version
        Task SendEmailAsync(string toEmail, string subject, string body, string? htmlBody = null);

        Task NotifyRefundStatusAsync(string toEmail, int refundId, string status, string? note);
        Task NotifyPaymentStatusAsync(string toEmail, int paymentId, string status);
        Task NotifyOnlinePaymentSuccessAsync(string toEmail, OnlinePaymentReceiptDto receipt);
    }
}