import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class AuthResult {
  final bool success;
  final String? token;
  final String? errorMessage;
  final Map<String, dynamic>? user;

  const AuthResult({
    required this.success,
    this.token,
    this.errorMessage,
    this.user,
  });
}

class AuthService {
  static String get baseUrl => AppConfig.baseUrl;

  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      return AuthResult(
        success: data['success'] == true,
        token: data['token'],
        errorMessage: data['errorMessage'] ?? data['message'],
        user: data['user'],
      );
    } catch (e, stackTrace) {
      // Print the exact network error to the Flutter console for debugging
      debugPrint('--- LOGIN NETWORK ERROR ---');
      debugPrint('Error: $e');
      debugPrint('Stack Trace: $stackTrace');
      debugPrint('---------------------------');

      return const AuthResult(
        success: false,
        errorMessage: 'Could not reach the server. Check your connection.',
      );
    }
  }

  Future<AuthResult> signUp({
    required String fullName,
    required String email,
    required String password,
    required String nicNumber,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'fullName': fullName,
          'email': email,
          'password': password,
          'nicNumber': nicNumber,
        }),
      );

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      return AuthResult(
        success: data['success'] == true,
        token: data['token'],
        errorMessage: data['errorMessage'] ?? data['message'],
        user: data['user'],
      );
    } catch (e, stackTrace) {
      // Print the exact network error to the Flutter console for debugging
      debugPrint('--- SIGNUP NETWORK ERROR ---');
      debugPrint('Error: $e');
      debugPrint('Stack Trace: $stackTrace');
      debugPrint('----------------------------');

      return const AuthResult(
        success: false,
        errorMessage: 'Could not reach the server. Check your connection.',
      );
    }
  }

  /// Revokes the token on the server. Best effort: sign out still happens locally if this fails.
  Future<void> logout(String token) async {
    try {
      await http.post(
        Uri.parse('$baseUrl/auth/logout'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 5));
    } catch (e) {
      debugPrint('Logout request failed: $e');
    }
  }
}
