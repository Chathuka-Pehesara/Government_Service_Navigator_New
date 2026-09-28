using System.Net;
using System.Net.Mail;
using System.Text;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Services.EmailTemplates;
using Government_Service_Navigator.Backend.Services.Interfaces;

namespace Government_Service_Navigator.Backend.Services
{
    public class NotificationService : INotificationService
    {
        public async Task SendEmailAsync(string toEmail, string subject, string body, string? htmlBody = null)
        {
            var host = Environment.GetEnvironmentVariable("SMTP_HOST");
            var portStr = Environment.GetEnvironmentVariable("SMTP_PORT");
            var user = Environment.GetEnvironmentVariable("SMTP_USER");
            var pass = Environment.GetEnvironmentVariable("SMTP_PASSWORD");
            var fromEmail = Environment.GetEnvironmentVariable("SMTP_FROM_EMAIL");
            if (string.IsNullOrWhiteSpace(fromEmail)) fromEmail = user;
            var fromName = Environment.GetEnvironmentVariable("SMTP_FROM_NAME");
            var useSsl = !bool.TryParse(Environment.GetEnvironmentVariable("SMTP_USE_SSL"), out var ssl) || ssl;

            if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
            {
                // SMTP not configured yet — log instead of failing the whole request.
                Console.WriteLine($"[Notification skipped - SMTP not configured] To: {toEmail}, Subject: {subject}");
                return;
            }

            var port = int.TryParse(portStr, out var p) ? p : 587;

            using var client = new SmtpClient(host, port)
            {
                Credentials = new NetworkCredential(user, pass),
                EnableSsl = useSsl
            };

            using var message = new MailMessage(new MailAddress(fromEmail!, fromName), new MailAddress(toEmail))
            {
                Subject = subject,
                Body = body
            };
            if (!string.IsNullOrEmpty(htmlBody))
            {
                // Plain text stays as the main body; clients that render HTML pick this alternate view
                message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, "text/html"));
            }

            try
            {
                await client.SendMailAsync(message);
            }
            catch (Exception ex)
            {
                // Don't let an email failure break the underlying business operation.
                Console.WriteLine($"[Notification failed] To: {toEmail}, Error: {ex.Message}");
            }
        }

                public async Task NotifyRefundStatusAsync(string toEmail, int refundId, string status, string? note)
        {
            var subject = $"Refund Request #{refundId} - {status}";
            var body = status switch
            {
                "Pending" => $"Your refund request #{refundId} has been received and is under review.",
                "Approved" => $"Your refund request #{refundId} has been approved.{(string.IsNullOrEmpty(note) ? "" : $" Note: {note}")}",
                "Rejected" => $"Your refund request #{refundId} has been rejected.{(string.IsNullOrEmpty(note) ? "" : $" Reason: {note}")}",
                "Processing" => $"Your refund request #{refundId} is now being processed.",
                "Completed" => $"Your refund request #{refundId} has been completed. The amount has been returned to you.",
                "Failed" => $"Your refund request #{refundId} could not be processed. Please contact support.",
                _ => $"Your refund request #{refundId} status has changed to {status}."
            };

            await SendEmailAsync(toEmail, subject, body);
        }

        public async Task NotifyPaymentStatusAsync(string toEmail, int paymentId, string status)
        {
            var subject = $"Payment #{paymentId} - {status}";
            var body = status switch
            {
                "Paid" => $"Your payment #{paymentId} was successful. Thank you.",
                "PendingVerification" => $"Your payment slip for #{paymentId} has been received and is under review by our Finance Officer.",
                "Failed" => $"Your payment #{paymentId} could not be verified. Please contact support or resubmit.",
                "Refunded" => $"Your payment #{paymentId} has been refunded.",
                _ => $"Your payment #{paymentId} status has changed to {status}."
            };

            await SendEmailAsync(toEmail, subject, body);
        }

        public async Task NotifyOnlinePaymentSuccessAsync(string toEmail, OnlinePaymentReceiptDto receipt)
        {
            await SendEmailAsync(
                toEmail,
                PaymentReceiptEmailTemplate.Subject(receipt),
                PaymentReceiptEmailTemplate.Text(receipt),
                PaymentReceiptEmailTemplate.Html(receipt));
        }
    }
}