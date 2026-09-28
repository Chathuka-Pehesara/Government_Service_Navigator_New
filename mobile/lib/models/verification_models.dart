class ComplianceCheckModel {
  final int id;
  final String checkType;
  final bool isPassed;
  final String details;

  ComplianceCheckModel({
    required this.id,
    required this.checkType,
    required this.isPassed,
    required this.details,
  });

  factory ComplianceCheckModel.fromJson(Map<String, dynamic> json) {
    return ComplianceCheckModel(
      id: json['id'] ?? 0,
      checkType: json['checkType'] ?? 'General Compliance',
      isPassed: json['isPassed'] ?? true,
      details: json['details'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'checkType': checkType,
      'isPassed': isPassed,
      'details': details,
    };
  }
}

class OfficerReviewModel {
  final int id;
  final String officerId;
  final DateTime reviewDate;
  final String comments;
  final int? rejectionReasonId;
  final String? rejectionReasonCode;
  final String? rejectionReasonDescription;

  OfficerReviewModel({
    required this.id,
    required this.officerId,
    required this.reviewDate,
    required this.comments,
    this.rejectionReasonId,
    this.rejectionReasonCode,
    this.rejectionReasonDescription,
  });

  factory OfficerReviewModel.fromJson(Map<String, dynamic> json) {
    return OfficerReviewModel(
      id: json['id'] ?? 0,
      officerId: json['officerId'] ?? 'Officer',
      reviewDate: json['reviewDate'] != null
          ? DateTime.tryParse(json['reviewDate'].toString()) ?? DateTime.now()
          : DateTime.now(),
      comments: json['comments'] ?? '',
      rejectionReasonId: json['rejectionReasonId'],
      rejectionReasonCode: json['rejectionReason'] != null
          ? json['rejectionReason']['code']
          : json['rejectionReasonCode'],
      rejectionReasonDescription: json['rejectionReason'] != null
          ? json['rejectionReason']['description']
          : json['rejectionReasonDescription'],
    );
  }
}

class AuditLogModel {
  final int id;
  final int applicationId;
  final String action;
  final String performedBy;
  final DateTime timestamp;
  final String oldValues;
  final String newValues;

  AuditLogModel({
    required this.id,
    required this.applicationId,
    required this.action,
    required this.performedBy,
    required this.timestamp,
    required this.oldValues,
    required this.newValues,
  });

  factory AuditLogModel.fromJson(Map<String, dynamic> json) {
    return AuditLogModel(
      id: json['id'] ?? 0,
      applicationId: json['applicationId'] ?? 0,
      action: json['action'] ?? '',
      performedBy: json['performedBy'] ?? 'System',
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
      oldValues: json['oldValues'] ?? '',
      newValues: json['newValues'] ?? '',
    );
  }
}

class VerificationTaskModel {
  final int id;
  final int applicationId;
  final String status; // 'Pending', 'Approved', 'Rejected', 'Revised'
  final DateTime createdDate;
  final List<OfficerReviewModel> reviews;
  final List<ComplianceCheckModel> complianceChecks;

  VerificationTaskModel({
    required this.id,
    required this.applicationId,
    required this.status,
    required this.createdDate,
    required this.reviews,
    required this.complianceChecks,
  });

  factory VerificationTaskModel.fromJson(Map<String, dynamic> json) {
    var rawReviews = json['reviews'] as List<dynamic>? ?? [];
    var rawChecks = json['complianceChecks'] as List<dynamic>? ?? [];

    return VerificationTaskModel(
      id: json['id'] ?? 0,
      applicationId: json['applicationId'] ?? 0,
      status: json['status'] ?? 'Pending',
      createdDate: json['createdDate'] != null
          ? DateTime.tryParse(json['createdDate'].toString()) ?? DateTime.now()
          : DateTime.now(),
      reviews: rawReviews
          .map((r) => OfficerReviewModel.fromJson(r as Map<String, dynamic>))
          .toList(),
      complianceChecks: rawChecks
          .map((c) => ComplianceCheckModel.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Installment plan paying for an application (from my-applications), used to open its schedule.
class InstallmentSummary {
  final String planId;
  final String status; // 'Active', 'Completed', 'Cancelled'
  final int numberOfInstallments;
  final int paidCount;
  final double? nextAmount;
  final DateTime? nextDueDate;
  final String? nextStatus;

  const InstallmentSummary({
    required this.planId,
    required this.status,
    required this.numberOfInstallments,
    required this.paidCount,
    this.nextAmount,
    this.nextDueDate,
    this.nextStatus,
  });

  bool get isActive => status.toLowerCase() == 'active';

  static InstallmentSummary? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    return InstallmentSummary(
      planId: json['planId']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      numberOfInstallments: (json['numberOfInstallments'] as num?)?.toInt() ?? 0,
      paidCount: (json['paidCount'] as num?)?.toInt() ?? 0,
      nextAmount: (json['nextAmount'] as num?)?.toDouble(),
      nextDueDate: DateTime.tryParse(json['nextDueDate']?.toString() ?? '')?.toLocal(),
      nextStatus: json['nextStatus']?.toString(),
    );
  }
}

class ApplicationItemModel {
  final int applicationId;
  final String referenceNumber;
  final String serviceName;
  final String category;
  final DateTime submittedDate;
  final String status; // 'Pending', 'Approved', 'Rejected', 'Revised'
  final String? applicantName;
  final VerificationTaskModel? verificationTask;
  final List<AuditLogModel> auditLogs;
  final InstallmentSummary? installmentPlan;
  final int currentStage;
  final int maxStages;
  final String stageStatus;
  final double amount;
  final String? userEmail;
  final String? department;
  final String? currentDepartment;
  final List<String>? workflowDepartments;
  final int serviceProcedureId;
  final String? paymentStatus;
  final bool isPaymentVerified;
  final bool isStagePaymentRequired;

  ApplicationItemModel({
    required this.applicationId,
    required this.referenceNumber,
    required this.serviceName,
    required this.category,
    required this.submittedDate,
    required this.status,
    this.applicantName,
    this.verificationTask,
    this.auditLogs = const [],
    this.installmentPlan,
    this.currentStage = 1,
    this.maxStages = 1,
    this.stageStatus = 'PendingReview',
    this.amount = 0.0,
    this.userEmail,
    this.department,
    this.currentDepartment,
    this.workflowDepartments,
    this.serviceProcedureId = 0,
    this.paymentStatus,
    this.isPaymentVerified = false,
    this.isStagePaymentRequired = false,
  });

  ApplicationItemModel copyWith({
    String? status,
    VerificationTaskModel? verificationTask,
    List<AuditLogModel>? auditLogs,
    int? currentStage,
    int? maxStages,
    String? stageStatus,
    double? amount,
    String? userEmail,
    String? department,
    String? currentDepartment,
    List<String>? workflowDepartments,
    int? serviceProcedureId,
    String? paymentStatus,
    bool? isPaymentVerified,
    bool? isStagePaymentRequired,
  }) {
    return ApplicationItemModel(
      applicationId: applicationId,
      referenceNumber: referenceNumber,
      serviceName: serviceName,
      category: category,
      submittedDate: submittedDate,
      status: status ?? this.status,
      applicantName: applicantName,
      verificationTask: verificationTask ?? this.verificationTask,
      auditLogs: auditLogs ?? this.auditLogs,
      installmentPlan: installmentPlan,
      currentStage: currentStage ?? this.currentStage,
      maxStages: maxStages ?? this.maxStages,
      stageStatus: stageStatus ?? this.stageStatus,
      amount: amount ?? this.amount,
      userEmail: userEmail ?? this.userEmail,
      department: department ?? this.department,
      currentDepartment: currentDepartment ?? this.currentDepartment,
      workflowDepartments: workflowDepartments ?? this.workflowDepartments,
      serviceProcedureId: serviceProcedureId ?? this.serviceProcedureId,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      isPaymentVerified: isPaymentVerified ?? this.isPaymentVerified,
      isStagePaymentRequired: isStagePaymentRequired ?? this.isStagePaymentRequired,
    );
  }
}
