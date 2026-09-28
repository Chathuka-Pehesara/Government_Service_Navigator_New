import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'booking_options_screen.dart';
import 'post_service_form_screen.dart';

class BookingsListScreen extends StatefulWidget {
  const BookingsListScreen({super.key});

  @override
  State<BookingsListScreen> createState() => _BookingsListScreenState();
}

class _BookingsListScreenState extends State<BookingsListScreen> {
  // Mock state to track which apps have already requested postal delivery
  final Set<String> _postalRequestedApps = {};

  final List<Map<String, String>> _completedServices = [
    {'id': 'APP-9088', 'serviceName': 'Passport Issuance & Renewal', 'dateCompleted': '2026-09-27'},
    {'id': 'APP-9102', 'serviceName': 'National Identity Card (NIC) Issue', 'dateCompleted': '2026-09-25'},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Completed Services'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _completedServices.length,
        itemBuilder: (context, index) {
          final service = _completedServices[index];
          final appId = service['id']!;
          final isPostalRequested = _postalRequestedApps.contains(appId);

          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (isPostalRequested ? AppColors.primary : AppColors.success).withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isPostalRequested ? CupertinoIcons.cube_box_fill : CupertinoIcons.checkmark_seal_fill, 
                  color: isPostalRequested ? AppColors.primary : AppColors.success
                ),
              ),
              title: Text(
                service['serviceName']!,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              subtitle: Text(isPostalRequested 
                  ? 'Ref: $appId • Postal Delivery Tracked' 
                  : 'Ref: $appId • Completed: ${service['dateCompleted']}'),
              trailing: const Icon(CupertinoIcons.chevron_right, size: 18),
              onTap: () {
                if (isPostalRequested) {
                  // Direct to tracking page if already submitted
                  Navigator.of(context).push(
                    CupertinoPageRoute(
                      builder: (_) => PostServiceFormScreen(
                        applicationId: appId,
                        serviceName: service['serviceName']!,
                        isAlreadySubmitted: true, // Start directly in tracking mode
                      ),
                    ),
                  );
                } else {
                  // Go to options page if not submitted yet
                  Navigator.of(context).push(
                    CupertinoPageRoute(
                      builder: (_) => BookingOptionsScreen(
                        applicationId: appId,
                        serviceName: service['serviceName']!,
                        onPostalSubmitted: () {
                          setState(() {
                            _postalRequestedApps.add(appId);
                          });
                        },
                      ),
                    ),
                  );
                }
              },
            ),
          );
        },
      ),
    );
  }
}
