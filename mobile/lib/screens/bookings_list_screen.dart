import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'booking_options_screen.dart';

class BookingsListScreen extends StatelessWidget {
  const BookingsListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Mock data: In a real scenario, fetch where stageStatus == 'Completed' and currentStage == maxStages
    final completedServices = [
      {'id': 'APP-9088', 'serviceName': 'Passport Issuance & Renewal', 'dateCompleted': '2026-09-27'},
      {'id': 'APP-9102', 'serviceName': 'National Identity Card (NIC) Issue', 'dateCompleted': '2026-09-25'},
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Completed Services'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: completedServices.length,
        itemBuilder: (context, index) {
          final service = completedServices[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(CupertinoIcons.checkmark_seal_fill, color: AppColors.success),
              ),
              title: Text(
                service['serviceName']!,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              subtitle: Text('Ref: ${service['id']} • Completed: ${service['dateCompleted']}'),
              trailing: const Icon(CupertinoIcons.chevron_right, size: 18),
              onTap: () {
                Navigator.of(context).push(
                  CupertinoPageRoute(
                    builder: (_) => BookingOptionsScreen(
                      applicationId: service['id']!,
                      serviceName: service['serviceName']!,
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
