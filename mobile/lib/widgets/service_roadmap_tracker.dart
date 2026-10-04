import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../theme/app_colors.dart';

class ServiceRoadmapTracker extends StatelessWidget {
  final int currentStage;
  final int maxStages;
  final String stageStatus;
  final VoidCallback? onActionTap;
  final List<String>? stageDepartments;
  final String? currentDepartment;
  final VoidCallback? onFillStageFormTap;
  final String? fillStageFormButtonText;
  final VoidCallback? onBookingTap;
  final int? selectedStage;
  final ValueChanged<int>? onStageSelected;

  const ServiceRoadmapTracker({
    super.key,
    required this.currentStage,
    required this.maxStages,
    required this.stageStatus,
    this.onActionTap,
    this.stageDepartments,
    this.currentDepartment,
    this.onFillStageFormTap,
    this.fillStageFormButtonText,
    this.onBookingTap,
    this.selectedStage,
    this.onStageSelected,
  });

  List<String> get _defaultStageNames {
    if (stageDepartments != null && stageDepartments!.isNotEmpty) {
      return List.generate(maxStages, (i) {
        if (i < stageDepartments!.length) {
          final dept = stageDepartments![i];
          return 'Stage ${i + 1}: $dept';
        }
        return 'Stage ${i + 1}: Department Review';
      });
    }
    if (maxStages == 3) {
      return [
        'Document Review',
        'Fee & Payment',
        'Fulfillment & Collection',
      ];
    } else if (maxStages == 2) {
      return [
        'Initial Verification',
        'Departmental Approval',
      ];
    }
    return [
      'Document Review & Verification',
    ];
  }

  @override
  Widget build(BuildContext context) {
    final stages = _defaultStageNames;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(CupertinoIcons.map_fill, color: AppColors.primary, size: 18),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Service Progress Roadmap',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Stage $currentStage of $maxStages',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (int i = 0; i < stages.length; i++) ...[
            _buildStageItem(
              stageNumber: i + 1,
              title: stages[i],
              isPassed: (i + 1) < currentStage || (stageStatus == 'Completed' && (i + 1) <= maxStages),
              isCurrent: (i + 1) == currentStage && stageStatus != 'Completed',
              isSelected: selectedStage != null ? selectedStage == (i + 1) : (i + 1) == currentStage,
              isLast: i == stages.length - 1,
            ),
          ],
          if (stageStatus == 'AwaitingFeePayment' && onActionTap != null) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 12),
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(12),
                onPressed: onActionTap,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.creditcard_fill, size: 16, color: Colors.white),
                    SizedBox(width: 8),
                    Text(
                      'Pay Statutory Fee Now',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                    SizedBox(width: 6),
                    Icon(CupertinoIcons.arrow_right, size: 14, color: Colors.white),
                  ],
                ),
              ),
            ),
          ],
          if ((stageStatus == 'StageApproved' || stageStatus.endsWith('Unlocked')) && onFillStageFormTap != null) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 12),
                color: AppColors.success,
                borderRadius: BorderRadius.circular(12),
                onPressed: onFillStageFormTap,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(CupertinoIcons.doc_text_fill, size: 16, color: Colors.white),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        fillStageFormButtonText ?? 'Fill Stage $currentStage Form Now',
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(CupertinoIcons.arrow_right, size: 14, color: Colors.white),
                  ],
                ),
              ),
            ),
          ],
          if (stageStatus == 'Completed' && onBookingTap != null) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 12),
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(12),
                onPressed: onBookingTap,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.calendar, size: 16, color: Colors.white),
                    SizedBox(width: 8),
                    Text(
                      'Book Counter Appointment / Collection',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                    SizedBox(width: 6),
                    Icon(CupertinoIcons.arrow_right, size: 14, color: Colors.white),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStageItem({
    required int stageNumber,
    required String title,
    required bool isPassed,
    required bool isCurrent,
    required bool isSelected,
    required bool isLast,
  }) {
    Color iconBg;
    IconData icon;
    Color iconColor;

    final isWaitingReview = isCurrent && (stageStatus == 'PendingReview' || stageStatus == 'Submitted' || stageStatus == 'InReview' || stageStatus == 'Pending');
    final isStageUnlocked = isCurrent && (stageStatus == 'StageApproved' || stageStatus.endsWith('Unlocked'));

    if (isPassed) {
      iconBg = AppColors.success.withValues(alpha: 0.15);
      icon = CupertinoIcons.checkmark_alt;
      iconColor = AppColors.success;
    } else if (isWaitingReview) {
      iconBg = const Color(0xFFFFF1C5);
      icon = CupertinoIcons.hourglass;
      iconColor = const Color(0xFFB25E00);
    } else if (isStageUnlocked) {
      iconBg = AppColors.success.withValues(alpha: 0.15);
      icon = CupertinoIcons.pencil;
      iconColor = AppColors.success;
    } else if (isCurrent) {
      iconBg = AppColors.primary.withValues(alpha: 0.15);
      icon = CupertinoIcons.circle_fill;
      iconColor = AppColors.primary;
    } else {
      iconBg = Colors.grey.withValues(alpha: 0.15);
      icon = CupertinoIcons.lock_fill;
      iconColor = Colors.grey;
    }

    final isTappable = isCurrent && onActionTap != null;

    final String? assignedDept = (stageDepartments != null && stageNumber - 1 < stageDepartments!.length)
        ? stageDepartments![stageNumber - 1]
        : null;

    final String statusSubtitle;
    if (isPassed) {
      statusSubtitle = assignedDept != null
          ? 'Completed • Verified by $assignedDept Officer'
          : 'Completed • Verified by Verification Officer';
    } else if (isCurrent) {
      if (stageStatus == 'AwaitingFeePayment') {
        statusSubtitle = 'Action Required • Fee payment required to proceed';
      } else if (isStageUnlocked) {
        statusSubtitle = assignedDept != null
            ? 'Verified! Ready for $assignedDept form submission'
            : 'Verified! Ready for next stage submission';
      } else if (isWaitingReview) {
        statusSubtitle = assignedDept != null
            ? 'Stage $stageNumber Submitted • Waiting for $assignedDept verification'
            : 'Stage $stageNumber Submitted • Waiting for official verification';
      } else if (stageStatus == 'NotStarted') {
        statusSubtitle = assignedDept != null
            ? 'Initial Stage • Ready for $assignedDept application'
            : 'Initial Stage • Ready to apply';
      } else {
        statusSubtitle = assignedDept != null
            ? 'In-Progress • Under review by $assignedDept'
            : 'In-Progress • Under official verification';
      }
    } else {
      statusSubtitle = assignedDept != null
          ? 'Locked • Unlocks after Stage ${stageNumber - 1} clearance ($assignedDept)'
          : (stageNumber == 3
              ? 'Locked until payment verified'
              : 'Locked until prior stage completed');
    }

    return InkWell(
      onTap: () {
        if (onStageSelected != null) {
          onStageSelected!(stageNumber);
        } else if (isTappable && onActionTap != null) {
          onActionTap!();
        }
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withValues(alpha: 0.06) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: isSelected ? Border.all(color: AppColors.primary.withValues(alpha: 0.35), width: 1.2) : null,
        ),
        padding: EdgeInsets.symmetric(vertical: 6, horizontal: isSelected ? 8 : 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: iconBg,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, size: 14, color: iconColor),
                ),
                if (!isLast)
                  Container(
                    width: 2,
                    height: 26,
                    color: isPassed ? AppColors.success : Colors.grey.withValues(alpha: 0.25),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: (isCurrent || isSelected) ? FontWeight.w700 : FontWeight.w600,
                            color: isSelected
                                ? AppColors.primary
                                : isPassed
                                    ? AppColors.dark
                                    : isCurrent
                                        ? AppColors.primary
                                        : AppColors.secondaryLabel,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isSelected) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                          decoration: BoxDecoration(
                            color: isCurrent
                                ? AppColors.primary.withValues(alpha: 0.15)
                                : Colors.grey.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            isCurrent ? 'Current' : 'Viewing',
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.bold,
                              color: isCurrent ? AppColors.primary : AppColors.dark,
                            ),
                          ),
                        ),
                      ],
                      if (isTappable) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                          decoration: BoxDecoration(
                            color: AppColors.warning.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'Action Ready',
                            style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: AppColors.warning),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(CupertinoIcons.chevron_right, size: 13, color: AppColors.primary),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    statusSubtitle,
                    style: TextStyle(
                      fontSize: 11,
                      color: isCurrent && stageStatus == 'AwaitingFeePayment'
                          ? AppColors.warning
                          : isPassed
                              ? AppColors.success
                              : AppColors.secondaryLabel,
                      fontWeight: isCurrent && stageStatus == 'AwaitingFeePayment'
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                  if (!isLast) const SizedBox(height: 6),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
