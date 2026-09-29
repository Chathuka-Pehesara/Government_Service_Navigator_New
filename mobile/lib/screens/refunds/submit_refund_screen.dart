import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/refund_providers.dart';
import '../../providers/service_providers.dart';
import '../../utils/validators.dart';
import 'my_refunds_screen.dart';

class SubmitRefundScreen extends ConsumerStatefulWidget {
  final String? prefillPaymentId;

  const SubmitRefundScreen({
    super.key,
    this.prefillPaymentId,
  });

  @override
  ConsumerState<SubmitRefundScreen> createState() => _SubmitRefundScreenState();
}

class _SubmitRefundScreenState extends ConsumerState<SubmitRefundScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _paymentIdController;
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _reasonController = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    _paymentIdController =
        TextEditingController(text: widget.prefillPaymentId ?? '');
  }

  @override
  void dispose() {
    _paymentIdController.dispose();
    _amountController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(refundServiceProvider).submitRefund(
        paymentId: _paymentIdController.text.trim(),
        refundAmount: double.parse(_amountController.text.trim()),
        reason: _reasonController.text.trim(),
      );
      if (!mounted) return;
      ref.invalidate(myRefundsProvider);
      setState(() => _submitted = true);
    } catch (e) {
      if (mounted) setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Request Refund'),
        backgroundColor: AppColors.cardBg,
        elevation: 0,
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.of(context).pop(),
          child: const Icon(CupertinoIcons.chevron_left,
              color: AppColors.primary),
        ),
      ),
      body: SafeArea(
        child: _submitted ? _buildSuccess() : _buildForm(),
      ),
    );
  }

  Widget _buildSuccess() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(CupertinoIcons.checkmark_circle_fill,
                  color: AppColors.success, size: 44),
            ),
            const SizedBox(height: 20),
            const Text(
              'Refund Submitted',
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark),
            ),
            const SizedBox(height: 8),
            const Text(
              'Your refund request has been received. We\'ll update you on its status.',
              textAlign: TextAlign.center,
              style:
                  TextStyle(fontSize: 15, color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: CupertinoButton.filled(
                borderRadius: BorderRadius.circular(14),
                onPressed: () {
                  Navigator.of(context).pushReplacement(
                    CupertinoPageRoute(
                      builder: (_) => const MyRefundsScreen(),
                    ),
                  );
                },
                child: const Text(
                  'View My Refunds',
                  style: TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Info banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: AppColors.warning.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.info_circle,
                      color: AppColors.warning, size: 20),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Refund requests are reviewed within 3–5 business days.',
                      style: TextStyle(
                          color: AppColors.warning, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            _buildLabel('Payment ID'),
            const SizedBox(height: 8),
            _buildField(
              controller: _paymentIdController,
              hint: 'e.g. 1024',
              icon: CupertinoIcons.creditcard,
              validator: (v) => Validators.number(v, field: 'Payment ID', min: 1),
            ),
            const SizedBox(height: 16),

            _buildLabel('Refund Amount (LKR)'),
            const SizedBox(height: 8),
            _buildField(
              controller: _amountController,
              hint: 'e.g. 1500.00',
              icon: CupertinoIcons.money_dollar_circle,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              validator: Validators.amount,
            ),
            const SizedBox(height: 16),

            _buildLabel('Reason'),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: AppColors.cardBg,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.divider, width: 0.8),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: TextFormField(
                  controller: _reasonController,
                  maxLines: 4,
                  style: const TextStyle(fontSize: 16, color: AppColors.dark),
                  decoration: const InputDecoration(
                    hintText:
                        'Describe why you are requesting a refund...',
                    hintStyle: TextStyle(
                        color: AppColors.secondaryLabel, fontSize: 15),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                  ),
                  maxLength: 1000,
                  validator: (v) => Validators.text(v, field: 'Reason', min: 10, max: 1000),
                ),
              ),
            ),
            const SizedBox(height: 24),

            if (_errorMessage != null) ...[
              _buildErrorBanner(_errorMessage!),
              const SizedBox(height: 16),
            ],

            SizedBox(
              width: double.infinity,
              height: 52,
              child: CupertinoButton.filled(
                borderRadius: BorderRadius.circular(14),
                onPressed: _isLoading ? null : _submit,
                child: _isLoading
                    ? const CupertinoActivityIndicator(
                        color: Colors.white, radius: 11)
                    : const Text(
                        'Submit Refund Request',
                        style: TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.secondaryLabel,
        letterSpacing: 0.2,
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    String? Function(String?)? validator,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          style: const TextStyle(fontSize: 16, color: AppColors.dark),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle:
                const TextStyle(color: AppColors.secondaryLabel, fontSize: 16),
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            prefixIcon: Icon(icon, color: AppColors.primary, size: 20),
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
          ),
          validator: validator,
        ),
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.exclamationmark_circle,
              color: AppColors.danger, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message,
                style:
                    const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
