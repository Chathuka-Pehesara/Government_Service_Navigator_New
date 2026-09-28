import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/agent2_statutory_auditor_screen.dart';

void main() {
  testWidgets('Agent2StatutoryAuditorScreen renders redesigned UI safely without errors', (tester) async {
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

    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Agent 2: Statutory Policy Auditor'), findsOneWidget);
    expect(find.text('Select Government Service to Audit'), findsOneWidget);
    expect(find.text('Applicant Statutory Profile'), findsOneWidget);
    expect(find.text('Available Evidentiary Documents'), findsOneWidget);
    expect(find.text('Run Agent 2 Statutory Audit'), findsOneWidget);
  });
}
