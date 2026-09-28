import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/eligibility_self_check_screen.dart';
import 'package:mobile/providers/catalog_providers.dart';

void main() {
  testWidgets('EligibilitySelfCheckScreen when servicesProvider throws error', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          servicesProvider.overrideWith((ref) => Future.error(Exception('Connection refused'))),
        ],
        child: const MaterialApp(
          home: EligibilitySelfCheckScreen(serviceId: 24),
        ),
      ),
    );

    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Target Service Name'), findsOneWidget);
  });

  testWidgets('EligibilitySelfCheckScreen when servicesProvider returns empty list', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          servicesProvider.overrideWith((ref) async => <Map<String, dynamic>>[]),
        ],
        child: const MaterialApp(
          home: EligibilitySelfCheckScreen(serviceId: 24),
        ),
      ),
    );

    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('Target Service Name'), findsOneWidget);
  });
}
