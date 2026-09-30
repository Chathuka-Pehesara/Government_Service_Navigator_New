import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A signed-in session as saved on the device.
class StoredSession {
  final String token;
  final String email;
  final Map<String, dynamic>? user;

  const StoredSession({required this.token, required this.email, this.user});
}

/// Keeps the login on this device so closing the app does not sign the user out.
/// The token lives in the platform's encrypted store (Android Keystore / iOS Keychain)
/// and is removed only on sign out or once the token has expired.
class SessionStorage {
  SessionStorage._();

  static const _key = 'auth_session';
  static const _storage = FlutterSecureStorage();

  static Future<void> save({required String token, required String email, Map<String, dynamic>? user}) async {
    try {
      await _storage.write(key: _key, value: jsonEncode({'token': token, 'email': email, 'user': user}));
    } catch (e) {
      // Not fatal: the user stays signed in for this run and simply logs in again next launch
      debugPrint('SessionStorage.save failed: $e');
    }
  }

  /// The saved session, or null when there is none, it is unreadable, or the token has expired.
  static Future<StoredSession?> load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final token = data['token'] as String? ?? '';
      if (token.isEmpty || _isExpired(token)) {
        await clear();
        return null;
      }
      return StoredSession(
        token: token,
        email: data['email'] as String? ?? '',
        user: (data['user'] as Map?)?.cast<String, dynamic>(),
      );
    } catch (e) {
      debugPrint('SessionStorage.load failed: $e');
      return null;
    }
  }

  static Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (e) {
      debugPrint('SessionStorage.clear failed: $e');
    }
  }

  /// Reads the JWT `exp` claim. A token we cannot parse is kept and left for the server to judge.
  static bool _isExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
      final exp = payload['exp'];
      if (exp is! num) return false;
      final expiry = DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true);
      // Treat tokens about to expire as expired so the user is not signed out mid-task
      return DateTime.now().toUtc().isAfter(expiry.subtract(const Duration(minutes: 5)));
    } catch (_) {
      return false;
    }
  }
}
