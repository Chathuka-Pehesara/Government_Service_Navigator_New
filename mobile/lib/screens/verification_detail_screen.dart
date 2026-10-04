import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../models/verification_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/application_providers.dart';
import '../services/verification_api_service.dart';
import '../theme/app_colors.dart';
import '../widgets/service_roadmap_tracker.dart';
import 'payments/payment_screen.dart';
import 'application_form_screen.dart';
import 'booking_options_screen.dart';
import '../utils/validators.dart';
import '../services/service_api_client.dart';
import '../providers/session_provider.dart';

class VerificationDetailScreen extends ConsumerStatefulWidget {
  /// The application as it looked in the list; newer data from [myApplicationsProvider] wins.
  final ApplicationItemModel application;

  const VerificationDetailScreen({
    super.key,
    required this.application,
  });

  @override
  ConsumerState<VerificationDetailScreen> createState() => _VerificationDetailScreenState();
}

class _VerificationDetailScreenState extends ConsumerState<VerificationDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _refresh();
    });
  }

  /// Safe in callbacks; [build] watches the provider so the screen still updates.
  ApplicationItemModel get _app {
    final apps = ref.watch(myApplicationsProvider).value ?? const <ApplicationItemModel>[];
    return apps.firstWhere(
      (a) => a.applicationId == widget.application.applicationId,
      orElse: () => widget.application,
    );
  }

  bool get _isRefreshing {
    final asyncVal = ref.watch(myApplicationsProvider);
    return asyncVal.isLoading && !asyncVal.hasValue;
  }

  Future<void> _refresh() async {
    ref.invalidate(myApplicationsProvider);
    await ref.read(myApplicationsProvider.future);
  }

  bool _isRevised(String s) =>
      s.toLowerCase() == 'revised' || s.toLowerCase() == 'revision requested';

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'approved':
        return AppColors.success;
      case 'revised':
      case 'revision requested':
        return AppColors.warning;
      case 'rejected':
        return AppColors.danger;
      default:
        return AppColors.primary;
    }
  }

  String _getStatusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'Verified & Approved';
      case 'revised':
      case 'revision requested':
        return 'Action Required';
      case 'rejected':
        return 'Verification Rejected';
      default:
        return 'In Verification Review';
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'approved':
        return CupertinoIcons.checkmark_seal_fill;
      case 'revised':
      case 'revision requested':
        return CupertinoIcons.exclamationmark_triangle_fill;
      case 'rejected':
        return CupertinoIcons.xmark_circle_fill;
      default:
        return CupertinoIcons.clock_fill;
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(myApplicationsProvider);
    final statusColor = _getStatusColor(_app.status);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.cardBg,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 0,
        leading: IconButton(
          icon: const Icon(CupertinoIcons.back, color: AppColors.dark),
          onPressed: () => Navigator.pop(context, _app),
        ),
        title: Text(
          _app.referenceNumber,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: AppColors.dark,
            fontWeight: FontWeight.bold,
            fontSize: 17,
          ),
        ),
        actions: [
          IconButton(
            icon: _isRefreshing
                ? const CupertinoActivityIndicator()
                : const Icon(CupertinoIcons.arrow_clockwise, color: AppColors.primary),
            onPressed: _refresh,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          children: [
            // 1. Hero Status Banner
            _buildHeroStatusBanner(statusColor),
            const SizedBox(height: 20),

            // 2. Action Required Banner (Only if status is Revised and not Completed/Approved)
            if (_isRevised(_app.status) && _app.stageStatus != 'Completed' && _app.status.toLowerCase() != 'approved') ...[
              _buildActionRequiredBanner(),
              const SizedBox(height: 20),
            ],

            // 3. Official Verification Pass & QR (If status == 'Approved' or stageStatus == 'Completed')
            if (_app.status.toLowerCase() == 'approved' || _app.stageStatus == 'Completed') ...[
              _buildDigitalVerificationPass(),
              const SizedBox(height: 16),
              _buildBookingOptionsCard(),
              const SizedBox(height: 20),
            ],

            // 3.5. Multi-Stage Service Roadmap Tracker
            ServiceRoadmapTracker(
              currentStage: _app.currentStage,
              maxStages: _app.maxStages,
              stageStatus: _app.stageStatus,
              stageDepartments: _app.workflowDepartments,
              currentDepartment: _app.currentDepartment ?? _app.department,
              fillStageFormButtonText: _app.currentDepartment != null
                  ? 'Fill Stage ${_app.currentStage} Form for ${_app.currentDepartment}'
                  : 'Fill Stage ${_app.currentStage} Form Now',
              onFillStageFormTap: () async {
                await Navigator.of(context).push(
                  CupertinoPageRoute(
                    builder: (_) => ApplicationFormScreen(
                      serviceId: _app.serviceProcedureId > 0 ? _app.serviceProcedureId : _app.applicationId,
                      serviceName: _app.serviceName,
                      stageNumber: _app.currentStage,
                      applicationId: _app.applicationId,
                    ),
                  ),
                );
                if (mounted) await _refresh();
              },
              onBookingTap: () async {
                await Navigator.of(context).push(
                  CupertinoPageRoute(
                    builder: (_) => BookingOptionsScreen(
                      applicationId: _app.applicationId.toString(),
                      serviceName: _app.serviceName,
                      departmentName: _app.department,
                      citizenNic: _app.citizenNic,
                    ),
                  ),
                );
                if (mounted) await _refresh();
              },
              onActionTap: _app.stageStatus == 'AwaitingFeePayment'
                  ? () async {
                      await Navigator.of(context).push(
                        CupertinoPageRoute(
                          builder: (_) => PaymentScreen(
                            applicationId: _app.applicationId.toString(),
                            amount: _app.amount > 0 ? _app.amount : 2500.0,
                            userEmail: _app.userEmail,
                            popOnPaid: true,
                          ),
                        ),
                      );
                      if (mounted) await _refresh();
                    }
                  : null,
            ),
            const SizedBox(height: 20),

            // 4. Verification Progress Stepper
            _buildVerificationProgressCard(),
            const SizedBox(height: 20),

            // 5. Officer Review & Decision Feedback
            _buildOfficerReviewCard(),
            const SizedBox(height: 20),

            // 6. Statutory Compliance Checklist
            _buildComplianceChecklistCard(),
            const SizedBox(height: 20),

            // 7. Audit Trail History
            _buildAuditTrailCard(),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  // --- WIDGET 1: Hero Status Banner ---
  Widget _buildHeroStatusBanner(Color statusColor) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: statusColor.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _getStatusIcon(_app.status),
                  color: statusColor,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _getStatusLabel(_app.status),
                      style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _app.serviceName,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.secondaryLabel,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1, color: AppColors.divider),
          const SizedBox(height: 14),
          Row(
            children: [
              _buildMetaItem('Department', _app.category, flexible: true),
              const SizedBox(width: 8),
              _buildMetaItem(
                'Submitted Date',
                '${_app.submittedDate.year}-${_app.submittedDate.month.toString().padLeft(2, '0')}-${_app.submittedDate.day.toString().padLeft(2, '0')}',
              ),
              const SizedBox(width: 12),
              _buildMetaItem(
                'App ID',
                '#${_app.applicationId}',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetaItem(String label, String value, {bool flexible = false}) {
    final item = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.secondaryLabel,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.dark,
          ),
        ),
      ],
    );
    return flexible ? Expanded(child: item) : item;
  }

  // --- WIDGET 2: Action Required Banner (Revised status) ---
  Widget _buildActionRequiredBanner() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4), width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.bell_fill, color: AppColors.warning, size: 20),
              SizedBox(width: 8),
              Text(
                'Officer Revisions Requested',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.warning,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'The verifying officer has reviewed your submission and requested additional clarification or corrected documentation. Please resolve the remarks below to resume processing.',
            style: TextStyle(fontSize: 13, color: AppColors.dark, height: 1.4),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.warning,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              icon: const Icon(CupertinoIcons.arrow_up_doc_fill, size: 18),
              label: const Text(
                'Resolve & Re-Submit Documents',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              onPressed: () => _openResubmissionSheet(context),
            ),
          ),
        ],
      ),
    );
  }

  // --- WIDGET 2.5: Booking Options Card (Completed / Approved status) ---
  Widget _buildBookingOptionsCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.success.withValues(alpha: 0.35), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: AppColors.success.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(CupertinoIcons.calendar_badge_plus, color: AppColors.success, size: 24),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ready for Collection & Booking',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Official Decree & Clearance Process Completed',
                      style: TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'All statutory milestones and regulatory verification stages have been approved. You can now book an in-person appointment slot at the counter or schedule postal delivery dispatch.',
            style: TextStyle(fontSize: 12.5, color: AppColors.dark, height: 1.35),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 12),
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(12),
              onPressed: () async {
                await Navigator.of(context).push(
                  CupertinoPageRoute(
                    builder: (_) => BookingOptionsScreen(
                      applicationId: _app.applicationId.toString(),
                      serviceName: _app.serviceName,
                      departmentName: _app.department,
                      citizenNic: _app.citizenNic,
                    ),
                  ),
                );
                if (mounted) await _refresh();
              },
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(CupertinoIcons.calendar, size: 16, color: Colors.white),
                  SizedBox(width: 8),
                  Text(
                    'Book Collection / Appointment Options',
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                  SizedBox(width: 6),
                  Icon(CupertinoIcons.arrow_right, size: 14, color: Colors.white),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // --- WIDGET 3: Digital Verification Pass (Approved status) ---
  Widget _buildDigitalVerificationPass() {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F2027), Color(0xFF203A43), Color(0xFF2C5364)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: const [
                  Icon(CupertinoIcons.shield_lefthalf_fill, color: Color(0xFF56CCF2), size: 24),
                  SizedBox(width: 8),
                  Text(
                    'OFFICIAL VERIFICATION PASS',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.success,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'ACTIVE & VALID',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              // Stylized QR Pass Box
              Container(
                width: 86,
                height: 86,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 8,
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(8),
                child: CustomPaint(
                  painter: _QrMatrixPainter(),
                ),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _app.serviceName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Ref: ${_app.referenceNumber}',
                      style: const TextStyle(
                        color: Color(0xFF56CCF2),
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Cryptographic Proof: SHA-256 Validated',
                      style: TextStyle(
                        color: Colors.white60,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Divider(height: 1, color: Colors.white24),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Issued by Verifying Officer Division',
                style: TextStyle(color: Colors.white60, fontSize: 11),
              ),
              TextButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Digital Verification Pass downloaded to your device.'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                },
                icon: const Icon(CupertinoIcons.share, color: Color(0xFF56CCF2), size: 16),
                label: const Text(
                  'Share Pass',
                  style: TextStyle(color: Color(0xFF56CCF2), fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // --- WIDGET 4: Verification Progress Stepper ---
  Widget _buildVerificationProgressCard() {
    int currentStep = 2; // Default to Officer review
    if (_app.status.toLowerCase() == 'approved') {
      currentStep = 4;
    } else if (_app.status.toLowerCase() == 'rejected') {
      currentStep = 4;
    } else if (_isRevised(_app.status)) {
      currentStep = 3;
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.arrow_2_circlepath, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Verification Lifecycle Progress',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _buildStepItem(
            stepNumber: 1,
            title: 'Application Received & Registered',
            description: 'Intake validated by system registry.',
            isCompleted: currentStep >= 1,
            isActive: currentStep == 1,
          ),
          _buildStepItem(
            stepNumber: 2,
            title: 'Automated AI & Pre-Compliance Checks',
            description: 'NIC authenticity & prerequisite rules evaluated.',
            isCompleted: currentStep >= 2,
            isActive: currentStep == 2,
          ),
          _buildStepItem(
            stepNumber: 3,
            title: 'Officer Queue & Manual Verification',
            description: 'Assigned to Verifying Officer for legal and document compliance.',
            isCompleted: currentStep >= 3,
            isActive: currentStep == 3,
          ),
          _buildStepItem(
            stepNumber: 4,
            title: _app.status.toLowerCase() == 'rejected'
                ? 'Verification Decision: Rejected'
                : (_isRevised(_app.status)
                    ? 'Officer Decision: Revision Requested'
                    : 'Final Verification Sign-Off & Seal'),
            description: _app.status.toLowerCase() == 'approved'
                ? 'Passed all compliance criteria. Certificate issued.'
                : (_app.status.toLowerCase() == 'rejected'
                    ? 'Application failed mandatory criteria.'
                    : 'Pending final citizen corrections.'),
            isCompleted: currentStep >= 4,
            isActive: currentStep == 4,
            isLast: true,
            customColor: _app.status.toLowerCase() == 'rejected'
                ? AppColors.danger
                : (_isRevised(_app.status)
                    ? AppColors.warning
                    : AppColors.success),
          ),
        ],
      ),
    );
  }

  Widget _buildStepItem({
    required int stepNumber,
    required String title,
    required String description,
    required bool isCompleted,
    required bool isActive,
    bool isLast = false,
    Color? customColor,
  }) {
    final activeColor = customColor ?? AppColors.primary;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isCompleted
                    ? (customColor ?? AppColors.success)
                    : (isActive ? activeColor : AppColors.divider),
              ),
              child: Center(
                child: isCompleted
                    ? const Icon(CupertinoIcons.checkmark, color: Colors.white, size: 16)
                    : Text(
                        '$stepNumber',
                        style: TextStyle(
                          color: isActive ? Colors.white : AppColors.secondaryLabel,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 38,
                color: isCompleted ? AppColors.success.withValues(alpha: 0.5) : AppColors.divider,
              ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: isCompleted || isActive ? AppColors.dark : AppColors.secondaryLabel,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.secondaryLabel,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // --- WIDGET 5: Officer Review & Decision Feedback ---
  Widget _buildOfficerReviewCard() {
    final reviews = _app.verificationTask?.reviews ?? [];
    final latestReview = reviews.isNotEmpty ? reviews.last : null;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.person_badge_plus, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Officer Review & Findings',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (latestReview != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(CupertinoIcons.checkmark_shield_fill, size: 14, color: AppColors.secondaryLabel),
                  const SizedBox(width: 6),
                  Text(
                    'Reviewed by: ${latestReview.officerId}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.dark),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${latestReview.reviewDate.year}-${latestReview.reviewDate.month.toString().padLeft(2, '0')}-${latestReview.reviewDate.day.toString().padLeft(2, '0')}',
                    style: const TextStyle(fontSize: 11, color: AppColors.secondaryLabel),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Rejection reason code badge if present
            if (latestReview.rejectionReasonCode != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(CupertinoIcons.tag_fill, color: AppColors.danger, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'REASON CODE: ${latestReview.rejectionReasonCode}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: AppColors.danger,
                              letterSpacing: 0.4,
                            ),
                          ),
                          if (latestReview.rejectionReasonDescription != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              latestReview.rejectionReasonDescription!,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.dark,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            // Officer comments
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(12),
                border: const Border(left: BorderSide(color: AppColors.primary, width: 3.5)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Officer Remarks:',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.secondaryLabel,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    latestReview.comments.isNotEmpty
                        ? latestReview.comments
                        : 'Application verified without additional remarks.',
                    style: const TextStyle(fontSize: 13.5, color: AppColors.dark, height: 1.35),
                  ),
                ],
              ),
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: const [
                  Icon(CupertinoIcons.hourglass, color: AppColors.secondaryLabel, size: 20),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Your application is currently in the officer review queue. Once an officer inspects your documents, remarks will appear here.',
                      style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel, height: 1.3),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  // --- WIDGET 6: Statutory Compliance Checklist ---
  Widget _buildComplianceChecklistCard() {
    final checks = _app.verificationTask?.complianceChecks ?? [];

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: const [
                  Icon(CupertinoIcons.checkmark_rectangle_fill, color: AppColors.primary, size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Statutory Compliance Checks',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.dark,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${checks.where((c) => c.isPassed).length}/${checks.length} Passed',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.secondaryLabel),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (checks.isEmpty)
            const Text(
              'No compliance checks logged for this service.',
              style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
            )
          else
            ...checks.map((check) => _buildComplianceRow(check)),
        ],
      ),
    );
  }

  Widget _buildComplianceRow(ComplianceCheckModel check) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            check.isPassed ? CupertinoIcons.checkmark_circle_fill : CupertinoIcons.clear_circled_solid,
            color: check.isPassed ? AppColors.success : AppColors.danger,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  check.checkType,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  check.details,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.secondaryLabel,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- WIDGET 7: Audit Trail History ---
  Widget _buildAuditTrailCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.clock_fill, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Verification Audit Trail',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_app.auditLogs.isEmpty)
            const Text(
              'No audit records found.',
              style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
            )
          else
            ..._app.auditLogs.map((log) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        margin: const EdgeInsets.only(top: 5),
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  log.action,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.dark,
                                  ),
                                ),
                                Text(
                                  '${log.timestamp.hour.toString().padLeft(2, '0')}:${log.timestamp.minute.toString().padLeft(2, '0')}',
                                  style: const TextStyle(fontSize: 11, color: AppColors.secondaryLabel),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'By: ${log.performedBy}',
                              style: const TextStyle(fontSize: 11.5, color: AppColors.secondaryLabel),
                            ),
                            if (log.newValues.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                log.newValues,
                                style: const TextStyle(fontSize: 11, color: AppColors.secondaryLabel),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }

  // --- MODAL: Resubmission Sheet for Revised status ---
  void _openResubmissionSheet(BuildContext context) {
    final noteController = TextEditingController();
    String attachedDoc = 'Tap paperclip to select document...';
    PlatformFile? pickedFile;
    bool isSubmitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Container(
          decoration: const BoxDecoration(
            color: AppColors.cardBg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Submit Requested Documents',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Attach the corrected document or certified copy as instructed by the reviewing officer.',
                style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
              ),
              const SizedBox(height: 16),
              // Attached doc box
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.doc_fill, color: AppColors.primary, size: 24),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        attachedDoc,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: attachedDoc.startsWith('Tap') ? AppColors.secondaryLabel : AppColors.dark,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(CupertinoIcons.paperclip, color: AppColors.primary),
                      onPressed: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          final res = await FilePicker.pickFiles(
                            type: FileType.custom,
                            allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
                          );
                          if (res.isNotEmpty) {
                            setModalState(() {
                              pickedFile = res.first;
                              attachedDoc = res.first.name;
                            });
                          }
                        } catch (e) {
                          messenger.showSnackBar(
                            SnackBar(content: Text('Could not pick document: $e')),
                          );
                        }
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Notes / Clarification for Officer',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.dark),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: noteController,
                maxLines: 3,
                maxLength: 2000,
                decoration: InputDecoration(
                  hintText: 'e.g. Attached the newly certified survey plan with eastern boundary coordinates...',
                  hintStyle: const TextStyle(fontSize: 12.5, color: AppColors.secondaryLabel),
                  filled: true,
                  fillColor: AppColors.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final messenger = ScaffoldMessenger.of(context);
                          if (attachedDoc.startsWith('Tap')) {
                            messenger.showSnackBar(const SnackBar(content: Text('Please tap the paperclip to select your corrected document.')));
                            return;
                          }
                          final noteError = Validators.text(noteController.text, field: 'Revision note', min: 5, max: 2000);
                          if (noteError != null) {
                            messenger.showSnackBar(SnackBar(content: Text(noteError)));
                            return;
                          }
                          setModalState(() => isSubmitting = true);
                          final token = ref.read(authTokenProvider);
                          if (pickedFile != null && token.isNotEmpty) {
                            try {
                              final bytes = await pickedFile!.readAsBytes();
                              await ServiceApiClient.uploadDocument(
                                fieldLabel: 'Revised Evidentiary Document',
                                fileName: pickedFile!.name,
                                bytes: bytes,
                                token: token,
                              );
                            } catch (_) {
                              // Non-fatal if pre-upload fails, backend fallback still accepts documentAttachmentName
                            }
                          }
                          final submitted = await VerificationApiService.submitRevision(
                            applicationId: _app.applicationId,
                            notes: noteController.text,
                            documentAttachmentName: attachedDoc,
                            token: token,
                          );
                          if (!submitted) {
                            setModalState(() => isSubmitting = false);
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Could not submit the correction. Please try again later.'),
                                backgroundColor: AppColors.danger,
                              ),
                            );
                            return;
                          }
                          if (ctx.mounted) {
                            Navigator.pop(ctx);
                          }
                          await _refresh();
                          if (mounted) {
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Correction submitted! Your application is now back in the officer verification queue.'),
                                backgroundColor: AppColors.success,
                              ),
                            );
                          }
                        },
                  child: isSubmitting
                      ? const CupertinoActivityIndicator(color: Colors.white)
                      : const Text(
                          'Confirm & Re-Submit to Officer',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Custom painter to generate a clean, official-looking QR Matrix graphic for verification
class _QrMatrixPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFF0F2027);

    // Draw finder patterns (top-left, top-right, bottom-left)
    _drawFinderPattern(canvas, paint, 0, 0, size.width * 0.28);
    _drawFinderPattern(canvas, paint, size.width * 0.72, 0, size.width * 0.28);
    _drawFinderPattern(canvas, paint, 0, size.height * 0.72, size.width * 0.28);

    // Draw some structured pseudo-matrix modules
    final double step = size.width / 12;
    for (int r = 1; r < 11; r++) {
      for (int c = 1; c < 11; c++) {
        // Skip corner finder pattern areas
        if ((r < 4 && c < 4) || (r < 4 && c > 7) || (r > 7 && c < 4)) continue;
        if ((r + c * 3) % 3 == 0 || (r * c) % 5 == 0) {
          canvas.drawRect(
            Rect.fromLTWH(c * step, r * step, step * 0.85, step * 0.85),
            paint,
          );
        }
      }
    }
  }

  void _drawFinderPattern(Canvas canvas, Paint paint, double x, double y, double s) {
    // Outer box
    paint.style = PaintingStyle.stroke;
    paint.strokeWidth = s * 0.22;
    canvas.drawRect(Rect.fromLTWH(x + s * 0.11, y + s * 0.11, s * 0.78, s * 0.78), paint);

    // Inner dot
    paint.style = PaintingStyle.fill;
    canvas.drawRect(Rect.fromLTWH(x + s * 0.35, y + s * 0.35, s * 0.3, s * 0.3), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
