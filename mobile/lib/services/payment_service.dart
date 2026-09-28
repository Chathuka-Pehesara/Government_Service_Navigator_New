import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/payment.dart';
import '../models/ledger.dart';

class PaymentService {
  final String _token;

  PaymentService(this._token);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token.isNotEmpty) 'Authorization': 'Bearer $_token',
      };

  int _cleanIntId(String rawId) {
    final parsed = int.tryParse(rawId);
    if (parsed != null) return parsed;
    final digits = rawId.replaceAll(RegExp(r'[^\d]'), '');
    return int.tryParse(digits) ?? 1;
  }

  /// POST /api/payments/checkout
  Future<CheckoutResponse> checkout({
    required String applicationId,
    required double amount,
    required String userEmail,
  }) async {
    final cleanAppId = _cleanIntId(applicationId);
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/payments/checkout'),
      headers: _headers,
      body: jsonEncode({
        'applicationId': cleanAppId,
        'amount': amount,
        'userEmail': userEmail,
      }),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return CheckoutResponse.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Checkout failed (${response.statusCode})');
  }

  /// GET /api/payments/{id}
  Future<Payment> getPayment(String id) async {
    final cleanId = _cleanIntId(id);
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/payments/$cleanId'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      return Payment.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Failed to load payment (${response.statusCode})');
  }

  /// GET /api/payments/{id}/confirm
  Future<Payment> confirmPayment(String id) async {
    final cleanId = _cleanIntId(id);
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/payments/$cleanId/confirm'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      return Payment.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Failed to confirm payment (${response.statusCode})');
  }

  /// GET /api/payments/mine
  Future<List<Payment>> myPayments() async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/payments/mine'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      final list = jsonDecode(response.body) as List<dynamic>;
      return list
          .map((e) => Payment.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Failed to load payments (${response.statusCode})');
  }

  /// POST /api/payments/manual
  Future<Payment> createManualPayment({
    required String applicationId,
    required double amount,
    required String userEmail,
    required String manualSlipUrl,
  }) async {
    final cleanAppId = _cleanIntId(applicationId);
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/payments/manual'),
      headers: _headers,
      body: jsonEncode({
        'applicationId': cleanAppId,
        'amount': amount,
        'userEmail': userEmail,
        'manualSlipUrl': manualSlipUrl,
      }),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return Payment.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Failed to create manual payment (${response.statusCode})');
  }

  /// POST /api/payments/{id}/verify
  Future<Payment> verifyManualPayment(
    String id, {
    required bool approved,
    String? note,
  }) async {
    final cleanId = _cleanIntId(id);
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/payments/$cleanId/verify'),
      headers: _headers,
      body: jsonEncode({
        'approved': approved,
        'note': note ?? '',
      }),
    );
    if (response.statusCode == 200) {
      return Payment.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Failed to verify manual payment (${response.statusCode})');
  }

  /// GET /api/payments/{id}/ledger
  Future<PaymentLedger> getLedger(String id) async {
    final cleanId = _cleanIntId(id);
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/payments/$cleanId/ledger'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      return PaymentLedger.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>);
    }
    throw Exception('Failed to load ledger (${response.statusCode})');
  }

  /// POST /api/payments/department-pay
  /// Direct payment to a department (Online or Bank Transfer) with citizen details and auto-generated reference
  Future<Map<String, dynamic>> departmentPay({
    required String department,
    String? serviceName,
    required double amount,
    required String paymentMethod,
    required String citizenNic,
    required String userEmail,
    String? citizenName,
    String? manualSlipUrl,
    String? notes,
    int? applicationId,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/payments/department-pay'),
      headers: _headers,
      body: jsonEncode({
        'department': department,
        'serviceName': serviceName,
        'amount': amount,
        'paymentMethod': paymentMethod,
        'citizenNic': citizenNic,
        'userEmail': userEmail,
        'citizenName': citizenName,
        'manualSlipUrl': manualSlipUrl,
        'notes': notes,
        'applicationId': applicationId,
      }),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception('Department payment failed (${response.statusCode}): ${response.body}');
  }
}

