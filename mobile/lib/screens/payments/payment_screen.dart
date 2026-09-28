import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/application_providers.dart';
import '../../providers/payment_providers.dart';
import '../../providers/service_providers.dart';
import '../../providers/session_provider.dart';
import 'checkout_webview_screen.dart';
import 'installment_plan_view.dart';

class PaymentScreen extends ConsumerStatefulWidget {
  /// Overrides the signed-in user's email on the receipt.
  final String? userEmail;
  final String? applicationId;
  final double? amount;

  /// Close the screen with `true` as soon as the payment is confirmed (used by the pay-before-submit flow).
  final bool popOnPaid;

  const PaymentScreen({
    super.key,
    this.userEmail,
    this.applicationId,
    this.amount,
    this.popOnPaid = false,
  });

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  bool _isLoading = false;
  String? _resultMessage;
  bool _isSuccess = false;
  bool _isNetworkError = false;

  String? _paymentId;
  String? _checkoutUrl;
  String? _paymentStatus;
  bool _isPaid = false;

  int _paymentMethodIndex = 0; // 0 = Full Payment, 1 = Installment Plan
  int _selectedInstallments = 3; // 2, 3, 4, 6 months

  String get _effectiveUserEmail {
    if (widget.userEmail != null && widget.userEmail!.isNotEmpty) {
      return widget.userEmail!;
    }
    final routeArgs = ModalRoute.of(context)?.settings.arguments;
    if (routeArgs is Map<String, dynamic> && routeArgs.containsKey('userEmail')) {
      return routeArgs['userEmail']?.toString() ?? '';
    }
    return ref.read(sessionProvider).email;
  }

  String get _effectiveAppId {
    if (widget.applicationId != null && widget.applicationId!.isNotEmpty) {
      return widget.applicationId!;
    }
    final routeArgs = ModalRoute.of(context)?.settings.arguments;
    if (routeArgs is Map<String, dynamic> && routeArgs.containsKey('applicationId')) {
      return routeArgs['applicationId']?.toString() ?? '';
    }
    return '';
  }

  double get _effectiveAmount {
    if (widget.amount != null && widget.amount! > 0) {
      return widget.amount!;
    }
    final routeArgs = ModalRoute.of(context)?.settings.arguments;
    if (routeArgs is Map<String, dynamic> && routeArgs.containsKey('amount')) {
      final val = routeArgs['amount'];
      if (val is num) return val.toDouble();
      if (val is String) return double.tryParse(val) ?? 0.0;
    }
    return 0.0;
  }

  /// Payments and application statuses shown elsewhere change once money moves.
  void _invalidatePaymentData() {
    ref.invalidate(myPaymentsProvider);
    ref.invalidate(myApplicationsProvider);
  }

  Future<void> _onPayNowPressed() async {
    if (!mounted) return;
    if (_effectiveAppId.isEmpty || _effectiveAmount <= 0) {
      setState(() {
        _isSuccess = false;
        _resultMessage = 'Missing application or payment amount. Please start the payment from your application.';
      });
      return;
    }
    setState(() {
      _isLoading = true;
      _resultMessage = null;
      _paymentId = null;
      _checkoutUrl = null;
      _paymentStatus = null;
      _isPaid = false;
      _isSuccess = false;
      _isNetworkError = false;
    });

    try {
      final service = ref.read(paymentServiceProvider);
      final response = await service.checkout(
        applicationId: _effectiveAppId,
        amount: _effectiveAmount,
        userEmail: _effectiveUserEmail,
      );

      if (!mounted) return;
      setState(() {
        _paymentId = response.paymentId;
        _checkoutUrl = response.checkoutUrl;
      });

      if (response.checkoutUrl.isNotEmpty) {
        final result = await Navigator.of(context).push<bool>(
          CupertinoPageRoute(
            builder: (_) => CheckoutWebViewScreen(checkoutUrl: response.checkoutUrl),
          ),
        );

        if (!mounted) return;
        if (result == true && _paymentId != null) {
          await _confirmPayment(_paymentId!);
        } else if (result == false) {
          setState(() {
            _isLoading = false;
            _isSuccess = false;
            _resultMessage = 'Payment checkout was cancelled by the user.';
          });
        } else {
          setState(() {
            _isLoading = false;
            _isSuccess = false;
            _resultMessage = 'Checkout backed out without completing. Tap Pay Now to try again.';
          });
        }
      } else {
        setState(() {
          _isLoading = false;
          _isSuccess = true;
          _resultMessage = 'Checkout session created (ID: ${response.paymentId}).';
        });
      }
    } catch (e) {
      if (!mounted) return;
      final errorStr = e.toString().replaceAll('Exception: ', '');
      final isNetwork = errorStr.toLowerCase().contains('connect') ||
          errorStr.toLowerCase().contains('network') ||
          errorStr.toLowerCase().contains('socket') ||
          errorStr.toLowerCase().contains('client');

      setState(() {
        _isLoading = false;
        _isSuccess = false;
        _isNetworkError = isNetwork;
        _resultMessage = isNetwork
            ? 'Network Connection Error: Could not reach backend server.'
            : 'Checkout Error: $errorStr';
      });
    }
  }

  Future<void> _confirmPayment(String paymentId) async {
    if (!mounted) return;
    if (_effectiveAppId.isEmpty || _effectiveAmount <= 0) {
      setState(() {
        _isSuccess = false;
        _resultMessage = 'Missing application or payment amount. Please start the payment from your application.';
      });
      return;
    }
    setState(() {
      _isLoading = true;
      _resultMessage = null;
      _isNetworkError = false;
    });

    try {
      final service = ref.read(paymentServiceProvider);
      final payment = await service.confirmPayment(paymentId);

      if (!mounted) return;
      _invalidatePaymentData();
      final statusStr = payment.status ?? 'Pending';
      final isPaid = statusStr.toLowerCase() == 'paid' || statusStr.toLowerCase() == 'completed';

      setState(() {
        _isLoading = false;
        _paymentStatus = statusStr;
        _isPaid = isPaid;
        _isSuccess = isPaid;
        if (isPaid) {
          final email = payment.userEmail ?? _effectiveUserEmail;
          _resultMessage = email.isNotEmpty
              ? 'Payment successful. A receipt was emailed to $email.'
              : 'Payment successful';
        } else {
          _resultMessage = 'Payment status: $statusStr';
        }
      });
      if (isPaid && widget.popOnPaid) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final errorStr = e.toString().replaceAll('Exception: ', '');
      final isNetwork = errorStr.toLowerCase().contains('connect') ||
          errorStr.toLowerCase().contains('network') ||
          errorStr.toLowerCase().contains('socket');

      setState(() {
        _isLoading = false;
        _isSuccess = false;
        _isNetworkError = isNetwork;
        _resultMessage = isNetwork
            ? 'Network Connection Error: Unable to verify payment status.'
            : 'Confirmation Error: $errorStr';
      });
    }
  }

  Future<void> _onSetupInstallmentPlanPressed() async {
    if (!mounted) return;
    if (_effectiveAppId.isEmpty || _effectiveAmount <= 0) {
      setState(() {
        _isSuccess = false;
        _resultMessage = 'Missing application or payment amount. Please start the payment from your application.';
      });
      return;
    }
    setState(() {
      _isLoading = true;
      _resultMessage = null;
      _paymentId = null;
      _checkoutUrl = null;
      _paymentStatus = null;
      _isPaid = false;
      _isSuccess = false;
      _isNetworkError = false;
    });

    try {
      final paymentService = ref.read(paymentServiceProvider);
      final response = await paymentService.checkout(
        applicationId: _effectiveAppId,
        amount: _effectiveAmount,
        userEmail: _effectiveUserEmail,
      );

      final installmentService = ref.read(installmentServiceProvider);
      final plan = await installmentService.createInstallmentPlan(
        response.paymentId,
        numberOfInstallments: _selectedInstallments,
        intervalDays: 30,
      );

      if (!mounted) return;
      _invalidatePaymentData();
      setState(() {
        _isLoading = false;
        _paymentId = response.paymentId;
      });

      await Navigator.of(context).push(
        CupertinoPageRoute(
          builder: (_) => InstallmentPlanView(
            planId: plan.id.toString(),
            paymentId: response.paymentId,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final errorStr = e.toString().replaceAll('Exception: ', '');
      final isNetwork = errorStr.toLowerCase().contains('connect') ||
          errorStr.toLowerCase().contains('network') ||
          errorStr.toLowerCase().contains('socket');

      setState(() {
        _isLoading = false;
        _isSuccess = false;
        _isNetworkError = isNetwork;
        _resultMessage = isNetwork
            ? 'Network Connection Error: Could not setup installment plan.'
            : 'Installment Plan Setup Error: $errorStr';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final appId = _effectiveAppId;
    final feeAmount = _effectiveAmount;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Payment Details'),
        backgroundColor: AppColors.cardBg,
        elevation: 0,
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.of(context).pop(),
          child: const Icon(CupertinoIcons.chevron_left, color: AppColors.primary),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hero Summary Card
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
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Calculated Service Fee',
                          style: TextStyle(
                            color: AppColors.secondaryLabel,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            'LKR Currency',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'LKR ${feeAmount.toStringAsFixed(2)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Application ID: $appId',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Details Group Card
              const Text(
                'Payment Summary',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.cardBg,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.divider, width: 0.8),
                ),
                child: Column(
                  children: [
                    _buildRow('Application ID', appId),
                    const Divider(height: 1, color: AppColors.divider, indent: 16),
                    _buildRow('Fee Amount', 'LKR ${feeAmount.toStringAsFixed(2)}'),
                    const Divider(height: 1, color: AppColors.divider, indent: 16),
                    _buildRow('Payer Email', _effectiveUserEmail),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              // Payment Option Selector (Full Payment vs Installment Plan)
              if (!_isPaid) ...[
                const Text(
                  'Select Payment Option',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider, width: 0.8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _paymentMethodIndex = 0),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: _paymentMethodIndex == 0 ? AppColors.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'Full Payment',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: _paymentMethodIndex == 0 ? Colors.white : AppColors.secondaryLabel,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _paymentMethodIndex = 1),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: _paymentMethodIndex == 1 ? AppColors.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'Installment Plan',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: _paymentMethodIndex == 1 ? Colors.white : AppColors.secondaryLabel,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Installment Details Card (If Installment Plan selected)
                if (_paymentMethodIndex == 1) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.cardBg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.divider, width: 0.8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Select Duration',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.dark,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [2, 3, 4, 6].map((months) {
                            final isSelected = _selectedInstallments == months;
                            final monthlyAmount = feeAmount / months;
                            return Expanded(
                              child: GestureDetector(
                                onTap: () => setState(() => _selectedInstallments = months),
                                child: Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 3),
                                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
                                  decoration: BoxDecoration(
                                    color: isSelected ? AppColors.primary.withValues(alpha: 0.1) : AppColors.background,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: isSelected ? AppColors.primary : AppColors.divider,
                                      width: isSelected ? 1.5 : 0.8,
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        '$months Mos',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: isSelected ? AppColors.primary : AppColors.dark,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'LKR ${(monthlyAmount).toStringAsFixed(0)}',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w500,
                                          color: isSelected ? AppColors.primary : AppColors.secondaryLabel,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 16),
                        const Divider(height: 1, color: AppColors.divider),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Monthly Amount:', style: TextStyle(color: AppColors.secondaryLabel, fontSize: 14)),
                            Text(
                              'LKR ${(feeAmount / _selectedInstallments).toStringAsFixed(2)}',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.primary),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Payment Interval:', style: TextStyle(color: AppColors.secondaryLabel, fontSize: 14)),
                            const Text('Every 30 Days', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: AppColors.dark)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],

                // Dynamic Action Button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: CupertinoButton.filled(
                    borderRadius: BorderRadius.circular(14),
                    onPressed: _isLoading
                        ? null
                        : (_paymentMethodIndex == 0 ? _onPayNowPressed : _onSetupInstallmentPlanPressed),
                    child: _isLoading
                        ? const CupertinoActivityIndicator(color: Colors.white, radius: 11)
                        : Text(
                            _paymentMethodIndex == 0 ? 'Pay Now' : 'Set Up Installment Plan',
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 20),
              ],

              // Space for loading / result state display below button
              if (_isLoading) ...[
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16.0),
                    child: CupertinoActivityIndicator(radius: 14),
                  ),
                ),
              ] else if (_isPaid) ...[
                // Paid Success State Card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppColors.success.withValues(alpha: 0.3),
                      width: 1.2,
                    ),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          CupertinoIcons.checkmark_seal_fill,
                          color: AppColors.success,
                          size: 32,
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Payment successful',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.success,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Status: ${_paymentStatus ?? "Paid"} • ID: ${_paymentId ?? ""}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.secondaryLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ] else if (_resultMessage != null || _paymentStatus != null) ...[
                // Error / Non-paid / Status result card with retry option
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: _isSuccess
                        ? AppColors.primary.withValues(alpha: 0.08)
                        : AppColors.danger.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _isSuccess
                          ? AppColors.primary.withValues(alpha: 0.3)
                          : AppColors.danger.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _isSuccess
                                ? CupertinoIcons.info_circle_fill
                                : CupertinoIcons.exclamationmark_circle_fill,
                            color: _isSuccess ? AppColors.primary : AppColors.danger,
                            size: 22,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _resultMessage ?? 'Status: ${_paymentStatus ?? "Pending"}',
                              style: TextStyle(
                                color: _isSuccess ? AppColors.dark : AppColors.danger,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (_isNetworkError) ...[
                        const SizedBox(height: 14),
                        SizedBox(
                          width: double.infinity,
                          child: CupertinoButton(
                            color: AppColors.danger,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            borderRadius: BorderRadius.circular(10),
                            onPressed: _onPayNowPressed,
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(CupertinoIcons.wifi_exclamationmark, color: Colors.white, size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'Retry Connection',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ] else ...[
                        if (_checkoutUrl != null && _checkoutUrl!.isNotEmpty && !_isPaid) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: CupertinoButton(
                              color: AppColors.primary.withValues(alpha: 0.12),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              borderRadius: BorderRadius.circular(10),
                              onPressed: () async {
                                final result = await Navigator.of(context).push<bool>(
                                  CupertinoPageRoute(
                                    builder: (_) => CheckoutWebViewScreen(checkoutUrl: _checkoutUrl!),
                                  ),
                                );
                                if (result == true && _paymentId != null) {
                                  await _confirmPayment(_paymentId!);
                                }
                              },
                              child: const Text(
                                'Open Checkout Gateway',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                          ),
                        ],
                        if (_paymentId != null && !_isPaid) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: CupertinoButton(
                              color: AppColors.primary,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              borderRadius: BorderRadius.circular(10),
                              onPressed: () => _confirmPayment(_paymentId!),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(CupertinoIcons.refresh, color: Colors.white, size: 18),
                                  SizedBox(width: 8),
                                  Text(
                                    'Check Again',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 15,
              color: AppColors.secondaryLabel,
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.dark,
            ),
          ),
        ],
      ),
    );
  }
}



