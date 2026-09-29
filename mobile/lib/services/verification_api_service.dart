import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/verification_models.dart';

class VerificationApiService {
  static String get baseUrl => '${AppConfig.baseUrl}/verification';

  /// Fetches the signed-in citizen's own applications (scoped server-side by the token's NIC)
  static Future<List<ApplicationItemModel>> fetchApplications({String? token}) async {
    if (token == null || token.isEmpty) return [];

    try {
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

      final response = await http
          .get(Uri.parse('$baseUrl/my-applications'), headers: headers)
          .timeout(const Duration(seconds: 15));

      List<dynamic> backendTasks = [];

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data is List) backendTasks.addAll(data);
      } else if (kDebugMode) {
        debugPrint('VerificationApiService: my-applications request failed (${response.statusCode})');
      }

      return backendTasks
          .whereType<Map<String, dynamic>>()
          .map(_applicationFromTask)
          .toList();
    } catch (e) {
      if (kDebugMode) {
        print('VerificationApiService: Failed to load applications: $e');
      }
    }

    return [];
  }

  static ApplicationItemModel _applicationFromTask(Map<String, dynamic> json) {
    final task = VerificationTaskModel.fromJson(json);

    List<String>? workflowDepts;
    if (json['workflowDepartments'] is List) {
      workflowDepts = (json['workflowDepartments'] as List).map((e) => e.toString()).toList();
    } else if (json['workflowDepartments'] is String) {
      try {
        final decoded = jsonDecode(json['workflowDepartments'] as String);
        if (decoded is List) {
          workflowDepts = decoded.map((e) => e.toString()).toList();
        }
      } catch (_) {}
    }

    return ApplicationItemModel(
      applicationId: task.applicationId,
      referenceNumber: json['referenceNumber']?.toString() ?? 'APP-${task.applicationId}',
      serviceName: json['serviceName']?.toString() ?? 'Application #${task.applicationId}',
      category: json['category']?.toString() ?? '',
      submittedDate: task.createdDate,
      status: task.status,
      applicantName: json['applicantName']?.toString(),
      verificationTask: task,
      installmentPlan: InstallmentSummary.fromJson(json['installmentPlan']),
      currentStage: (json['currentStage'] as num?)?.toInt() ?? 1,
      maxStages: (json['maxStages'] as num?)?.toInt() ?? 1,
      stageStatus: json['stageStatus']?.toString() ?? (task.status == 'Approved' ? 'Completed' : 'PendingReview'),
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      userEmail: json['userEmail']?.toString(),
      department: json['department']?.toString(),
      currentDepartment: json['currentDepartment']?.toString(),
      workflowDepartments: workflowDepts,
      serviceProcedureId: (json['serviceProcedureId'] as num?)?.toInt() ?? 0,
      paymentStatus: json['paymentStatus']?.toString(),
      isPaymentVerified: json['isPaymentVerified'] == true,
      isStagePaymentRequired: json['isStagePaymentRequired'] == true,
    );
  }

  /// Fetches audit logs for a specific application from the backend
  static Future<List<AuditLogModel>> fetchAuditLogs(int applicationId, {String? token}) async {
    try {
      final headers = <String, String>{'Content-Type': 'application/json'};
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }

      final response = await http
          .get(Uri.parse('$baseUrl/audit-logs?applicationId=$applicationId'), headers: headers)
          .timeout(const Duration(seconds: 3));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.map((json) => AuditLogModel.fromJson(json)).toList();
      }
    } catch (_) {}

    return [];
  }

  /// Citizen resubmission for an application marked "Revised".
  /// The backend does not expose a resubmission endpoint yet, so this reports failure.
  static Future<bool> submitRevision({
    required int applicationId,
    required String notes,
    required String documentAttachmentName,
  }) async {
    return false;
  }

  /// Citizen raises concern or requests customer support when an application review fails or is rejected
  static Future<Map<String, dynamic>?> raiseConcern(
    int applicationId, {
    required String subject,
    required String message,
    String? contactPhone,
    String? token,
  }) async {
    try {
      final headers = <String, String>{
        'Content-Type': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };
      final response = await http.post(
        Uri.parse('${AppConfig.baseUrl}/applications/$applicationId/raise-concern'),
        headers: headers,
        body: jsonEncode({
          'subject': subject,
          'message': message,
          'contactPhone': contactPhone,
        }),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
    } catch (e) {
      if (kDebugMode) {
        print('raiseConcern failed: $e');
      }
    }
    return null;
  }
}
