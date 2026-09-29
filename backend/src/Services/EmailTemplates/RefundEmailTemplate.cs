using System.Net;
using System.Text;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Services.EmailTemplates
{
    // Emails for the refund moments the citizen must hear about: the request was received,
    // it was rejected, or the money was returned. Same layout as PaymentReceiptEmailTemplate (tables, inline styles).
    public static class RefundEmailTemplate
    {
        public static string RequestedSubject(RefundRequest r) =>
            $"Refund Request Received - Refund #{r.Id} ({Currency(r)} {r.RefundAmount:N2})";

        public static string RejectedSubject(RefundRequest r) =>
            $"Refund Request Rejected - Refund #{r.Id}";

        public static string CompletedSubject(RefundRequest r) =>
            $"Refund Successful - Refund #{r.Id} ({Currency(r)} {r.RefundAmount:N2})";

        public static string RequestedHtml(RefundRequest r) => Html(
            RequestedSubject(r),
            heading: "Refund Request Received",
            amount: $"{Currency(r)} {r.RefundAmount:N2}",
            bannerTitle: "Request submitted",
            bannerDate: $"Requested on {r.RequestedDate:dd MMM yyyy, HH:mm} UTC",
            bannerColors: ("#eff6ff", "#bfdbfe", "#1d4ed8", "#1e3a8a"),
            intro: $"We have received your refund request. It has been sent to the Finance Officer of {Dept(r)} for review.",
            rows: RequestedRows(r),
            nextStep: "You will get another email once the refund has been processed and the amount returned to you.",
            refundId: r.Id);

        public static string RejectedHtml(RefundRequest r) => Html(
            RejectedSubject(r),
            heading: "Refund Request Rejected",
            amount: $"{Currency(r)} {r.RefundAmount:N2}",
            bannerTitle: "✕ Request not approved",
            bannerDate: $"Decided on {r.DecidedDate ?? DateTime.UtcNow:dd MMM yyyy, HH:mm} UTC",
            bannerColors: ("#fef2f2", "#fecaca", "#b91c1c", "#7f1d1d"),
            intro: $"The Finance Officer of {Dept(r)} has reviewed your refund request and was unable to approve it. No amount will be returned for this request.",
            rows: RejectedRows(r),
            nextStep: RejectedNextStep(r),
            refundId: r.Id);

        public static string CompletedHtml(RefundRequest r) => Html(
            CompletedSubject(r),
            heading: "Refund Successful",
            amount: $"{Currency(r)} {r.RefundAmount:N2}",
            bannerTitle: "✓ Refund completed",
            bannerDate: $"Completed on {r.CompletedDate ?? DateTime.UtcNow:dd MMM yyyy, HH:mm} UTC",
            bannerColors: ("#ecfdf5", "#a7f3d0", "#047857", "#065f46"),
            intro: "Your refund has been processed successfully and the amount has been returned to you. Please keep this email for your records.",
            rows: CompletedRows(r),
            nextStep: "Depending on your bank, it can take a few working days for the amount to show in your account.",
            refundId: r.Id);

        public static string RequestedText(RefundRequest r) => Text(
            "We have received your refund request. It has been sent to the Finance Officer of " + Dept(r) + " for review.",
            RequestedRows(r),
            "You will get another email once the refund has been processed and the amount returned to you.");

        public static string RejectedText(RefundRequest r) => Text(
            "The Finance Officer of " + Dept(r) + " has reviewed your refund request and was unable to approve it. No amount will be returned for this request.",
            RejectedRows(r),
            RejectedNextStep(r));

        public static string CompletedText(RefundRequest r) => Text(
            "Your refund has been processed successfully and the amount has been returned to you.",
            CompletedRows(r),
            "Depending on your bank, it can take a few working days for the amount to show in your account.");

        private static IEnumerable<(string Label, string Value)> RequestedRows(RefundRequest r)
        {
            yield return ("Refund ID", $"#{r.Id}");
            yield return ("Payment ID", $"#{r.PaymentId}");
            yield return ("Department", Dept(r));
            yield return ("Refund Amount", $"{Currency(r)} {r.RefundAmount:N2}");
            yield return ("Reason", r.Reason);
            yield return ("Status", "Pending review");
        }

        private static IEnumerable<(string Label, string Value)> RejectedRows(RefundRequest r)
        {
            yield return ("Refund ID", $"#{r.Id}");
            yield return ("Payment ID", $"#{r.PaymentId}");
            yield return ("Department", Dept(r));
            yield return ("Requested Amount", $"{Currency(r)} {r.RefundAmount:N2}");
            yield return ("Your Reason", r.Reason);
            yield return ("Reason for Rejection", string.IsNullOrWhiteSpace(r.DecisionNote) ? "No reason was given" : r.DecisionNote);
            yield return ("Status", "Rejected");
        }

        // A rejected refund frees the payment, so say whether the citizen can still ask again
        private static string RejectedNextStep(RefundRequest r)
        {
            var paid = r.Payment?.PaidDate;
            if (paid == null) return $"If you have questions about this decision, please contact {Dept(r)}.";

            var deadline = paid.Value.AddDays(RefundService.RefundWindowDays);
            return deadline > DateTime.UtcNow
                ? $"You can submit a new refund request for this payment until {deadline:dd MMM yyyy, HH:mm} UTC. If you have questions about this decision, please contact {Dept(r)}."
                : $"The {RefundService.RefundWindowDays}-day refund period for this payment has ended. If you have questions about this decision, please contact {Dept(r)}.";
        }

        private static IEnumerable<(string Label, string Value)> CompletedRows(RefundRequest r)
        {
            yield return ("Refund ID", $"#{r.Id}");
            yield return ("Payment ID", $"#{r.PaymentId}");
            yield return ("Department", Dept(r));
            yield return ("Amount Refunded", $"{Currency(r)} {r.RefundAmount:N2}");
            yield return ("Transaction Reference", Dash(r.RefundTransactionRef));
            yield return ("Requested On", $"{r.RequestedDate:dd MMM yyyy}");
            yield return ("Status", "Completed");
        }

        private static string Html(
            string title,
            string heading,
            string amount,
            string bannerTitle,
            string bannerDate,
            (string Bg, string Border, string Accent, string Strong) bannerColors,
            string intro,
            IEnumerable<(string Label, string Value)> rows,
            string nextStep,
            int refundId)
        {
            var rowHtml = new StringBuilder();
            foreach (var (label, value) in rows)
            {
                rowHtml.Append($@"
              <tr>
                <td style=""padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;width:45%;"">{Enc(label)}</td>
                <td style=""padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;"">{Enc(value)}</td>
              </tr>");
            }

            var (bg, border, accent, strong) = bannerColors;

            return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1"">
  <title>{Enc(title)}</title>
</head>
<body style=""margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f3f4f6;padding:24px 12px;"">
    <tr>
      <td align=""center"">
        <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;"">
          <tr>
            <td style=""background:#1e3a8a;padding:24px 28px;color:#ffffff;"">
              <div style=""font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;"">Government Service Navigator</div>
              <div style=""font-size:22px;font-weight:700;margin-top:6px;"">{Enc(heading)}</div>
            </td>
          </tr>
          <tr>
            <td style=""padding:28px 28px 8px;"">
              <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:{bg};border:1px solid {border};border-radius:8px;"">
                <tr>
                  <td style=""padding:16px 18px;"">
                    <div style=""color:{accent};font-size:14px;font-weight:600;"">{Enc(bannerTitle)}</div>
                    <div style=""color:{strong};font-size:28px;font-weight:700;margin-top:4px;"">{Enc(amount)}</div>
                    <div style=""color:{accent};font-size:13px;margin-top:4px;"">{Enc(bannerDate)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style=""padding:8px 28px 0;color:#374151;font-size:14px;line-height:1.6;"">
              <p style=""margin:16px 0 8px;"">Dear Citizen,</p>
              <p style=""margin:0 0 8px;"">{Enc(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style=""padding:8px 28px 8px;"">
              <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"">{rowHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style=""padding:16px 28px 28px;color:#374151;font-size:14px;line-height:1.6;"">
              {Enc(nextStep)}
            </td>
          </tr>
          <tr>
            <td style=""background:#f9fafb;padding:16px 28px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #e5e7eb;"">
              This is an automated message from Government Service Navigator. Please do not reply to this email.
              Quote Refund #{refundId} if you contact the department about this refund.
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
        private static string Text(string intro, IEnumerable<(string Label, string Value)> rows, string nextStep)
        {
            var sb = new StringBuilder()
                .AppendLine("Dear Citizen,")
                .AppendLine()
                .AppendLine(intro)
                .AppendLine();

            foreach (var (label, value) in rows)
            {
                sb.AppendLine($"{label + ":",-24}{value}");
            }

            return sb
                .AppendLine()
                .AppendLine(nextStep)
                .AppendLine()
                .AppendLine("Government Service Navigator")
                .ToString();
        }

        private static string Currency(RefundRequest r) => r.Payment?.Currency ?? "LKR";

        private static string Dept(RefundRequest r) =>
            string.IsNullOrWhiteSpace(r.DepartmentName) ? "the department" : r.DepartmentName;

        private static string Dash(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value;

        private static string Enc(string value) => WebUtility.HtmlEncode(value);
    }
}
