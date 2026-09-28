import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';

class BookingOptionsScreen extends StatefulWidget {
  final String applicationId;
  final String serviceName;

  const BookingOptionsScreen({
    super.key,
    required this.applicationId,
    required this.serviceName,
  });

  @override
  State<BookingOptionsScreen> createState() => _BookingOptionsScreenState();
}

class _BookingOptionsScreenState extends State<BookingOptionsScreen> {
  String? _selectedOption;
  final TextEditingController _timeController = TextEditingController();

  void _handlePostService() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Post Service Selected'),
        content: const Text('You will get it within 7 or 14 days.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop(); // Return to previous screen
            },
            child: const Text('Understood'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _timeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Collection Options'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.serviceName,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Application ID: ${widget.applicationId}',
              style: const TextStyle(color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 32),
            const Text(
              'How would you like to receive your documents?',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            
            // Option 1: Post Service
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

            // Option 2: Make a Booking
            RadioListTile<String>(
              title: const Text('Make a booking'),
              subtitle: const Text('Collect in person at the department office.'),
              value: 'book',
              groupValue: _selectedOption,
              activeColor: AppColors.primary,
              onChanged: (value) {
                setState(() => _selectedOption = value);
              },
            ),

            // Type Box for Available Times (Only visible if 'book' is selected)
            if (_selectedOption == 'book') ...[
              const SizedBox(height: 24),
              const Text(
                'Enter your available times',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.dark),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _timeController,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'e.g., Monday mornings, or specific dates like 2026-10-05 after 2 PM...',
                  filled: true,
                  fillColor: AppColors.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: AppColors.divider),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  // TODO: Submit time preferences to the backend
                },
                child: const Text('Submit Availability', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ]
          ],
        ),
      ),
    );
  }
}
