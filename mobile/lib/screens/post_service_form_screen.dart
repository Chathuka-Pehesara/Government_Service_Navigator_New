import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import '../utils/validators.dart';

class PostServiceFormScreen extends StatefulWidget {
  final String applicationId;
  final String serviceName;
  final bool isAlreadySubmitted;
  final VoidCallback? onSubmitted;

  const PostServiceFormScreen({
    super.key,
    required this.applicationId,
    required this.serviceName,
    this.isAlreadySubmitted = false,
    this.onSubmitted,
  });

  @override
  State<PostServiceFormScreen> createState() => _PostServiceFormScreenState();
}

class _PostServiceFormScreenState extends State<PostServiceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  
  late bool _isSubmitted;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _isSubmitted = widget.isAlreadySubmitted; 
  }

  @override
  void dispose() {
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submitDetails() {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isSubmitted = true;
        });
        widget.onSubmitted?.call(); 
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Postal Delivery'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: _isSubmitted ? _buildTrackingView() : _buildFormView(),
    );
  }

  Widget _buildFormView() {
    return Form(
      key: _formKey,
      child: ListView(
      padding: const EdgeInsets.all(16.0),
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
          'Delivery Information',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.dark),
        ),
        const SizedBox(height: 16),
        
        const Text('Delivery Address', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryLabel)),
        const SizedBox(height: 8),
        TextFormField(
          controller: _addressController,
          maxLines: 4,
          maxLength: 300,
          validator: (v) => Validators.text(v, field: 'Delivery address', min: 10, max: 300),
          decoration: InputDecoration(
            hintText: 'Enter full residential or office address...',
            filled: true,
            fillColor: AppColors.background,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.divider),
            ),
          ),
        ),
        const SizedBox(height: 16),

        const Text('Mobile Number', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.secondaryLabel)),
        const SizedBox(height: 8),
        TextFormField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          validator: Validators.phone,
          decoration: InputDecoration(
            hintText: 'e.g., 077 123 4567',
            filled: true,
            fillColor: AppColors.background,
            prefixIcon: const Icon(CupertinoIcons.phone, size: 20, color: AppColors.secondaryLabel),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.divider),
            ),
          ),
        ),
        const SizedBox(height: 32),

        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: _isLoading ? null : _submitDetails,
          child: _isLoading 
            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : const Text('Confirm Delivery Details', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        ),
      ],
      ),
    );
  }

  Widget _buildTrackingView() {
    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.success.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              const Icon(CupertinoIcons.checkmark_seal_fill, color: AppColors.success, size: 48),
              const SizedBox(height: 16),
              const Text(
                'Delivery Requested Successfully!',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.dark),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'You will receive your ${widget.serviceName} within 6 to 7 working days.',
                style: const TextStyle(fontSize: 13, color: AppColors.secondaryLabel, height: 1.4),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        
        const Text(
          'Live Tracking Status',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.dark),
        ),
        const SizedBox(height: 24),
        
        _buildTrackingStep('Prepared at Office', 'Your document is being packaged.', true, isLast: false),
        _buildTrackingStep('Handed to Postal Service', 'Awaiting courier pickup.', false, isLast: false),
        _buildTrackingStep('Out for Delivery', 'Courier is en route to your address.', false, isLast: false),
        _buildTrackingStep('Delivered', 'Package dropped off.', false, isLast: true),
      ],
    );
  }

  Widget _buildTrackingStep(String title, String subtitle, bool isActive, {required bool isLast}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: isActive ? AppColors.primary : AppColors.divider,
                shape: BoxShape.circle,
                border: isActive ? Border.all(color: AppColors.primary.withValues(alpha: 0.3), width: 4) : null,
              ),
              child: isActive 
                  ? const Icon(CupertinoIcons.checkmark_alt, size: 12, color: Colors.white)
                  : null,
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 40,
                color: isActive ? AppColors.primary : AppColors.divider,
              ),
          ],
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 14, 
                  fontWeight: isActive ? FontWeight.bold : FontWeight.w600,
                  color: isActive ? AppColors.primary : AppColors.secondaryLabel,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }
}
