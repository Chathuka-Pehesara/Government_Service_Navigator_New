import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../theme/app_colors.dart';
import '../../providers/session_provider.dart';
import '../../providers/payment_providers.dart';
import '../../providers/service_providers.dart';
import '../../providers/application_providers.dart';
import '../../models/payment.dart';
import '../../models/verification_models.dart';
import '../../screens/payments/payment_screen.dart';
import '../../screens/payments/checkout_webview_screen.dart';
import '../../screens/payments/payment_ledger_screen.dart';
import '../../screens/payments/transaction_history_screen.dart';
import '../../screens/payments/installment_plan_screen.dart';
import '../../screens/refunds/refund_request_screen.dart';
import '../../screens/refunds/my_refunds_screen.dart';
import '../../services/service_api_client.dart';
import '../../utils/validators.dart';

class PaymentsDashboardTab extends ConsumerStatefulWidget {
  const PaymentsDashboardTab({super.key});

  @override
  ConsumerState<PaymentsDashboardTab> createState() => _PaymentsDashboardTabState();
}

class _PaymentsDashboardTabState extends ConsumerState<PaymentsDashboardTab> {
  // Department Payment Form State
  final _amountController = TextEditingController(text: '3500');
  final _nicController = TextEditingController();
  final _notesController = TextEditingController();
  final _bankSlipRefController = TextEditingController();
  PlatformFile? _pickedSlipFile;
  int? _pickedSlipBytes;

  String _selectedDepartment = 'Department of Immigration & Emigration';
  String _selectedService = 'Passport Issuance & Renewal';
  String _selectedMethod = 'Online'; // 'Online' or 'Bank Transfer'
  bool _isSubmitting = false;
  String? _errorMessage;

  static const List<Map<String, dynamic>> _departmentOptions = [
    {
      'name': 'Department of Immigration & Emigration',
      'icon': CupertinoIcons.airplane,
      'services': [
        'Passport Issuance & Renewal',
        'Urgent One-Day Passport Service',
        'Dual Citizenship Processing',
        'Residence Visa Statutory Fee',
        'General Immigration Fine/Fee',
      ],
    },
    {
      'name': 'Department of Motor Traffic',
      'icon': CupertinoIcons.car_detailed,
      'services': [
        'Driving License New / Renewal',
        'Vehicle Revenue License',
        'Vehicle Registration Transfer',
        'Motor Traffic Statutory Fine',
        'Learner Permit Examination Fee',
      ],
    },
    {
      'name': 'Police Department',
      'icon': CupertinoIcons.shield,
      'services': [
        'Police Clearance Certificate',
        'Traffic Violation Surcharge',
        'Event & Procession Permit Fee',
        'Special Security Clearance',
        'Administrative Filing Fee',
      ],
    },
    {
      'name': 'Department of Registration of Persons',
      'icon': CupertinoIcons.person_crop_rectangle,
      'services': [
        'National Identity Card (NIC) Issue',
        'Duplicate NIC Replacement',
        'Correction of NIC Data Fee',
        'Priority Identity Verification',
      ],
    },
    {
      'name': 'Divisional Secretariat',
      'icon': CupertinoIcons.building_2_fill,
      'services': [
        'Business Name Registration',
        'Birth / Marriage Certificate Extract',
        'Grama Niladhari Verification Fee',
        'Timber Transport Permit',
        'Statutory Stamp Duty Payment',
      ],
    },
  ];

  static const List<int> _presetAmounts = [1500, 3500, 5000, 10000, 25000];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initCitizenDetails();
    });
  }

  void _initCitizenDetails() {
    final session = ref.read(sessionProvider);
    final nic = session.user?['nicNumber']?.toString() ??
        session.user?['nic']?.toString() ??
        session.user?['citizenNic']?.toString() ??
        '';
    if (nic.isNotEmpty && _nicController.text.isEmpty) {
      _nicController.text = nic;
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _nicController.dispose();
    _notesController.dispose();
    _bankSlipRefController.dispose();
    super.dispose();
  }

  Future<void> _pickSlipFile() async {
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
      );
      if (files.isNotEmpty) {
        final file = files.first;
        final size = await file.length();
        if (size != null && size > 10 * 1024 * 1024) {
          setState(() => _errorMessage = 'The slip file is larger than 10 MB. Please choose a smaller file.');
          return;
        }
        setState(() {
          _pickedSlipFile = file;
          _pickedSlipBytes = size;
          _errorMessage = null;
          if (_bankSlipRefController.text.trim().isEmpty) {
            _bankSlipRefController.text = file.name;
          }
        });
      }
    } catch (e) {
      setState(() => _errorMessage = 'Could not open file picker: $e');
    }
  }

  Future<void> _handleDepartmentPayment() async {
    final session = ref.read(sessionProvider);
    final amountText = _amountController.text.trim();
    final amount = double.tryParse(amountText);
    final nic = _nicController.text.trim().isNotEmpty
        ? _nicController.text.trim()
        : (session.user?['nicNumber']?.toString() ??
            session.user?['nic']?.toString() ??
            session.user?['citizenNic']?.toString() ??
            '');

    // Same rules as the backend's DepartmentPaymentDto
    final problem = Validators.amount(amountText) ??
        Validators.nic(nic) ??
        Validators.email(session.email) ??
        Validators.text(_notesController.text, field: 'Notes', max: 1000, required: false) ??
        Validators.text(_bankSlipRefController.text, field: 'Transfer reference', max: 200, required: false);
    if (problem != null || amount == null) {
      setState(() => _errorMessage = problem ?? 'Please enter a valid payment amount.');
      return;
    }

    if (_selectedMethod == 'Bank Transfer' && _pickedSlipFile == null && _bankSlipRefController.text.trim().isEmpty) {
      setState(() => _errorMessage = 'Please upload a bank deposit slip or provide the transfer reference number.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final paymentService = ref.read(paymentServiceProvider);
      String? slipDetail;
      if (_pickedSlipFile != null) {
        try {
          final bytes = await _pickedSlipFile!.readAsBytes();
          final ext = _pickedSlipFile!.name.split('.').last.toLowerCase();
          final mime = ext == 'pdf'
              ? 'application/pdf'
              : (ext == 'png' ? 'image/png' : 'image/jpeg');

          try {
            final uploaded = await ServiceApiClient.uploadDocument(
              fieldLabel: 'Bank Deposit Slip',
              fileName: _pickedSlipFile!.name,
              bytes: bytes,
              token: ref.read(authTokenProvider),
            );
            final docId = uploaded['id']?.toString();
            if (docId != null && docId.isNotEmpty) {
              slipDetail = '/api/verification/documents/$docId/content';
            }
          } catch (e) {
            debugPrint('Error uploading slip document directly: $e');
          }

          slipDetail ??= 'data:$mime;base64,${base64Encode(bytes)}';
        } catch (e) {
          debugPrint('Error reading slip bytes: $e');
          slipDetail = 'slip-${_pickedSlipFile!.name}';
        }
      } else if (_bankSlipRefController.text.trim().isNotEmpty) {
        slipDetail = _bankSlipRefController.text.trim();
      }

      final result = await paymentService.departmentPay(
        department: _selectedDepartment,
        serviceName: _selectedService,
        amount: amount,
        paymentMethod: _selectedMethod == 'Online' ? 'Online' : 'Manual',
        citizenNic: SriLankaNic.normalize(nic),
        userEmail: session.email,
        citizenName: session.fullName ?? 'Citizen',
        manualSlipUrl: _selectedMethod == 'Bank Transfer' ? slipDetail : null,
        notes: _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
      );

      final checkoutUrl = result['checkoutUrl']?.toString();
      final paymentId = result['paymentId']?.toString();

      // For Online Payment: Open Stripe Checkout in WebView
      if (_selectedMethod == 'Online' && checkoutUrl != null && checkoutUrl.isNotEmpty) {
        setState(() => _isSubmitting = false);
        if (!mounted) return;
        final webviewSuccess = await Navigator.of(context).push<bool>(
          CupertinoPageRoute(
            builder: (_) => CheckoutWebViewScreen(checkoutUrl: checkoutUrl),
          ),
        );

        if (!mounted) return;

        if (webviewSuccess == true && paymentId != null) {
          setState(() => _isSubmitting = true);
          // Stripe is the source of truth: only a confirmed session counts as Paid (this also emails the receipt)
          String? confirmError;
          String status = 'Pending';
          try {
            final confirmed = await paymentService.confirmPayment(paymentId);
            status = confirmed.status ?? 'Pending';
          } catch (e) {
            confirmError = e.toString().replaceAll('Exception: ', '');
          }
          ref.invalidate(myPaymentsProvider);
          ref.invalidate(myApplicationsProvider);
          if (!mounted) return;
          if (status.toLowerCase() == 'paid') {
            setState(() => _isSubmitting = false);
            result['status'] = 'Paid';
            _showSuccessReceiptDialog(result);
          } else {
            setState(() {
              _isSubmitting = false;
              _errorMessage = confirmError ??
                  'Stripe has not confirmed this payment yet (status: $status). If you were charged, it will appear under My Payments shortly.';
            });
          }
        } else if (webviewSuccess == false) {
          setState(() {
            _isSubmitting = false;
            _errorMessage = 'Online Stripe payment was cancelled. You can retry when ready.';
          });
        } else {
          setState(() {
            _isSubmitting = false;
            _errorMessage = 'Checkout was not completed. Tap Pay Online to try again.';
          });
        }
        return;
      }

      // Invalidate relevant providers to refresh UI everywhere
      ref.invalidate(myPaymentsProvider);
      ref.invalidate(myApplicationsProvider);

      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _pickedSlipFile = null;
        });
        _showSuccessReceiptDialog(result);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  void _showSuccessReceiptDialog(Map<String, dynamic> result) {
    final refId = result['paymentReference']?.toString() ?? 'PAY-SUCCESS';
    final amount = (result['amount'] as num?)?.toDouble() ?? double.tryParse(_amountController.text) ?? 0.0;
    final dept = result['department']?.toString() ?? _selectedDepartment;
    final status = result['status']?.toString() ?? (_selectedMethod == 'Online' ? 'Paid' : 'PendingVerification');
    final method = result['method']?.toString() ?? _selectedMethod;
    final nic = result['citizenNic']?.toString() ?? _nicController.text;
    final paymentId = result['paymentId']?.toString() ?? '-';
    final receiptEmail = result['userEmail']?.toString() ?? ref.read(sessionProvider).email;

    showCupertinoModalPopup(
      context: context,
      barrierDismissible: false,
      builder: (context) => Material(
        color: Colors.transparent,
        child: Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.divider, width: 0.8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header Icon
              Center(
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: (status == 'Paid' ? AppColors.success : AppColors.warning).withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    status == 'Paid' ? CupertinoIcons.checkmark_seal_fill : CupertinoIcons.clock_fill,
                    color: status == 'Paid' ? AppColors.success : AppColors.warning,
                    size: 32,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  status == 'Paid' ? 'Payment Successful' : 'Transfer Slip Logged',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.dark,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Center(
                child: Text(
                  status == 'Paid'
                      ? 'Statutory payment received and ledger entry confirmed.'
                      : 'Bank transfer submitted for Financial Officer verification.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.secondaryLabel),
                ),
              ),
              const SizedBox(height: 16),
              const Divider(color: AppColors.divider, height: 1),
              const SizedBox(height: 14),

              // Receipt Details Card
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.divider, width: 0.6),
                ),
                child: Column(
                  children: [
                    _buildReceiptRow('Payment ID', '#$paymentId', isHighlight: true),
                    const SizedBox(height: 8),
                    _buildReceiptRow('Payment Ref', refId),
                    const SizedBox(height: 8),
                    _buildReceiptRow('Department', dept),
                    const SizedBox(height: 8),
                    _buildReceiptRow('Purpose / Service', _selectedService),
                    const SizedBox(height: 8),
                    _buildReceiptRow('Citizen NIC', nic),
                    const SizedBox(height: 8),
                    _buildReceiptRow('Payment Method', method),
                    const SizedBox(height: 8),
                    _buildReceiptRow(
                      'Amount Paid',
                      'LKR ${amount.toStringAsFixed(2)}',
                      isBold: true,
                    ),
                    const SizedBox(height: 8),
                    _buildReceiptRow(
                      'Status',
                      status == 'Paid' ? 'VERIFIED & PAID' : 'PENDING VERIFICATION',
                      valueColor: status == 'Paid' ? AppColors.success : AppColors.warning,
                    ),
                    if (status == 'Paid' && receiptEmail.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _buildReceiptRow('Receipt Emailed To', receiptEmail),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Officer Notification Callout
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.info_circle_fill, size: 16, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Details automatically sent to $dept Financial Officer dashboard.',
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        side: const BorderSide(color: AppColors.divider),
                      ),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: refId));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Payment Reference copied to clipboard'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      },
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(CupertinoIcons.doc_on_clipboard, size: 16, color: AppColors.dark),
                          SizedBox(width: 6),
                          Text('Copy Ref', style: TextStyle(color: AppColors.dark, fontSize: 13)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        // Reset amount
                        _amountController.text = '3500';
                        _bankSlipRefController.clear();
                        _notesController.clear();
                      },
                      child: const Text(
                        'Done',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReceiptRow(String label, String value, {bool isHighlight = false, bool isBold = false, Color? valueColor}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 12.5,
              fontFamily: isHighlight ? 'monospace' : null,
              fontWeight: (isHighlight || isBold) ? FontWeight.bold : FontWeight.w600,
              color: valueColor ?? (isHighlight ? AppColors.primary : AppColors.dark),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final paymentsAsync = ref.watch(myPaymentsProvider);
    final applicationsAsync = ref.watch(myApplicationsProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Payments & Dues'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(CupertinoIcons.time),
            tooltip: 'Transaction History',
            onPressed: () {
              Navigator.of(context).push(
                CupertinoPageRoute(
                  builder: (_) => const TransactionHistoryScreen(),
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myPaymentsProvider);
          ref.invalidate(myApplicationsProvider);
          await ref.read(myPaymentsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          children: [
            // 1. Direct Department Payment Card
            _buildDepartmentPaymentCard(),
            const SizedBox(height: 24),

            // 2. Pending Application Fees (if any)
            _buildPendingApplicationFeesSection(applicationsAsync),
            const SizedBox(height: 24),

            // 3. Recent Payment History
            _buildRecentPaymentsSection(paymentsAsync),
            const SizedBox(height: 24),

            // 4. Quick Services (Refunds & Installments)
            _buildRefundsAndInstallmentsSection(),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildDepartmentPaymentCard() {
    final currentDeptObj = _departmentOptions.firstWhere(
      (d) => d['name'] == _selectedDepartment,
      orElse: () => _departmentOptions.first,
    );
    final availableServices = (currentDeptObj['services'] as List<String>);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Title
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(CupertinoIcons.creditcard_fill, color: AppColors.primary, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Make Department Payment',
                      style: TextStyle(
                        fontSize: 16.5,
                        fontWeight: FontWeight.bold,
                        color: AppColors.dark,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Direct statutory fee payment with automatic receipt routing',
                      style: TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Divider(height: 1, color: AppColors.divider),
          const SizedBox(height: 16),

          // Department Dropdown
          const Text(
            'SELECT DEPARTMENT',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryLabel,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider, width: 0.8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _selectedDepartment,
                isExpanded: true,
                icon: const Icon(CupertinoIcons.chevron_down, size: 16, color: AppColors.secondaryLabel),
                items: _departmentOptions.map((dept) {
                  return DropdownMenuItem<String>(
                    value: dept['name'] as String,
                    child: Row(
                      children: [
                        Icon(dept['icon'] as IconData, size: 16, color: AppColors.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            dept['name'] as String,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.dark),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
                onChanged: (newDept) {
                  if (newDept != null) {
                    setState(() {
                      _selectedDepartment = newDept;
                      final deptObj = _departmentOptions.firstWhere((d) => d['name'] == newDept);
                      _selectedService = (deptObj['services'] as List<String>).first;
                    });
                  }
                },
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Purpose / Service Dropdown
          const Text(
            'PAYMENT PURPOSE / SERVICE',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryLabel,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider, width: 0.8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: availableServices.contains(_selectedService) ? _selectedService : availableServices.first,
                isExpanded: true,
                icon: const Icon(CupertinoIcons.chevron_down, size: 16, color: AppColors.secondaryLabel),
                items: availableServices.map((srv) {
                  return DropdownMenuItem<String>(
                    value: srv,
                    child: Text(
                      srv,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.dark),
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                }).toList(),
                onChanged: (newSrv) {
                  if (newSrv != null) {
                    setState(() => _selectedService = newSrv);
                  }
                },
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Citizen NIC Field
          const Text(
            'CITIZEN NIC NUMBER',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryLabel,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _nicController,
            maxLength: 12,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              counterText: '',
              prefixIcon: const Icon(CupertinoIcons.person_crop_rectangle, size: 18, color: AppColors.secondaryLabel),
              hintText: 'e.g. 199512345678 or 951234567V',
              hintStyle: const TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
              filled: true,
              fillColor: AppColors.background,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
              ),
            ),
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.dark),
          ),
          const SizedBox(height: 14),

          // Amount and Presets
          const Text(
            'AMOUNT (LKR)',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryLabel,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              prefixText: 'LKR  ',
              prefixStyle: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary, fontSize: 15),
              filled: true,
              fillColor: AppColors.background,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
              ),
            ),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.dark),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _presetAmounts.map((amt) {
                final isSelected = _amountController.text == amt.toString();
                return Padding(
                  padding: const EdgeInsets.only(right: 6.0),
                  child: ChoiceChip(
                    label: Text('LKR $amt', style: TextStyle(fontSize: 11.5, color: isSelected ? Colors.white : AppColors.dark)),
                    selected: isSelected,
                    selectedColor: AppColors.primary,
                    backgroundColor: AppColors.background,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    side: BorderSide(color: isSelected ? AppColors.primary : AppColors.divider, width: 0.6),
                    onSelected: (val) {
                      if (val) setState(() => _amountController.text = amt.toString());
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          // Payment Method Selector (Online vs Bank Transfer)
          const Text(
            'PAYMENT METHOD',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.secondaryLabel,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _buildMethodTile(
                  title: 'Online Payment',
                  subtitle: 'Cards / Instant',
                  icon: CupertinoIcons.creditcard,
                  isSelected: _selectedMethod == 'Online',
                  onTap: () => setState(() => _selectedMethod = 'Online'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMethodTile(
                  title: 'Bank Transfer',
                  subtitle: 'Deposit / Slip',
                  icon: CupertinoIcons.arrow_right_arrow_left,
                  isSelected: _selectedMethod == 'Bank Transfer',
                  onTap: () => setState(() => _selectedMethod = 'Bank Transfer'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Bank Transfer Details (only if Bank Transfer selected)
          if (_selectedMethod == 'Bank Transfer') ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider, width: 0.8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(CupertinoIcons.building_2_fill, size: 14, color: AppColors.primary),
                      SizedBox(width: 6),
                      Text(
                        'Government Treasury Account Details',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.dark),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Bank: Bank of Ceylon (BOC) / People\'s Bank\nAccount: Democratic Socialist Republic of Sri Lanka\nAccount No: 000847291038 · Branch: Colombo City',
                    style: TextStyle(fontSize: 11.5, color: AppColors.secondaryLabel, height: 1.4),
                  ),
                  const SizedBox(height: 10),
                  const SizedBox(height: 12),
                  const Text(
                    'UPLOAD BANK DEPOSIT SLIP',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.secondaryLabel,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (_pickedSlipFile == null)
                    GestureDetector(
                      onTap: _pickSlipFile,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.primary.withValues(alpha: 0.4), width: 1.2),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(CupertinoIcons.cloud_upload_fill, size: 20, color: AppColors.primary),
                            SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Choose Deposit Slip / Receipt File',
                                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: AppColors.primary),
                                ),
                                Text(
                                  'Supports PDF, JPG, PNG (Max 10 MB)',
                                  style: TextStyle(fontSize: 11, color: AppColors.secondaryLabel),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(CupertinoIcons.doc_checkmark_fill, color: AppColors.success, size: 22),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _pickedSlipFile!.name,
                                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: AppColors.dark),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                Text(
                                  _pickedSlipBytes != null
                                      ? '${(_pickedSlipBytes! / 1024).toStringAsFixed(1)} KB · Attached'
                                      : 'Receipt Attached',
                                  style: const TextStyle(fontSize: 11, color: AppColors.success, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                          CupertinoButton(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: const Size(20, 20),
                            onPressed: _pickSlipFile,
                            child: const Text('Change', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.primary)),
                          ),
                          CupertinoButton(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                            minimumSize: const Size(20, 20),
                            onPressed: () => setState(() {
                              _pickedSlipFile = null;
                              _pickedSlipBytes = null;
                            }),
                            child: const Icon(CupertinoIcons.xmark_circle_fill, size: 18, color: AppColors.secondaryLabel),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  const Text(
                    'TRANSFER REFERENCE / SLIP NUMBER (OPTIONAL)',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.secondaryLabel,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _bankSlipRefController,
                    maxLength: 200,
                    decoration: InputDecoration(
                      counterText: '',
                      prefixIcon: const Icon(CupertinoIcons.doc_text, size: 16, color: AppColors.secondaryLabel),
                      hintText: 'Enter Deposit Slip / Transfer Reference No.',
                      hintStyle: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: AppColors.divider, width: 0.8),
                      ),
                    ),
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Error Message Display
          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.exclamationmark_circle_fill, size: 16, color: AppColors.danger),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(fontSize: 12, color: AppColors.danger, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Pay Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              onPressed: _isSubmitting ? null : _handleDepartmentPayment,
              child: _isSubmitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _selectedMethod == 'Online' ? CupertinoIcons.lock_fill : CupertinoIcons.arrow_up_doc_fill,
                          size: 16,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _selectedMethod == 'Online'
                              ? 'Pay LKR ${_amountController.text.isNotEmpty ? _amountController.text : '0.00'} with Stripe'
                              : 'Submit Bank Transfer Slip',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMethodTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.08) : AppColors.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.divider,
            width: isSelected ? 1.5 : 0.8,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: isSelected ? AppColors.primary : AppColors.secondaryLabel),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                      color: isSelected ? AppColors.primary : AppColors.dark,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 10.5, color: AppColors.secondaryLabel),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPendingApplicationFeesSection(AsyncValue<List<ApplicationItemModel>> applicationsAsync) {
    return applicationsAsync.when(
      data: (apps) {
        final pendingFeeApps = apps.where((a) => a.stageStatus == 'AwaitingFeePayment').toList();
        if (pendingFeeApps.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader('Pending Application Fees (${pendingFeeApps.length})'),
            const SizedBox(height: 10),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: pendingFeeApps.length,
              itemBuilder: (context, index) {
                final app = pendingFeeApps[index];
                final amt = app.amount > 0 ? app.amount : 2500.0;

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.warning.withValues(alpha: 0.4), width: 1),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.warning.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(CupertinoIcons.hourglass_bottomhalf_fill, color: AppColors.warning, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              app.serviceName,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.dark),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${app.referenceNumber} · Stage ${app.currentStage}/${app.maxStages}',
                              style: const TextStyle(fontSize: 11.5, color: AppColors.secondaryLabel),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Fee: LKR ${amt.toStringAsFixed(2)}',
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.primary),
                            ),
                          ],
                        ),
                      ),
                      CupertinoButton(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(10),
                        onPressed: () async {
                          await Navigator.of(context).push(
                            CupertinoPageRoute(
                              builder: (_) => PaymentScreen(
                                applicationId: app.applicationId.toString(),
                                amount: amt,
                                userEmail: app.userEmail,
                                popOnPaid: true,
                              ),
                            ),
                          );
                          ref.invalidate(myApplicationsProvider);
                          ref.invalidate(myPaymentsProvider);
                        },
                        child: const Text('Pay Now', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Widget _buildRecentPaymentsSection(AsyncValue<List<Payment>> paymentsAsync) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildSectionHeader('Recent Payment History'),
            GestureDetector(
              onTap: () {
                Navigator.of(context).push(
                  CupertinoPageRoute(
                    builder: (_) => const TransactionHistoryScreen(),
                  ),
                );
              },
              child: const Text(
                'View All',
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.primary),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        paymentsAsync.when(
          data: (payments) {
            if (payments.isEmpty) {
              return Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.cardBg,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.divider, width: 0.8),
                ),
                child: const Center(
                  child: Text(
                    'No transaction history found on your account.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.secondaryLabel),
                  ),
                ),
              );
            }

            final recent = payments.take(3).toList();
            return Column(
              children: recent.map((payment) {
                final statusStr = payment.status ?? 'Pending';
                final isPaid = statusStr.toLowerCase() == 'paid';
                final isPending = statusStr.toLowerCase().contains('pending');
                final statusColor = isPaid ? AppColors.success : (isPending ? AppColors.warning : AppColors.danger);
                
                final refIntent = payment.stripePaymentIntentId;
                final createdDateStr = payment.createdDate;
                
                // Format consistent visual ID (PAY-YYYYMMDD-XXXXXX)
                String refDisplay;
                if (refIntent != null && refIntent.startsWith('PAY-')) {
                  refDisplay = refIntent;
                } else {
                  // Extract YYYYMMDD from the createdDate or fallback to today
                  final datePart = (createdDateStr != null && createdDateStr.length >= 10)
                      ? createdDateStr.substring(0, 10).replaceAll('-', '')
                      : DateTime.now().toIso8601String().substring(0, 10).replaceAll('-', '');
                  
                  // Pad the payment ID to 6 digits to match the visual length
                  final idPart = payment.id.toString().padLeft(6, '0');
                  refDisplay = 'PAY-$datePart-$idPart';
                }

                final dateDisplay = (createdDateStr != null && createdDateStr.contains('T'))
                    ? createdDateStr.split('T')[0]
                    : (createdDateStr ?? 'Recent');

                return Container(

                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.cardBg,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.divider, width: 0.8),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          isPaid ? CupertinoIcons.checkmark_seal_fill : (isPending ? CupertinoIcons.clock : CupertinoIcons.clear_circled),
                          color: statusColor,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              refDisplay,
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.dark),
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${payment.method ?? 'Payment'} · $dateDisplay',
                              style: const TextStyle(fontSize: 11.5, color: AppColors.secondaryLabel),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            'LKR ${payment.amount.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: AppColors.dark),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            statusStr.toUpperCase(),
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: statusColor),
                          ),
                        ],
                      ),
                      const SizedBox(width: 8),
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(24, 24),
                        onPressed: () {
                          Navigator.of(context).push(
                            CupertinoPageRoute(
                              builder: (_) => PaymentLedgerScreen(paymentId: payment.id),
                            ),
                          );
                        },
                        child: const Icon(CupertinoIcons.chevron_right, size: 14, color: AppColors.secondaryLabel),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          },
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CupertinoActivityIndicator())),
          error: (err, _) => Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.cardBg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.divider, width: 0.8),
            ),
            child: Text('Could not load payments: $err', style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel)),
          ),
        ),
      ],
    );
  }

  Widget _buildRefundsAndInstallmentsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('Refunds & Installments'),
        const SizedBox(height: 10),
        _buildActionTile(
          icon: CupertinoIcons.plus_circle,
          iconColor: AppColors.danger,
          title: 'Request a Refund',
          subtitle: 'Submit statutory refund request for an application payment',
          onTap: () {
            Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (_) => const RefundRequestScreen(),
              ),
            );
          },
        ),
        const SizedBox(height: 10),
        _buildActionTile(
          icon: CupertinoIcons.arrow_uturn_left,
          iconColor: AppColors.warning,
          title: 'My Refund Requests',
          subtitle: 'Track status of your submitted refund claims',
          onTap: () {
            Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (_) => const MyRefundsScreen(),
              ),
            );
          },
        ),
        const SizedBox(height: 10),
        _buildActionTile(
          icon: CupertinoIcons.calendar,
          iconColor: AppColors.primary,
          title: 'Installment Payment Plans',
          subtitle: 'View active payment plans and due dates',
          onTap: () {
            Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (_) => const InstallmentPlanScreen(planId: ''),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title.toUpperCase(),
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: AppColors.secondaryLabel,
        letterSpacing: 0.6,
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider, width: 0.8),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_right, size: 14, color: AppColors.secondaryLabel),
          ],
        ),
      ),
    );
  }
}
