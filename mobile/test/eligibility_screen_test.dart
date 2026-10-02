import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/agent2_statutory_auditor_screen.dart';

void main() {
  testWidgets('Agent2StatutoryAuditorScreen renders its sections', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);
    // The block-glyph test font is far wider than the app's fonts, so ignore text-row overflows here
    final original = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed')) return;
      original?.call(details);
    };
    addTearDown(() => FlutterError.onError = original);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Agent2StatutoryAuditorScreen(
            serviceId: 24,
            serviceName: 'National Identity Card (NIC) Issuance & Replacement',
          ),
        ),
      ),
    );

    // The screen loads data over HTTP (which the test binding answers with 400) and shows a
    // spinner that never settles, so advance the clock instead of pumpAndSettle
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Statutory Eligibility & Compliance Auditor'), findsOneWidget);
    // No services come back without a network, so the selector keeps its loading state
    expect(find.text('Loading system services...'), findsOneWidget);
    expect(find.text('Applicant Statutory Profile'), findsOneWidget);
    expect(find.text('Upload Evidentiary Documents'), findsOneWidget);
    expect(find.text('Run Statutory Eligibility Audit'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
