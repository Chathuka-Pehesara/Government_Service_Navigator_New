import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../providers/application_providers.dart';
import '../theme/app_colors.dart';
import '../providers/session_provider.dart';
import 'booking_options_screen.dart';
import 'post_service_form_screen.dart';

class BookingsListScreen extends ConsumerStatefulWidget {
  const BookingsListScreen({super.key});

  @override
  ConsumerState<BookingsListScreen> createState() => _BookingsListScreenState();
}

class _BookingsListScreenState extends ConsumerState<BookingsListScreen> {
  // Track apps that have requested postal delivery
  final Set<String> _postalRequestedApps = {};

  // Confirmed appointments from Agent 3 keyed by Application Code
  final Map<String, Map<String, dynamic>> _bookingsByAppCode = {};
  bool _isLoadingBookings = false;

  // Static completed services fallback so demo is always rich and testable
  final List<Map<String, String>> _fallbackCompletedServices = [
    {
      'id': 'APP-9088',
      'serviceName': 'Passport Issuance and Renewal',
      'dateCompleted': '2026-09-28',
      'department': 'Department of Immigration & Emigration'
    },
    {
      'id': 'APP-4011',
      'serviceName': 'Driving License Renewal',
      'dateCompleted': '2026-09-27',
      'department': 'Department of Motor Traffic'
    },
    {
      'id': 'APP-9102',
      'serviceName': 'National Identity Card (NIC) Issue',
      'dateCompleted': '2026-09-25',
      'department': 'Department of Registration of Persons'
    },
  ];

  @override
  void initState() {
    super.initState();
    _fetchBookings();
  }

  Future<void> _fetchBookings() async {
    setState(() => _isLoadingBookings = true);
    try {
      final url = Uri.parse('${AppConfig.baseUrl}/admin/collection-slots/bookings');
      final res = await http.get(url).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final list = jsonDecode(res.body) as List<dynamic>;
        final Map<String, Map<String, dynamic>> map = {};

        for (final item in list) {
          if (item is Map<String, dynamic>) {
            final appCode = item['applicationCode']?.toString();
            final appId = item['id']?.toString();
            if (appCode != null && appCode.isNotEmpty) {
              map[appCode.toUpperCase()] = item;
            }
            if (appId != null && appId.isNotEmpty) {
              map['APP-$appId'.toUpperCase()] = item;
            }
          }
        }

        if (mounted) {
          setState(() {
            _bookingsByAppCode.addAll(map);
            _isLoadingBookings = false;
          });
        }
      } else {
        if (mounted) setState(() => _isLoadingBookings = false);
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingBookings = false);
    }
  }

  void _showCollectionPass(Map<String, dynamic> booking, String serviceName) {
    final code = booking['confirmationCode'] ?? 'SL-APT-0000';
    final date = booking['bookedDate'] ?? '';
    final time = booking['bookedSlotTime'] ?? 'Scheduled Window';
    final dept = booking['departmentName'] ?? 'Government Department';
    final notes = booking['agentNotes'] ?? '';
    final prefTime = booking['preferredTimes'] ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Theme.of(ctx).scaffoldBackgroundColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Pass Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.confirmation_number_rounded, color: AppColors.primary, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Official Collection Pass',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      Text(
                        dept,
                        style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Confirmed',
                    style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Pass Details Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(ctx).cardColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.divider),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(serviceName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const Divider(height: 20),

                  // Confirmation Reference
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Statutory Booking Ref:', style: TextStyle(fontSize: 12, color: AppColors.secondaryLabel)),
                      Row(
                        children: [
                          Text(code, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary)),
                          IconButton(
                            icon: const Icon(Icons.copy_rounded, size: 16),
                            visualDensity: VisualDensity.compact,
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: code));
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                const SnackBar(content: Text('Booking reference copied to clipboard!'), duration: Duration(seconds: 1)),
                              );
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Scheduled Date & Time
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.schedule_rounded, size: 16, color: AppColors.secondaryLabel),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          date.isNotEmpty ? '$date • $time' : time,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Collection Desk
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.location_on_outlined, size: 16, color: AppColors.secondaryLabel),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '$dept — Counter Collection Desk',
                          style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                        ),
                      ),
                    ],
                  ),

                  if (prefTime.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.record_voice_over_outlined, size: 16, color: AppColors.secondaryLabel),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Citizen request: "$prefTime"',
                            style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: AppColors.secondaryLabel),
                          ),
                        ),
                      ],
                    ),
                  ],

                  if (notes.isNotEmpty) ...[
                    const Divider(height: 20),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        notes,
                        style: const TextStyle(fontSize: 12, height: 1.3),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Close Pass
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Close Pass', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  /// Signed-in citizen's NIC, sent with bookings so the department admin can identify them.
  /// Null lets the backend take it from the application.
  String? get _citizenNic {
    final user = ref.read(sessionProvider).user;
    final nic = (user?['nicNumber'] ?? user?['nic'] ?? user?['citizenNic'])?.toString();
    return (nic == null || nic.isEmpty) ? null : nic;
  }

  @override
  Widget build(BuildContext context) {
    // Read live applications
    final appsAsync = ref.watch(myApplicationsProvider);
    final liveApps = appsAsync.value ?? [];

    // Filter completed or approved applications
    final List<Map<String, String>> displayedServices = [];
    final Set<String> seenIds = {};

    for (final app in liveApps) {
      final status = app.status.toLowerCase();
      final isCompleted = status == 'approved' || status == 'completed' || app.currentStage >= app.maxStages;
      if (isCompleted) {
        final id = 'APP-${app.applicationId}';
        seenIds.add(id);
        final dateStr = '${app.submittedDate.year}-${app.submittedDate.month.toString().padLeft(2, '0')}-${app.submittedDate.day.toString().padLeft(2, '0')}';
        displayedServices.add({
          'id': id,
          'serviceName': app.serviceName,
          'dateCompleted': dateStr,
          'department': app.department ?? app.currentDepartment ?? 'General Services',
        });
      }
    }

    // Include fallback/demo services so user always has items to test
    for (final fallback in _fallbackCompletedServices) {
      if (!seenIds.contains(fallback['id'])) {
        displayedServices.add(fallback);
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Completed Services & Bookings'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: _isLoadingBookings
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh Bookings',
            onPressed: () {
              ref.invalidate(myApplicationsProvider);
              _fetchBookings();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myApplicationsProvider);
          await _fetchBookings();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Header stats banner
            Container(
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.25),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.verified_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Document Collection Desks',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${displayedServices.length} completed application(s) eligible for in-person appointment or postal dispatch.',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // List of completed services
            ...displayedServices.map((service) {
              final appId = service['id']!;
              final serviceName = service['serviceName']!;
              final dateCompleted = service['dateCompleted']!;
              final dept = service['department'] ?? 'Department Desk';

              final booking = _bookingsByAppCode[appId.toUpperCase()];
              final isBooked = booking != null;
              final isPostalRequested = _postalRequestedApps.contains(appId);

              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top Service Row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: (isBooked
                                      ? AppColors.success
                                      : (isPostalRequested ? AppColors.primary : Colors.amber))
                                  .withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              isBooked
                                  ? Icons.calendar_month_rounded
                                  : (isPostalRequested ? CupertinoIcons.cube_box_fill : Icons.task_alt_rounded),
                              color: isBooked
                                  ? AppColors.success
                                  : (isPostalRequested ? AppColors.primary : Colors.amber.shade800),
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  serviceName,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  'Ref: $appId • Completed: $dateCompleted',
                                  style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 14),
                      const Divider(height: 1),
                      const SizedBox(height: 14),

                      // 1. Case A: Appointment Confirmed with Agent 3
                      if (isBooked) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 16),
                                  const SizedBox(width: 6),
                                  const Text(
                                    'In-Person Slot Confirmed (Agent 3)',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 12,
                                      color: AppColors.success,
                                    ),
                                  ),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AppColors.primary,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      booking['confirmationCode'] ?? 'SL-APT-0000',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),

                              // Date & Time
                              Row(
                                children: [
                                  const Icon(Icons.access_time_rounded, size: 14, color: AppColors.secondaryLabel),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      booking['bookedSlotTime'] ?? 'Scheduled Slot',
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),

                              // Department Desk
                              Row(
                                children: [
                                  const Icon(Icons.apartment_rounded, size: 14, color: AppColors.secondaryLabel),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      booking['departmentName'] ?? dept,
                                      style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),

                        // Action Buttons for Booked Slot
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                icon: const Icon(Icons.qr_code_rounded, size: 16),
                                label: const Text('View Collection Pass'),
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () => _showCollectionPass(booking, serviceName),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              icon: const Icon(Icons.edit_calendar_rounded, size: 18),
                              tooltip: 'Reschedule Slot',
                              onPressed: () {
                                Navigator.of(context).push(
                                  CupertinoPageRoute(
                                    builder: (_) => BookingOptionsScreen(
                                      applicationId: appId,
                                      citizenNic: _citizenNic,
                                      serviceName: serviceName,
                                      departmentName: dept,
                                      isReschedule: true,
                                      onAppointmentBooked: (newBooking) {
                                        setState(() {
                                          _bookingsByAppCode[appId.toUpperCase()] = newBooking;
                                        });
                                        _fetchBookings();
                                      },
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ]

                      // 2. Case B: Postal Delivery Tracked
                      else if (isPostalRequested) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Row(
                            children: [
                              Icon(CupertinoIcons.cube_box_fill, size: 16, color: AppColors.primary),
                              SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Postal Delivery Requested • Tracking active',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.primary),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.local_shipping_outlined, size: 16),
                            label: const Text('Track Postal Delivery'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () {
                              Navigator.of(context).push(
                                CupertinoPageRoute(
                                  builder: (_) => PostServiceFormScreen(
                                    applicationId: appId,
                                    serviceName: serviceName,
                                    isAlreadySubmitted: true,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ]

                      // 3. Case C: Ready for Collection (No Slot Booked Yet)
                      else ...[
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.amber.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.info_outline_rounded, size: 16, color: Colors.amber.shade800),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Ready for Collection. Please reserve an appointment slot with Agent 3 or choose postal delivery.',
                                  style: TextStyle(fontSize: 11, color: Colors.amber.shade900),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.calendar_month_rounded, size: 16),
                            label: const Text('Book Collection Slot (Agent 3)'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () {
                              Navigator.of(context).push(
                                CupertinoPageRoute(
                                  builder: (_) => BookingOptionsScreen(
                                    applicationId: appId,
                                    citizenNic: _citizenNic,
                                    serviceName: serviceName,
                                    departmentName: dept,
                                    onPostalSubmitted: () {
                                      setState(() => _postalRequestedApps.add(appId));
                                    },
                                    onAppointmentBooked: (newBooking) {
                                      setState(() {
                                        _bookingsByAppCode[appId.toUpperCase()] = newBooking;
                                      });
                                      _fetchBookings();
                                    },
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
