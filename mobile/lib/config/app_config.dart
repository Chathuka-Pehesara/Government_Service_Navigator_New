import 'package:flutter/foundation.dart';

/// Single source of truth for the backend base URL.
///
/// Defaults to the hosted Azure API. To run against a local backend, pass the
/// server origin (without /api) at build/run time:
///   • Web / Windows / iOS sim → flutter run --dart-define=API_URL=http://localhost:5119
///   • Android emulator        → flutter run --dart-define=API_URL=http://10.0.2.2:5119
class AppConfig {
  AppConfig._();

  static const String _hostedUrl =
      'https://gsn-backend-5j7n.onrender.com';

  static String get _defaultUrl {
    if (kDebugMode) {
      if (kIsWeb) return 'http://localhost:5119';
      if (defaultTargetPlatform == TargetPlatform.android) {
        return 'http://10.0.2.2:5119';
      }
      return 'http://localhost:5119';
    }
    return _hostedUrl;
  }

  static final String _apiUrl = const String.fromEnvironment('API_URL').isNotEmpty
      ? const String.fromEnvironment('API_URL')
      : _defaultUrl;

  /// Backend origin, e.g. for SignalR hubs and uploaded file links.
  static String get serverUrl =>
      _apiUrl.endsWith('/') ? _apiUrl.substring(0, _apiUrl.length - 1) : _apiUrl;

  /// REST API root, e.g. `https://host/api`.
  static String get baseUrl => '$serverUrl/api';
}
