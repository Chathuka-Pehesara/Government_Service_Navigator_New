import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/onboarding_prefs.dart';
import 'package:mobile/services/session_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A JWT whose only interesting claim is `exp` (the signature is never checked on the device).
String jwtExpiringAt(DateTime expiry) {
  String part(Map<String, dynamic> json) => base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  final exp = expiry.toUtc().millisecondsSinceEpoch ~/ 1000;
  return '${part({'alg': 'HS256'})}.${part({'exp': exp, 'email': 'citizen@example.lk'})}.signature';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SessionStorage', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    test('nothing saved gives no session', () async {
      expect(await SessionStorage.load(), isNull);
    });

    test('a saved session comes back with its user', () async {
      final token = jwtExpiringAt(DateTime.now().add(const Duration(days: 7)));
      await SessionStorage.save(token: token, email: 'citizen@example.lk', user: {'nicNumber': '200012345678'});

      final session = await SessionStorage.load();

      expect(session, isNotNull);
      expect(session!.token, token);
      expect(session.email, 'citizen@example.lk');
      expect(session.user?['nicNumber'], '200012345678');
    });

    test('an expired token is dropped and cleared', () async {
      await SessionStorage.save(token: jwtExpiringAt(DateTime.now().subtract(const Duration(hours: 1))), email: 'a@b.lk');

      expect(await SessionStorage.load(), isNull);
      // Cleared, so a second load also finds nothing
      FlutterSecureStorage.setMockInitialValues({});
      expect(await SessionStorage.load(), isNull);
    });

    test('a token expiring within five minutes counts as expired', () async {
      await SessionStorage.save(token: jwtExpiringAt(DateTime.now().add(const Duration(minutes: 2))), email: 'a@b.lk');

      expect(await SessionStorage.load(), isNull);
    });

    test('a token that is not a JWT is kept for the server to judge', () async {
      await SessionStorage.save(token: 'opaque-token', email: 'a@b.lk');

      expect((await SessionStorage.load())?.token, 'opaque-token');
    });

    test('clear signs the user out', () async {
      await SessionStorage.save(token: jwtExpiringAt(DateTime.now().add(const Duration(days: 1))), email: 'a@b.lk');
      await SessionStorage.clear();

      expect(await SessionStorage.load(), isNull);
    });

    test('corrupt stored data gives no session instead of crashing', () async {
      FlutterSecureStorage.setMockInitialValues({'auth_session': '{not json'});

      expect(await SessionStorage.load(), isNull);
    });
  });

  group('OnboardingPrefs', () {
    test('is not completed on first launch', () async {
      SharedPreferences.setMockInitialValues({});

      expect(await OnboardingPrefs.isCompleted(), isFalse);
    });

    test('remembers completion', () async {
      SharedPreferences.setMockInitialValues({});

      await OnboardingPrefs.markCompleted();

      expect(await OnboardingPrefs.isCompleted(), isTrue);
    });
  });
}
