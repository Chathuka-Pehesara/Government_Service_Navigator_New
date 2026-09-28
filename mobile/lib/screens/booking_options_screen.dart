import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../theme/app_colors.dart';
import 'post_service_form_screen.dart';

class BookingOptionsScreen extends StatefulWidget {
  final String applicationId;
  final String serviceName;
  final String? citizenNic;
  final VoidCallback? onPostalSubmitted;
  final ValueChanged<Map<String, dynamic>>? onAppointmentBooked;

  const BookingOptionsScreen({
    super.key,
    required this.applicationId,
    required this.serviceName,
    this.citizenNic,
    this.onPostalSubmitted,
    this.onAppointmentBooked,
  });

  @override
  State<BookingOptionsScreen> createState() => _BookingOptionsScreenState();
}

class _BookingOptionsScreenState extends State<BookingOptionsScreen> {
  String? _selectedOption;
  final TextEditingController _timeController = TextEditingController();

  bool _isBooking = false;
  Map<String, dynamic>? _bookingResult;
  String? _bookingError;

  String _getAssignedDepartment() {
    final lower = widget.serviceName.toLowerCase();
    if (lower.contains('passport') || lower.contains('immigration')) {
      return 'Department of Immigration & Emigration';
    }
    if (lower.contains('nic') || lower.contains('identity')) {
      return 'Department of Registration of Persons';
    }
    if (lower.contains('driving') || lower.contains('license') || lower.contains('motor')) {
      return 'Department of Motor Traffic';
    }
    if (lower.contains('police') || lower.contains('clearance')) {
      return 'Sri Lanka Police Headquarters';
    }
    if (lower.contains('birth') || lower.contains('certificate')) {
      return 'Registrar General\'s Department';
    }
    return 'Department of Public Administration';
  }

  void _handlePostService() {
    Navigator.of(context).pushReplacement(
      CupertinoPageRoute(
        builder: (_) => PostServiceFormScreen(
          applicationId: widget.applicationId,
          serviceName: widget.serviceName,
          onSubmitted: widget.onPostalSubmitted,
        ),
      ),
    );
  }

  Future<void> _bookAppointment([String? overrideTime]) async {
    final timeToBook = (overrideTime ?? _timeController.text).trim();
    if (timeToBook.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your preferred appointment time.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() {
      _isBooking = true;
      _bookingError = null;
    });

    try {
      final department = _getAssignedDepartment();
      final url = Uri.parse('${AppConfig.baseUrl}/actionagent/book-appointment');
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'applicationId': widget.applicationId,
          'serviceName': widget.serviceName,
          'citizenNic': widget.citizenNic ?? 'CITIZEN',
          'preferredTimeInput': timeToBook,
          'departmentName': department,
        }),
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        setState(() {
          _bookingResult = data;
          _isBooking = false;
        });
        if (data['isBooked'] == true) {
          widget.onAppointmentBooked?.call(data);
        }
      } else {
        setState(() {
          _bookingError = 'Booking failed (${response.statusCode}): ${response.body}';
          _isBooking = false;
        });
      }
    } catch (e) {
      setState(() {
        _bookingError = 'Network or connection error: $e';
        _isBooking = false;
      });
    }
  }

  @override
  void dispose() {
    _timeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final department = _getAssignedDepartment();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Collection Options'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Service & Application Info
            Text(
              widget.serviceName,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Application ID: ${widget.applicationId}',
              style: const TextStyle(color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_balance, size: 16, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Target Desk: $department (Final Stage)',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'How would you like to receive your documents?',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),

            RadioListTile<String>(
              title: const Text('Get it with post service'),
              subtitle: const Text('Delivered directly to your registered address.'),
              value: 'post',
              groupValue: _selectedOption,
              activeColor: AppColors.primary,
              onChanged: (value) {
                setState(() => _selectedOption = value);
                _handlePostService();
              },
            ),
            const SizedBox(height: 8),

            RadioListTile<String>(
              title: const Text('Make a booking (Agent 3)'),
              subtitle: const Text('Collect in person at the department office on a free slot.'),
              value: 'book',
              groupValue: _selectedOption,
              activeColor: AppColors.primary,
              onChanged: (value) {
                setState(() => _selectedOption = value);
              },
            ),

            if (_selectedOption == 'book') ...[
              const SizedBox(height: 16),
              _buildAgent3BookingCard(department),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildAgent3BookingCard(String department) {
    final isBooked = _bookingResult?['isBooked'] == true;
    final hasResult = _bookingResult != null;
    final suggestedSlots = (_bookingResult?['suggestedSlots'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Agent 3 Header Badge
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.smart_toy_rounded, size: 20, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Agent 3: Appointment Booking Agent',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                    Text(
                      'Enter your preferred time freely in any style.',
                      style: TextStyle(fontSize: 11, color: AppColors.secondaryLabel),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Confirmed Booking Card State
          if (isBooked) ...[
            _buildConfirmedCard(),
            const SizedBox(height: 14),
          ],

          // Unavailable Slot Alert with Suggestions State
          if (hasResult && !isBooked) ...[
            _buildUnavailableCard(suggestedSlots),
            const SizedBox(height: 14),
          ],

          if (_bookingError != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _bookingError!,
                style: const TextStyle(color: AppColors.danger, fontSize: 12),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Natural language input & controls (shown when not yet booked or when re-booking)
          if (!isBooked) ...[
            const Text(
              'Preferred Collection Time (Type freely):',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.dark),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _timeController,
              decoration: InputDecoration(
                hintText: 'e.g., Tomorrow at 2:30 PM, Monday 10am, or Friday afternoon...',
                filled: true,
                fillColor: AppColors.background,
                isDense: true,
                suffixIcon: _timeController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 16),
                        onPressed: () => setState(() => _timeController.clear()),
                      )
                    : null,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.divider),
                ),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),

            // Quick suggestion chips
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildQuickTimeChip('Tomorrow 10:00 AM'),
                  const SizedBox(width: 6),
                  _buildQuickTimeChip('Tomorrow 2:30 PM'),
                  const SizedBox(width: 6),
                  _buildQuickTimeChip('Next Monday 11:00 AM'),
                  const SizedBox(width: 6),
                  _buildQuickTimeChip('Friday 3:00 PM'),
                ],
              ),
            ),
            const SizedBox(height: 16),

            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: _isBooking ? null : () => _bookAppointment(),
              child: _isBooking
                  ? const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        ),
                        SizedBox(width: 10),
                        Text('Agent 3 Checking Department Slots...', style: TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.calendar_month_rounded, size: 18),
                        SizedBox(width: 8),
                        Text('Book Appointment with Agent 3', style: TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQuickTimeChip(String text) {
    return ActionChip(
      label: Text(text, style: const TextStyle(fontSize: 11)),
      visualDensity: VisualDensity.compact,
      onPressed: () {
        setState(() {
          _timeController.text = text;
        });
      },
    );
  }

  Widget _buildConfirmedCard() {
    final code = _bookingResult?['confirmationCode'] ?? 'SL-APT-0000';
    final date = _bookingResult?['bookedDate'] ?? 'Scheduled Date';
    final time = _bookingResult?['bookedTime'] ?? 'Scheduled Time';
    final dept = _bookingResult?['departmentName'] ?? _getAssignedDepartment();
    final reasoning = _bookingResult?['agentReasoning'] ?? 'Appointment confirmed by Agent 3.';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.success.withValues(alpha: 0.4), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified_rounded, color: AppColors.success, size: 24),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Appointment Confirmed by Agent 3',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.success,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.success,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  code,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                ),
              ),
            ],
          ),
          const Divider(height: 18),
          _buildInfoRow(Icons.account_balance, 'Department', dept),
          const SizedBox(height: 6),
          _buildInfoRow(Icons.event, 'Booked Date', date),
          const SizedBox(height: 6),
          _buildInfoRow(Icons.schedule, 'Time Slot', time),
          const Divider(height: 18),
          const Text(
            'Agent 3 Confirmation Reasoning:',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.dark),
          ),
          const SizedBox(height: 4),
          Text(
            reasoning,
            style: const TextStyle(fontSize: 12, height: 1.35, color: Colors.black87),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Row(
              children: [
                Icon(Icons.mark_email_read_outlined, size: 14, color: AppColors.success),
                SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'The department collection desk has received your booking confirmation.',
                    style: TextStyle(fontSize: 11, color: AppColors.dark, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              setState(() {
                _bookingResult = null;
              });
            },
            icon: const Icon(Icons.edit_calendar, size: 14),
            label: const Text('Change or Reschedule Time', style: TextStyle(fontSize: 11)),
            style: OutlinedButton.styleFrom(
              visualDensity: VisualDensity.compact,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.check_circle_rounded, size: 16),
              label: const Text('Done • Return to Completed Services', style: TextStyle(fontWeight: FontWeight.bold)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () => Navigator.of(context).pop(_bookingResult),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUnavailableCard(List<Map<String, dynamic>> suggestedSlots) {
    final reasoning = _bookingResult?['agentReasoning'] ??
        'The requested time is not available or falls outside office hours.';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.deepOrange, size: 22),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Requested Time Unavailable',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.deepOrange,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            reasoning,
            style: const TextStyle(fontSize: 12, height: 1.35, color: Colors.black87),
          ),
          const SizedBox(height: 12),
          const Text(
            'Agent 3 Suggested Available Slots for that Day (Tap to Book):',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Colors.deepOrange,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: suggestedSlots.map((slot) {
              final label = slot['displayText'] ?? slot['timeSlot'] ?? '';
              final timeVal = slot['timeSlot'] ?? '';
              return ActionChip(
                backgroundColor: Colors.white,
                avatar: const Icon(Icons.schedule, size: 14, color: AppColors.primary),
                label: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                onPressed: () {
                  _timeController.text = timeVal;
                  _bookAppointment(timeVal);
                },
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 14, color: AppColors.secondaryLabel),
        const SizedBox(width: 6),
        Text(
          '$label: ',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryLabel),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.dark),
          ),
        ),
      ],
    );
  }
}
