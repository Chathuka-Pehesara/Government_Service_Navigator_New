import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../theme/app_colors.dart';
import 'procedure_detail_screen.dart';

class DepartmentServicesScreen extends StatelessWidget {
  final String department;
  final List<Map<String, dynamic>> services;

  const DepartmentServicesScreen({
    super.key,
    required this.department,
    required this.services,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(department),
        backgroundColor: AppColors.cardBg,
        elevation: 0,
      ),
      body: services.isEmpty
          ? const Center(child: Text('No services found for this department.'))
          : ListView.separated(
              itemCount: services.length,
              separatorBuilder: (context, index) => const Divider(height: 1, thickness: 0.8),
              itemBuilder: (context, index) {
                final service = services[index];
                final fees = service['feeSchedules'] as List? ?? [];
                final feeString = fees.isNotEmpty ? 'LKR ${fees[0]['amount']}' : 'Free';

                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  leading: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(CupertinoIcons.doc_text, color: AppColors.primary, size: 20),
                  ),
                  title: Text(
                    service['name'] ?? 'Untitled Service',
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.dark,
                    ),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4.0),
                    child: Text(
                      '${service['serviceId'] ?? department}  •  Fee: $feeString',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.secondaryLabel,
                      ),
                    ),
                  ),
                  trailing: const Icon(
                    CupertinoIcons.chevron_right,
                    size: 14,
                    color: AppColors.secondaryLabel,
                  ),
                  onTap: () {
                    Navigator.push(
                      context,
                      CupertinoPageRoute(
                        builder: (context) => ProcedureDetailScreen(
                          serviceId: service['id'],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}
