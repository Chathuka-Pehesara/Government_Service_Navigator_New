import 'package:flutter/material.dart';
import 'citizen_assistant_chat_screen.dart';

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
    return CitizenAssistantChatScreen(
      serviceProcedureId: serviceId,
      serviceName: serviceName,
    );
  }
}
