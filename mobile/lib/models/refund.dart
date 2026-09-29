/// Integer values as sent by the backend.
/// 0=Pending, 1=Approved, 2=Rejected, 3=Processing, 4=Completed, 5=Failed
enum RefundStatus {
  pending,
  approved,
  rejected,
  processing,
  completed,
  failed;

  static RefundStatus fromInt(int value) {
    switch (value) {
      case 0:
        return RefundStatus.pending;
      case 1:
        return RefundStatus.approved;
      case 2:
        return RefundStatus.rejected;
      case 3:
        return RefundStatus.processing;
      case 4:
        return RefundStatus.completed;
      case 5:
        return RefundStatus.failed;
      default:
        return RefundStatus.pending;
    }
  }

  int toInt() {
    switch (this) {
      case RefundStatus.pending:
        return 0;
      case RefundStatus.approved:
        return 1;
      case RefundStatus.rejected:
        return 2;
      case RefundStatus.processing:
        return 3;
      case RefundStatus.completed:
        return 4;
      case RefundStatus.failed:
        return 5;
    }
  }

  String get label {
    switch (this) {
      case RefundStatus.pending:
        return 'Pending';
      case RefundStatus.approved:
        return 'Approved';
      case RefundStatus.rejected:
        return 'Rejected';
      case RefundStatus.processing:
        return 'Processing';
      case RefundStatus.completed:
        return 'Completed';
      case RefundStatus.failed:
        return 'Failed';
    }
  }
}

class RefundRequest {
  final String id;
  final String paymentId;
  final double refundAmount;
  final String? reason;
  final RefundStatus status;
  final String? refundTransactionRef;
  final String? requestedByEmail;
  final String? departmentName;
  final String? decidedByEmail;
  final String? decisionNote;
  final String? requestedDate;
  final String? decidedDate;
  final String? completedDate;

  const RefundRequest({
    required this.id,
    required this.paymentId,
    required this.refundAmount,
    this.reason,
    required this.status,
    this.refundTransactionRef,
    this.requestedByEmail,
    this.departmentName,
    this.decidedByEmail,
    this.decisionNote,
    this.requestedDate,
    this.decidedDate,
    this.completedDate,
  });

  factory RefundRequest.fromJson(Map<String, dynamic> json) {
    final statusVal = json['status'];
    final statusEnum = statusVal is int
        ? RefundStatus.fromInt(statusVal)
        : (statusVal is num
            ? RefundStatus.fromInt(statusVal.toInt())
            : RefundStatus.pending);

    return RefundRequest(
      id: json['id']?.toString() ?? '',
      paymentId: json['paymentId']?.toString() ?? '',
      refundAmount: (json['refundAmount'] as num?)?.toDouble() ?? 0.0,
      reason: json['reason'] as String?,
      status: statusEnum,
      refundTransactionRef: json['refundTransactionRef'] as String?,
      requestedByEmail: json['requestedByEmail'] as String?,
      departmentName: json['departmentName'] as String?,
      decidedByEmail: json['decidedByEmail'] as String?,
      decisionNote: json['decisionNote'] as String?,
      requestedDate: json['requestedDate'] as String?,
      decidedDate: json['decidedDate'] as String?,
      completedDate: json['completedDate'] as String?,
    );
  }
}

typedef Refund = RefundRequest;

