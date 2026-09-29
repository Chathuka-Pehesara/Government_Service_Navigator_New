class Payment {
  final String id;
  final String? applicationId;
  final double amount;
  final String? currency;
  final String? method;
  final String? status;
  final String? stripePaymentIntentId;
  final String? userEmail;
  final String? createdDate;
  final String? paidDate;
  final String? paymentId;
  final String? checkoutUrl;
  // Department handling the payment's application (from GET /api/payments/mine)
  final String? department;

  const Payment({
    required this.id,
    this.applicationId,
    required this.amount,
    this.currency,
    this.method,
    this.status,
    this.stripePaymentIntentId,
    this.userEmail,
    this.createdDate,
    this.paidDate,
    this.paymentId,
    this.checkoutUrl,
    this.department,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id']?.toString() ?? '',
      applicationId: json['applicationId']?.toString(),
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      currency: json['currency'] as String?,
      method: json['method'] as String?,
      status: json['status']?.toString(),
      stripePaymentIntentId: json['stripePaymentIntentId'] as String?,
      userEmail: json['userEmail'] as String?,
      createdDate: json['createdDate'] as String?,
      paidDate: json['paidDate'] as String?,
      paymentId: json['paymentId']?.toString(),
      checkoutUrl: json['checkoutUrl'] as String?,
      department: json['department'] as String?,
    );
  }
}

/// Returned by POST /api/payments/checkout
class CheckoutResponse {
  final String paymentId;
  final String checkoutUrl;

  const CheckoutResponse({
    required this.paymentId,
    required this.checkoutUrl,
  });

  factory CheckoutResponse.fromJson(Map<String, dynamic> json) {
    return CheckoutResponse(
      paymentId: json['paymentId']?.toString() ?? '',
      checkoutUrl: json['checkoutUrl'] as String? ?? '',
    );
  }
}

