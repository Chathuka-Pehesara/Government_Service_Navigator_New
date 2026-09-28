import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ServiceApiClient {
  // Use 10.0.2.2 for Android Emulator, or localhost for iOS simulator/web
  static String get baseUrl => '${AppConfig.baseUrl}/services';

  static Future<List<dynamic>> fetchServices() async {
    final response = await http.get(Uri.parse(baseUrl));
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load services');
    }
  }

  static Future<Map<String, dynamic>> fetchServiceDetails(int id) async {
    final response = await http.get(Uri.parse('$baseUrl/$id'));
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load service details');
    }
  }

  /// Returns stage-specific details (document requirements and fee schedule for the given stage).
  static Future<Map<String, dynamic>> fetchServiceStageDetails(int serviceId, int stage) async {
    final response = await http.get(Uri.parse('$baseUrl/$serviceId/stage/$stage'));
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load stage $stage details');
    }
  }

  static Future<Map<String, dynamic>> evaluateEligibility(int serviceId, int age, String citizenship) async {
    final response = await http.post(
      Uri.parse('$baseUrl/eligibility-score'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'serviceId': serviceId,
        'citizenProfile': {
          'age': age,
          'citizenship': citizenship,
        }
      }),
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to evaluate eligibility');
    }
  }

  static Map<String, String> _authHeaders(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  /// Admin-built application form for a service, or null if none is published yet.
  static Future<Map<String, dynamic>?> fetchApplicationForm(
    int serviceId,
    String token, {
    int? stage,
  }) async {
    final query = stage != null ? '?stage=$stage' : '';
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/applications/form/$serviceId$query'),
      headers: _authHeaders(token),
    );
    if (response.statusCode == 200) return jsonDecode(response.body);
    if (response.statusCode == 404) return null;
    throw Exception('Failed to load application form');
  }

  /// Uploads one supporting document for a "file" field. Returns {id, fileName, contentType, sizeBytes}.
  static Future<Map<String, dynamic>> uploadDocument({
    required String fieldLabel,
    required String fileName,
    required List<int> bytes,
    required String token,
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('${AppConfig.baseUrl}/applications/documents'))
      ..headers['Authorization'] = 'Bearer $token'
      ..fields['fieldLabel'] = fieldLabel
      ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: fileName));

    final response = await http.Response.fromStream(await request.send());
    if (response.statusCode == 200) return jsonDecode(response.body);

    String message = 'Failed to upload $fileName';
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['message'] != null) message = body['message'].toString();
    } catch (_) {}
    throw Exception(message);
  }

  /// Submits the citizen's answers (keyed by field label). Returns the created application reference.
  static Future<Map<String, dynamic>> submitApplication({
    required int serviceId,
    required String? templateId,
    required Map<String, String> answers,
    Map<String, String> documents = const {},
    required String token,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/applications/submit'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'serviceProcedureId': serviceId,
        'templateId': templateId,
        'answers': answers,
        'documents': documents,
      }),
    );
    if (response.statusCode == 200) return jsonDecode(response.body);

    String message = 'Failed to submit application';
    try {
      final body = jsonDecode(response.body);
      if (body is Map) {
        if (body['errors'] is List && (body['errors'] as List).isNotEmpty) {
          message = (body['errors'] as List).join('\n');
        } else if (body['message'] != null) {
          message = body['message'].toString();
        }
        if (body['missingFields'] is List && (body['missingFields'] as List).isNotEmpty) {
          message = '$message: ${(body['missingFields'] as List).join(', ')}';
        }
      }
    } catch (_) {}
    throw Exception(message);
  }

  /// Submits a subsequent stage application form (e.g. Stage 2 for Department B).
  static Future<Map<String, dynamic>> submitStageApplication({
    required int applicationId,
    required String templateId,
    required Map<String, String> answers,
    Map<String, String> documents = const {},
    required String token,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/applications/submit-stage'),
      headers: _authHeaders(token),
      body: jsonEncode({
        'applicationId': applicationId,
        'templateId': templateId,
        'answers': answers,
        'documents': documents,
      }),
    );
    if (response.statusCode == 200) return jsonDecode(response.body);

    String message = 'Failed to submit stage application';
    try {
      final body = jsonDecode(response.body);
      if (body is Map) {
        if (body['errors'] is List && (body['errors'] as List).isNotEmpty) {
          message = (body['errors'] as List).join('\n');
        } else if (body['message'] != null) {
          message = body['message'].toString();
        }
      }
    } catch (_) {}
    throw Exception(message);
  }

  /// Sends a paid application to the officer queue. Returns the submitted reference, or — if the fee
  /// isn't fully paid yet (HTTP 402) — the payment details with `paymentRequired: true`.
  static Future<Map<String, dynamic>> finalizeApplication({
    required int applicationId,
    required String token,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/applications/$applicationId/finalize'),
      headers: _authHeaders(token),
    );
    if (response.statusCode == 200 || response.statusCode == 402) return jsonDecode(response.body);
    throw Exception('Could not confirm your application (${response.statusCode})');
  }

  /// Fetches official departments configured in the platform (with logos, contact, codes).
  static Future<List<Map<String, dynamic>>> fetchDepartments() async {
    try {
      final response = await http.get(Uri.parse('${AppConfig.baseUrl}/departments'));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.whereType<Map<String, dynamic>>().toList();
      }
    } catch (_) {}
    return [];
  }

  /// Finds department metadata (including logoUrl) by name, code, or partial category match.
  static Future<Map<String, dynamic>?> fetchDepartmentByNameOrCode(String nameOrCode) async {
    final query = nameOrCode.trim().toLowerCase();
    if (query.isEmpty) return null;
    final depts = await fetchDepartments();
    for (final d in depts) {
      final name = (d['name']?.toString() ?? '').toLowerCase();
      final code = (d['departmentCode']?.toString() ?? '').toLowerCase();
      final category = (d['category']?.toString() ?? '').toLowerCase();
      if (name == query || code == query || name.contains(query) || query.contains(name) || (category.isNotEmpty && (category == query || query.contains(category)))) {
        return d;
      }
    }
    return null;
  }
}

