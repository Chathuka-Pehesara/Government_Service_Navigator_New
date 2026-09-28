using System.Net;
using System.Text;
using Government_Service_Navigator.Backend.DTOs.Responses;

namespace Government_Service_Navigator.Backend.Services.EmailTemplates
{
    // Receipt email sent once Stripe confirms an online payment. Email clients ignore <style> blocks and
    // external CSS, so the HTML uses tables and inline styles only.
    public static class PaymentReceiptEmailTemplate
    {
        public static string Subject(OnlinePaymentReceiptDto r) =>
            r.InstallmentNumber.HasValue
                ? $"Payment Successful - Installment {r.InstallmentNumber} of {r.NumberOfInstallments} ({r.Currency} {r.Amount:N2})"
                : $"Payment Successful - Payment #{r.PaymentId} ({r.Currency} {r.Amount:N2})";

        public static string Html(OnlinePaymentReceiptDto r)
        {
            var rows = new StringBuilder();
            foreach (var (label, value) in Rows(r))
            {
                rows.Append($@"
              <tr>
                <td style=""padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;width:45%;"">{Enc(label)}</td>
                <td style=""padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;"">{Enc(value)}</td>
              </tr>");
            }

            return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1"">
  <title>{Enc(Subject(r))}</title>
</head>
<body style=""margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f3f4f6;padding:24px 12px;"">
    <tr>
      <td align=""center"">
        <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;"">
          <tr>
            <td style=""background:#1e3a8a;padding:24px 28px;color:#ffffff;"">
              <div style=""font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;"">Government Service Navigator</div>
              <div style=""font-size:22px;font-weight:700;margin-top:6px;"">Payment Receipt</div>
            </td>
          </tr>
          <tr>
            <td style=""padding:28px 28px 8px;"">
              <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;"">
                <tr>
                  <td style=""padding:16px 18px;"">
                    <div style=""color:#047857;font-size:14px;font-weight:600;"">&#10003; Payment successful</div>
                    <div style=""color:#065f46;font-size:28px;font-weight:700;margin-top:4px;"">{Enc(r.Currency)} {r.Amount:N2}</div>
                    <div style=""color:#047857;font-size:13px;margin-top:4px;"">Paid on {r.PaidDate:dd MMM yyyy, HH:mm} UTC</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style=""padding:8px 28px 0;color:#374151;font-size:14px;line-height:1.6;"">
              <p style=""margin:16px 0 8px;"">Dear Citizen,</p>
              <p style=""margin:0 0 8px;"">Your online card payment was received. Please keep this email as your receipt.</p>
            </td>
          </tr>
          <tr>
            <td style=""padding:8px 28px 8px;"">
              <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">{rows}
              </table>
            </td>
          </tr>
          <tr>
            <td style=""padding:16px 28px 28px;color:#374151;font-size:14px;line-height:1.6;"">
              {Enc(NextStep(r))}
            </td>
          </tr>
          <tr>
            <td style=""background:#f9fafb;padding:16px 28px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #e5e7eb;"">
              This is an automated message from Government Service Navigator. Please do not reply to this email.
              Quote Payment #{r.PaymentId} if you contact the department about this payment.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
        }

        // Plain-text version for mail clients that don't render HTML
        public static string Text(OnlinePaymentReceiptDto r)
        {
            var sb = new StringBuilder()
                .AppendLine("Dear Citizen,")
                .AppendLine()
                .AppendLine("Your online card payment was successful. Please keep this email as your receipt.")
                .AppendLine();

            foreach (var (label, value) in Rows(r))
            {
                sb.AppendLine($"{label + ":",-20}{value}");
            }

            return sb
                .AppendLine()
                .AppendLine(NextStep(r))
                .AppendLine()
                .AppendLine("Government Service Navigator")
                .ToString();
        }

        private static IEnumerable<(string Label, string Value)> Rows(OnlinePaymentReceiptDto r)
        {
            yield return ("Payment ID", $"#{r.PaymentId}");
            if (r.InstallmentNumber.HasValue)
            {
                yield return ("Installment", $"{r.InstallmentNumber} of {r.NumberOfInstallments}");
            }
            yield return ("Stripe Reference", Dash(r.StripeReference));
            yield return ("Application ID", $"APP-{r.ApplicationId}");
            yield return ("Service", Dash(r.ServiceName));
            yield return ("Service Stage", r.MaxStages > 1 ? $"Stage {r.StageNumber} of {r.MaxStages}" : $"Stage {r.StageNumber}");
            yield return ("Department", Dash(r.Department));
            yield return ("NIC Number", Dash(r.CitizenNic));
            yield return ("Payment Method", "Card (Stripe)");
            yield return ("Amount Paid", $"{r.Currency} {r.Amount:N2}");
        }

        private static string NextStep(OnlinePaymentReceiptDto r) =>
            r.InstallmentNumber.HasValue && r.InstallmentNumber < r.NumberOfInstallments
                ? "This installment is now recorded. You will get a reminder before the next installment is due."
                : "The department's Finance Officer can now see this payment and your application will continue to the next step.";

        private static string Dash(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value;

        private static string Enc(string value) => WebUtility.HtmlEncode(value);
    }
}
