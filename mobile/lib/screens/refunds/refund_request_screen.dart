import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/payment.dart';
import '../../models/refund.dart';
import '../../providers/payment_providers.dart';
import '../../providers/refund_providers.dart';
import '../../providers/service_providers.dart';
import 'refund_detail_screen.dart';

class RefundRequestScreen extends ConsumerStatefulWidget {
  final String? paymentId;
  final double? amount;

  const RefundRequestScreen({super.key, this.paymentId, this.amount});

  @override
  ConsumerState<RefundRequestScreen> createState() =>
      _RefundRequestScreenState();
}

/// Must match RefundService.RefundWindowDays on the backend.
const int kRefundWindowDays = 7;

class _RefundRequestScreenState extends ConsumerState<RefundRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _paymentIdController;
  late final TextEditingController _amountController;
  final TextEditingController _departmentController = TextEditingController();
  final TextEditingController _reasonController = TextEditingController();

  bool _isLoading = false;
  String? _errorMessage;
  Payment? _selectedPayment;

  String get _effectivePaymentId {
    if (widget.paymentId != null && widget.paymentId!.isNotEmpty) {
      return widget.paymentId!;
    }
    final routeArgs = ModalRoute.of(context)?.settings.arguments;
    if (routeArgs is Map<String, dynamic> &&
        routeArgs.containsKey('paymentId')) {
      return routeArgs['paymentId']?.toString() ?? '';
    }
    return '';
  }

  @override
  void initState() {
    super.initState();
    _paymentIdController = TextEditingController(text: widget.paymentId ?? '');
    _amountController = TextEditingController(
      text: widget.amount != null && widget.amount! > 0
          ? widget.amount!.toStringAsFixed(2)
          : '',
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_paymentIdController.text.isEmpty && _effectivePaymentId.isNotEmpty) {
      _paymentIdController.text = _effectivePaymentId;
    }
  }

  /// Backend dates are UTC but may come without a zone suffix.
  static DateTime? _parseUtc(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final hasZone =
        raw.endsWith('Z') || RegExp(r'[+-]\d{2}:?\d{2}$').hasMatch(raw);
    return DateTime.tryParse(hasZone ? raw : '${raw}Z');
  }

  /// Paid payments still inside the refund window.
  static bool _isRefundable(Payment p) {
    if (p.status != 'Paid') return false;
    final paid = _parseUtc(p.paidDate);
    if (paid == null) return false;
    return DateTime.now().toUtc().difference(paid) <=
        const Duration(days: kRefundWindowDays);
  }

  static int _daysLeft(Payment p) {
    final deadline = _parseUtc(
      p.paidDate,
    )!.add(const Duration(days: kRefundWindowDays));
    final left = deadline.difference(DateTime.now().toUtc());
    return (left.inHours / 24).ceil().clamp(0, kRefundWindowDays);
  }

  void _selectPayment(Payment p) {
    setState(() {
      _selectedPayment = p;
      _errorMessage = null;
      _paymentIdController.text = p.id;
      _amountController.text = p.amount.toStringAsFixed(2);
      _departmentController.text = p.department ?? 'Not assigned';
    });
  }

  @override
  void dispose() {
    _paymentIdController.dispose();
    _amountController.dispose();
    _departmentController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  String _mapErrorMessage(String rawError) {
    final clean = rawError.replaceAll('Exception: ', '').trim();
    final lower = clean.toLowerCase();

    if (lower.contains('not found')) {
      return "We couldn't find that payment";
    }
    if (lower.contains('only paid payments are eligible')) {
      return "This payment isn't eligible for a refund yet";
    }
    if (lower.contains('refund window has expired') ||
        lower.contains('expired')) {
      return "Refunds must be requested within $kRefundWindowDays days of payment";
    }
    if (lower.contains('already exists') ||
        lower.contains('active refund request')) {
      return "You already have a refund request in progress for this payment";
    }
    if (lower.contains('already been refunded')) {
      return "This payment has already been refunded";
    }
    return clean;
  }

  Future<void> _onSubmitPressed() async {
    if (!_formKey.currentState!.validate()) return;
    if (!mounted) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final service = ref.read(refundServiceProvider);
      final pId = _paymentIdController.text.trim();
      final amt = double.parse(_amountController.text.trim());
      final rsn = _reasonController.text.trim();

      final refundReq = await service.submitRefund(
        paymentId: pId,
        refundAmount: amt,
        reason: rsn,
      );

      if (!mounted) return;
      ref.invalidate(myRefundsProvider);
      setState(() => _isLoading = false);

      final dept = refundReq.departmentName;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Refund request sent${dept != null && dept.isNotEmpty ? ' to $dept' : ''}. '
            'A confirmation email is on its way.',
          ),
        ),
      );

      Navigator.of(context).pushReplacement(
        CupertinoPageRoute(
          builder: (_) => RefundDetailScreen(refundId: refundReq.id),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = _mapErrorMessage(e.toString());
      });
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
          child: const Icon(
            CupertinoIcons.chevron_left,
            color: AppColors.primary,
          ),
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
                // Information card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.25),
                    ),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        CupertinoIcons.info_circle_fill,
                        color: AppColors.primary,
                        size: 22,
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Tap one of your payments below to request a refund. Refunds can only be requested within $kRefundWindowDays days of the payment date.',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.dark,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Refundable payments picker
                _buildLabel('Your Refundable Payments'),
                const SizedBox(height: 8),
                _buildPaymentPicker(),
                const SizedBox(height: 18),

                // Payment ID Input
                _buildLabel('Payment ID'),
                const SizedBox(height: 8),
                _buildInputField(
                  controller: _paymentIdController,
                  hint: 'Select a payment above',
                  icon: CupertinoIcons.creditcard_fill,
                  readOnly: true,
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return 'Select a payment to refund';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 18),

                // Department (the refund goes to this department's Finance Officer)
                _buildLabel('Department'),
                const SizedBox(height: 8),
                _buildInputField(
                  controller: _departmentController,
                  hint: 'Filled from the selected payment',
                  icon: CupertinoIcons.building_2_fill,
                  readOnly: true,
                ),
                const SizedBox(height: 18),

                // Refund Amount Input
                _buildLabel('Refund Amount (LKR)'),
                const SizedBox(height: 8),
                _buildInputField(
                  controller: _amountController,
                  hint: 'Filled from the selected payment',
                  icon: CupertinoIcons.money_dollar_circle_fill,
                  // Always the full paid amount; the backend ignores any other value.
                  readOnly: true,
                  validator: (val) {
                    if (val == null || val.trim().isEmpty) {
                      return 'Select a payment to refund';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 18),

                // Reason Text Field
                _buildLabel('Reason for Refund'),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.divider, width: 0.8),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 4,
                    ),
                    child: TextFormField(
                      controller: _reasonController,
                      maxLines: 4,
                      style: const TextStyle(
                        fontSize: 16,
                        color: AppColors.dark,
                      ),
                      decoration: const InputDecoration(
                        hintText:
                            'Please state the detailed reason for your refund request...',
                        hintStyle: TextStyle(
                          color: AppColors.secondaryLabel,
                          fontSize: 15,
                        ),
                        border: InputBorder.none,
                      ),
                      validator: (val) {
                        if (val == null || val.trim().length < 10) {
                          return 'Reason must be at least 10 characters long';
                        }
                        return null;
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 28),

                if (_errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.danger.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.danger.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          CupertinoIcons.exclamationmark_circle_fill,
                          color: AppColors.danger,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(
                              color: AppColors.danger,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                ],

                // Submit Button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: CupertinoButton.filled(
                    borderRadius: BorderRadius.circular(14),
                    onPressed: _isLoading ? null : _onSubmitPressed,
                    child: _isLoading
                        ? const CupertinoActivityIndicator(
                            color: Colors.white,
                            radius: 11,
                          )
                        : const Text(
                            'Submit Refund Request',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                            ),
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

  /// Refunds that still count against a payment. A rejected (or failed) refund
  /// frees the payment so the citizen can ask again.
  static const _blockingRefundStatuses = {
    RefundStatus.pending,
    RefundStatus.approved,
    RefundStatus.processing,
    RefundStatus.completed,
  };

  Widget _buildPaymentPicker() {
    final paymentsAsync = ref.watch(myPaymentsProvider);
    final refundsAsync = ref.watch(myRefundsProvider);

    if (paymentsAsync.isLoading || refundsAsync.isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CupertinoActivityIndicator()),
      );
    }
    if (paymentsAsync.hasError || refundsAsync.hasError) {
      return _buildPickerMessage(
        'Could not load your payments.',
        action: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () {
            ref.invalidate(myPaymentsProvider);
            ref.invalidate(myRefundsProvider);
          },
          child: const Text('Retry', style: TextStyle(fontSize: 14)),
        ),
      );
    }

    final payments = paymentsAsync.value ?? const <Payment>[];
    final blockedPaymentIds = {
      for (final r in refundsAsync.value ?? const <RefundRequest>[])
        if (_blockingRefundStatuses.contains(r.status)) r.paymentId,
    };

    final eligible =
        payments
            .where((p) => _isRefundable(p) && !blockedPaymentIds.contains(p.id))
            .toList()
          ..sort((a, b) => (b.paidDate ?? '').compareTo(a.paidDate ?? ''));

    // A payment passed in from another screen gets pre-selected once.
    if (_selectedPayment == null && _paymentIdController.text.isNotEmpty) {
      final match = eligible.where((p) => p.id == _paymentIdController.text);
      if (match.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _selectedPayment == null) _selectPayment(match.first);
        });
      }
    }

    if (eligible.isEmpty) {
      return _buildPickerMessage(
        'You have no paid payments from the last $kRefundWindowDays days that can be refunded.',
      );
    }
    return Column(
      children: [
        for (final p in eligible) ...[
          _buildPaymentCard(p),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  Widget _buildPaymentCard(Payment p) {
    final selected = _selectedPayment?.id == p.id;
    final paid = _parseUtc(p.paidDate)!.toLocal();
    final daysLeft = _daysLeft(p);
    final paidLabel =
        '${paid.year}-${paid.month.toString().padLeft(2, '0')}-${paid.day.toString().padLeft(2, '0')}';

    return GestureDetector(
      onTap: () => _selectPayment(p),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.08)
              : AppColors.cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.divider,
            width: selected ? 1.5 : 0.8,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? CupertinoIcons.checkmark_circle_fill
                  : CupertinoIcons.circle,
              color: selected ? AppColors.primary : AppColors.secondaryLabel,
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Payment #${p.id}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.dark,
                    ),
                  ),
                  if (p.department != null && p.department!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      p.department!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.dark,
                      ),
                    ),
                  ],
                  const SizedBox(height: 2),
                  Text(
                    'Paid $paidLabel · $daysLeft ${daysLeft == 1 ? 'day' : 'days'} left to refund',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.secondaryLabel,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              'LKR ${p.amount.toStringAsFixed(2)}',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.dark,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPickerMessage(String text, {Widget? action}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.secondaryLabel,
              ),
            ),
          ),
          ?action,
        ],
      ),
    );
  }

  Widget _buildLabel(String labelText) {
    return Text(
      labelText,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.secondaryLabel,
        letterSpacing: 0.2,
      ),
    );
  }

  Widget _buildInputField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool readOnly = false,
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
          readOnly: readOnly,
          style: const TextStyle(fontSize: 16, color: AppColors.dark),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(
              color: AppColors.secondaryLabel,
              fontSize: 15,
            ),
            prefixIcon: Icon(icon, color: AppColors.primary, size: 20),
            suffixIcon: readOnly
                ? const Icon(
                    CupertinoIcons.lock_fill,
                    color: AppColors.secondaryLabel,
                    size: 16,
                  )
                : null,
            border: InputBorder.none,
          ),
          validator: validator,
        ),
      ),
    );
  }
}
