import 'package:flutter/material.dart';
import 'agent2_statutory_auditor_screen.dart';

class EligibilitySelfCheckScreen extends StatelessWidget {
  final int serviceId;
  final String serviceName;

  const EligibilitySelfCheckScreen({
    super.key,
    required this.serviceId,
    this.serviceName = 'National Identity Card (NIC) Issuance & Replacement',
  });

  @override
  Widget build(BuildContext context) {
    return Agent2StatutoryAuditorScreen(
      serviceId: serviceId,
      serviceName: serviceName,
    );
  }
}
