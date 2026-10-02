import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/login_page.dart';
import 'package:mobile/main.dart';
import 'package:mobile/screens/index/landing_page.dart';
import 'package:mobile/screens/index/loading_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A typical phone (360 x 780 logical pixels) instead of the 800 x 600 test default.
void usePhoneScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  // Tests render text in the block-glyph test font, which is far wider than the app's fonts, so text
  // rows report overflows that don't happen on a device. These tests check navigation, not layout.
  final original = FlutterError.onError;
  FlutterError.onError = (details) {
    if (details.exceptionAsString().contains('overflowed')) return;
    original?.call(details);
  };
  addTearDown(() => FlutterError.onError = original);
}

/// Starts the app, lets the splash screen finish and returns once the next page is showing.
/// The pages animate forever, so the clock is advanced by hand instead of pumpAndSettle.
Future<void> startApp(WidgetTester tester) async {
  usePhoneScreen(tester);
  await tester.pumpWidget(const ProviderScope(child: MyApp()));
  expect(find.byType(LoadingPage), findsOneWidget);
  await tester.pump(const Duration(seconds: 3)); // splash
  await tester.pump(const Duration(seconds: 1)); // fade transition
}

/// Removes the app so its repeating animations stop before the test ends.
Future<void> stopApp(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('first launch goes from the splash screen to onboarding', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await startApp(tester);

    expect(find.byType(LandingPage), findsOneWidget);
    expect(find.text('AI-Powered\nGuidance'), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('after onboarding, a signed-out user lands on the login page', (tester) async {
    SharedPreferences.setMockInitialValues({'onboarding_completed': true});

    await startApp(tester);

    expect(find.byType(LoginPage), findsOneWidget);
    await stopApp(tester);
  });

  testWidgets('the app title is set for the OS task switcher', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const ProviderScope(child: MyApp()));

    expect(tester.widget<MaterialApp>(find.byType(MaterialApp)).title, isNotEmpty);
    await tester.pump(const Duration(seconds: 4));
    await stopApp(tester);
  });
}
