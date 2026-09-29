import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/payment_providers.dart';
import '../../providers/service_providers.dart';
import '../../providers/session_provider.dart';
import '../../utils/validators.dart';
import 'checkout_webview_screen.dart';
import 'payment_confirm_screen.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  final String? prefillApplicationId;

  const CheckoutScreen({
    super.key,
    this.prefillApplicationId,
  });

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _applicationIdController;
  final TextEditingController _amountController = TextEditingController();
  late final TextEditingController _emailController;

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _applicationIdController =
        TextEditingController(text: widget.prefillApplicationId ?? '');
    _emailController = TextEditingController(text: ref.read(sessionProvider).email);
  }

  @override
  void dispose() {
    _applicationIdController.dispose();
    _amountController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final result = await ref.read(paymentServiceProvider).checkout(
        applicationId: _applicationIdController.text.trim(),
        amount: double.parse(_amountController.text.trim()),
        userEmail: _emailController.text.trim(),
      );
      if (!mounted) return;
      ref.invalidate(myPaymentsProvider);
      setState(() => _isLoading = false);

      final completed = await Navigator.of(context).push<bool>(
        CupertinoPageRoute(
          builder: (_) => CheckoutWebViewScreen(checkoutUrl: result.checkoutUrl),
        ),
      );
      if (!mounted) return;
      if (completed != true) {
        setState(() => _errorMessage = 'Stripe checkout was not completed. Tap Proceed to Payment to try again.');
        return;
      }

      // The confirmation screen asks the API to verify the session with Stripe (which also emails the receipt)
      Navigator.of(context).pushReplacement(
        CupertinoPageRoute(
          builder: (_) => PaymentConfirmScreen(paymentId: result.paymentId),
        ),
      );
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Checkout'),
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
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.25),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(CupertinoIcons.creditcard,
                            color: Colors.white, size: 24),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Payment Checkout',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Complete your government service payment securely.',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Fields
                _buildLabel('Application ID'),
                const SizedBox(height: 8),
                _buildField(
                  controller: _applicationIdController,
                  hint: 'e.g. APP-2026-8841',
                  icon: CupertinoIcons.doc_text,
                  validator: Validators.applicationId,
                ),
                const SizedBox(height: 16),

                _buildLabel('Amount (LKR)'),
                const SizedBox(height: 8),
                _buildField(
                  controller: _amountController,
                  hint: 'e.g. 2500.00',
                  icon: CupertinoIcons.money_dollar_circle,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  validator: Validators.amount,
                ),
                const SizedBox(height: 16),

                _buildLabel('Receipt Email (your login email)'),
                const SizedBox(height: 8),
                _buildField(
                  controller: _emailController,
                  hint: 'your@email.com',
                  icon: CupertinoIcons.mail,
                  keyboardType: TextInputType.emailAddress,
                  readOnly: true,
                  validator: Validators.email,
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
                            'Proceed to Payment',
                            style: TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w600),
                          ),
                  ),
                ),
              ],
            ),
          ),
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
    bool readOnly = false,
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
          readOnly: readOnly,
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
                style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
