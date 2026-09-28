import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/eligibility_self_check_screen.dart';

void main() {
  testWidgets('EligibilitySelfCheckScreen renders redesigned UI safely without errors', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: EligibilitySelfCheckScreen(
            serviceId: 24,
            serviceName: 'National Identity Card (NIC) Issuance & Replacement',
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Agent 2: Eligibility & Document Check'), findsOneWidget);
    expect(find.text('Agent 2 • Statutory Eligibility Audit'), findsOneWidget);
    expect(find.text('Target Government Service'), findsOneWidget);
    expect(find.text('Applicant Statutory Demographics'), findsOneWidget);
    expect(find.text('Evidentiary Documents'), findsOneWidget);
    expect(find.text('Live Statutory Criteria Checklist'), findsOneWidget);
    expect(find.text('Consult Agent 2 RAG Engine'), findsOneWidget);
  });
}
