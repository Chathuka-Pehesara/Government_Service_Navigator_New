import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/verification_models.dart';
import '../providers/application_providers.dart';
import '../providers/catalog_providers.dart';
import '../providers/session_provider.dart';
import '../theme/app_colors.dart';
import '../widgets/service_roadmap_tracker.dart';
import 'application_form_screen.dart';
import 'agent2_statutory_auditor_screen.dart';
import 'payments/payment_screen.dart';
import 'verification_detail_screen.dart';

class ProcedureDetailScreen extends ConsumerStatefulWidget {
  final int serviceId;
  const ProcedureDetailScreen({super.key, required this.serviceId});

  @override
  ConsumerState<ProcedureDetailScreen> createState() => _ProcedureDetailScreenState();
}

class _ProcedureDetailScreenState extends ConsumerState<ProcedureDetailScreen> {
  int? _selectedStage;

  @override
  Widget build(BuildContext context) {
    final serviceId = widget.serviceId;
    final details = ref.watch(serviceDetailsProvider(serviceId));
    final isSignedIn = ref.watch(sessionProvider.select((s) => s.isSignedIn));
    final myAppsAsync = ref.watch(myApplicationsProvider);
    final myApps = myAppsAsync.value ?? const <ApplicationItemModel>[];

    if (details.isLoading) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final serviceDetails = details.value;
    if (serviceDetails == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Failed to load details')),
      );
    }

    final activeApp = myApps.cast<ApplicationItemModel?>().firstWhere(
      (a) =>
          a != null &&
          (a.serviceProcedureId == serviceId ||
              a.serviceName.trim().toLowerCase() ==
                  (serviceDetails['name']?.toString() ?? '').trim().toLowerCase()),
      orElse: () => null,
    );

    List<String> workflowDepts = [];
    final rawDepts = serviceDetails['workflowDepartments'];
    if (rawDepts is List) {
      workflowDepts = rawDepts.map((e) => e.toString()).toList();
    } else if (rawDepts is String && rawDepts.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawDepts);
        if (decoded is List) {
          workflowDepts = decoded.map((e) => e.toString()).toList();
        }
      } catch (_) {}
    }
    final totalStages = (serviceDetails['totalStages'] as num?)?.toInt() ??
        (workflowDepts.isNotEmpty ? workflowDepts.length : 1);

    final int currentStage = activeApp?.currentStage ?? 1;
    final int maxStages = activeApp != null && activeApp.maxStages > 1 ? activeApp.maxStages : totalStages;
    final int displayStage = (_selectedStage ?? currentStage).clamp(1, maxStages > 0 ? maxStages : 1);

    final stageDetailsAsync = totalStages > 1
        ? ref.watch(serviceStageDetailsProvider((serviceId: serviceId, stage: displayStage)))
        : null;

    final stageData = stageDetailsAsync?.value;
    final List<dynamic> docs = (totalStages > 1 && stageData != null)
        ? (stageData['documentRequirements'] as List? ?? [])
        : (totalStages <= 1 ? (serviceDetails['documentRequirements'] as List? ?? []) : []);

    final List<dynamic> fees = (totalStages > 1 && stageData != null)
        ? (stageData['feeSchedules'] as List? ?? [])
        : (totalStages <= 1 ? (serviceDetails['feeSchedules'] as List? ?? []) : []);

    final String? stageDeptName = stageData?['stageDepartment'] as String? ??
        (workflowDepts.isNotEmpty && displayStage - 1 < workflowDepts.length ? workflowDepts[displayStage - 1] : null);

    return Scaffold(
      appBar: AppBar(title: Text(serviceDetails['name'] ?? 'Service Details')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myApplicationsProvider);
          ref.invalidate(serviceDetailsProvider(serviceId));
          if (totalStages > 1) {
            ref.invalidate(serviceStageDetailsProvider((serviceId: serviceId, stage: displayStage)));
          }
          await ref.read(myApplicationsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            Text(
              'Service ID: ${serviceDetails['serviceId'] ?? serviceId}',
              style: const TextStyle(color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 14),

            // Dynamic Multi-Department Verification Roadmap Tracker
            if (totalStages > 1 || workflowDepts.isNotEmpty || activeApp != null) ...[
              ServiceRoadmapTracker(
                currentStage: currentStage,
                selectedStage: displayStage,
                maxStages: maxStages,
                stageStatus: activeApp?.stageStatus ?? 'NotStarted',
                stageDepartments: workflowDepts.isNotEmpty ? workflowDepts : activeApp?.workflowDepartments,
                currentDepartment: activeApp?.currentDepartment ?? (workflowDepts.isNotEmpty ? workflowDepts[0] : null),
                onStageSelected: (stage) {
                  setState(() {
                    _selectedStage = stage;
                  });
                },
                fillStageFormButtonText:
                    'Fill Stage $currentStage Form for ${activeApp?.currentDepartment ?? (workflowDepts.isNotEmpty && currentStage - 1 < workflowDepts.length ? workflowDepts[currentStage - 1] : "Next Dept")}',
                onFillStageFormTap: (activeApp != null &&
                        (activeApp.stageStatus == 'StageApproved' || activeApp.stageStatus.endsWith('Unlocked')))
                    ? () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => ApplicationFormScreen(
                              serviceId: serviceId,
                              serviceName: serviceDetails['name'] ?? 'Government Service',
                              stageNumber: activeApp.currentStage,
                              applicationId: activeApp.applicationId,
                            ),
                          ),
                        ).then((_) {
                          ref.invalidate(myApplicationsProvider);
                          if (totalStages > 1) {
                            ref.invalidate(serviceStageDetailsProvider((serviceId: serviceId, stage: displayStage)));
                          }
                        });
                      }
                    : null,
                onActionTap: activeApp != null
                    ? () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => VerificationDetailScreen(application: activeApp),
                          ),
                        ).then((_) {
                          ref.invalidate(myApplicationsProvider);
                          if (totalStages > 1) {
                            ref.invalidate(serviceStageDetailsProvider((serviceId: serviceId, stage: displayStage)));
                          }
                        });
                      }
                    : null,
              ),
              const SizedBox(height: 14),

              // Stage Selector Chips
              if (totalStages > 1) ...[
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: List.generate(totalStages, (idx) {
                      final stageNum = idx + 1;
                      final isSelected = stageNum == displayStage;
                      final isCurrent = stageNum == currentStage;
                      final deptName = idx < workflowDepts.length ? workflowDepts[idx] : 'Stage $stageNum';

                      return Padding(
                        padding: const EdgeInsets.only(right: 8.0),
                        child: ChoiceChip(
                          avatar: isCurrent
                              ? const Icon(CupertinoIcons.circle_fill, size: 10, color: Colors.white)
                              : null,
                          label: Text(
                            isCurrent ? 'Stage $stageNum (Current)' : 'Stage $stageNum',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                              color: isSelected ? Colors.white : AppColors.dark,
                            ),
                          ),
                          tooltip: deptName,
                          selected: isSelected,
                          selectedColor: AppColors.primary,
                          backgroundColor: AppColors.cardBg,
                          onSelected: (_) {
                            setState(() {
                              _selectedStage = stageNum;
                            });
                          },
                        ),
                      );
                    }),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Viewing banner if viewing another stage
              if (totalStages > 1 && displayStage != currentStage) ...[
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      const Icon(CupertinoIcons.info_circle_fill, size: 16, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Viewing Stage $displayStage requirements (Your active stage is Stage $currentStage)',
                          style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600),
                        ),
                      ),
                      InkWell(
                        onTap: () {
                          setState(() {
                            _selectedStage = currentStage;
                          });
                        },
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          child: Text(
                            'Jump to Active',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppColors.primary,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],

            // Required Documents Section
            Row(
              children: [
                Expanded(
                  child: Text(
                    totalStages > 1 ? 'Required Documents (Stage $displayStage)' : 'Required Documents',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                if (totalStages > 1 && stageDeptName != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      stageDeptName,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.primary),
                    ),
                  ),
              ],
            ),
            if (stageDetailsAsync != null && stageDetailsAsync.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
              )
            else if (docs.isEmpty)
              Container(
                margin: const EdgeInsets.only(top: 8, bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.checkmark_seal, size: 18, color: AppColors.secondaryLabel),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        totalStages > 1
                            ? 'No documents required for Stage $displayStage.'
                            : 'No documents required for this service.',
                        style: const TextStyle(color: AppColors.secondaryLabel, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 4),
                child: Text(
                  totalStages > 1
                      ? 'You will upload these during Stage $displayStage submission.'
                      : 'You will upload these in the application form after tapping Apply Now.',
                  style: const TextStyle(color: AppColors.secondaryLabel, fontSize: 13),
                ),
              ),
              ...docs.map<Widget>(
                (doc) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.description_outlined, color: AppColors.primary),
                  title: Text(doc['documentName'] ?? 'Document', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: (doc['description'] ?? '').toString().isEmpty ? null : Text(doc['description']),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: doc['isMandatory'] == true
                          ? AppColors.danger.withValues(alpha: 0.1)
                          : AppColors.secondaryLabel.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      doc['isMandatory'] == true ? 'Required' : 'Optional',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: doc['isMandatory'] == true ? AppColors.danger : AppColors.secondaryLabel,
                      ),
                    ),
                  ),
                ),
              ),
            ],

            // Fee Schedule Section
            const Divider(height: 30),
            Row(
              children: [
                Expanded(
                  child: Text(
                    totalStages > 1 ? 'Fee Schedule (Stage $displayStage)' : 'Fee Schedule',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            if (stageDetailsAsync != null && stageDetailsAsync.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
              )
            else if (fees.isEmpty)
              Container(
                margin: const EdgeInsets.only(top: 8, bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.checkmark_circle, size: 18, color: AppColors.success),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        totalStages > 1
                            ? 'No statutory fee required for Stage $displayStage.'
                            : 'No statutory fee required for this service.',
                        style: const TextStyle(color: AppColors.success, fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              const SizedBox(height: 4),
              ...fees.map<Widget>((fee) {
                final amount = (fee['amount'] as num?)?.toDouble() ?? 0.0;
                final feeType = fee['feeType']?.toString() ?? 'Service Fee';
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.payment, color: AppColors.primary),
                  title: Text(feeType, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: Text(
                    'LKR ${amount.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.dark),
                  ),
                );
              }),
            ],

            const SizedBox(height: 30),
            if (isSignedIn) ...[
              _buildStageActionButton(context, ref, serviceDetails, totalStages, workflowDepts, activeApp, currentStage),
              const SizedBox(height: 12),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Agent 2: Statutory Eligibility Audit', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => Agent2StatutoryAuditorScreen(
                        serviceId: serviceId,
                        serviceName: serviceDetails['name'] ?? 'Government Service',
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStageActionButton(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> serviceDetails,
    int totalStages,
    List<String> workflowDepts,
    ApplicationItemModel? activeApp,
    int currentStage,
  ) {
    if (activeApp == null) {
      // Citizen has not submitted yet
      final firstDept = workflowDepts.isNotEmpty ? workflowDepts[0] : "Initial Gate";
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 1,
          ),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => ApplicationFormScreen(
                  serviceId: widget.serviceId,
                  serviceName: serviceDetails['name'] ?? 'Government Service',
                  stageNumber: 1,
                ),
              ),
            ).then((_) {
              ref.invalidate(myApplicationsProvider);
              if (totalStages > 1) {
                ref.invalidate(serviceStageDetailsProvider((serviceId: widget.serviceId, stage: 1)));
              }
            });
          },
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.edit_document, size: 20),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      totalStages > 1 ? 'Apply for Stage 1' : 'Apply Now',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    if (totalStages > 1 && firstDept.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        firstDept,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w500,
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward, size: 16),
            ],
          ),
        ),
      );
    }

    // Active Application Exists
    final stage = activeApp.currentStage;
    final dept = activeApp.currentDepartment ??
        (stage - 1 < workflowDepts.length ? workflowDepts[stage - 1] : "Assigned Dept");
    final status = activeApp.stageStatus;

    if (status == 'StageApproved' || status == 'Draft' || status.endsWith('Unlocked')) {
      // Officer approved previous stage, or current stage is saved as draft!
      final bool isDraft = status == 'Draft';
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: isDraft ? const Color(0xFFD97706) : AppColors.success,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 1,
          ),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => ApplicationFormScreen(
                  serviceId: widget.serviceId,
                  serviceName: serviceDetails['name'] ?? 'Government Service',
                  stageNumber: stage,
                  applicationId: activeApp.applicationId,
                ),
              ),
            ).then((_) {
              ref.invalidate(myApplicationsProvider);
              if (totalStages > 1) {
                ref.invalidate(serviceStageDetailsProvider((serviceId: widget.serviceId, stage: stage)));
              }
            });
          },
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(isDraft ? Icons.edit_note_rounded : Icons.arrow_forward_rounded, size: 20),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isDraft ? 'Resume Stage $stage Application (Draft)' : 'Continue to Stage $stage',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    if (dept.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        isDraft ? 'Draft saved • $dept' : dept,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w500,
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward, size: 16),
            ],
          ),
        ),
      );
    }

    if (status == 'AwaitingFeePayment') {
      final amount = activeApp.amount > 0 ? activeApp.amount : 1000.0;
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 1,
          ),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => PaymentScreen(
                  applicationId: activeApp.applicationId.toString(),
                  amount: amount,
                  userEmail: activeApp.userEmail,
                  popOnPaid: true,
                ),
              ),
            ).then((_) {
              ref.invalidate(myApplicationsProvider);
              if (totalStages > 1) {
                ref.invalidate(serviceStageDetailsProvider((serviceId: widget.serviceId, stage: stage)));
              }
            });
          },
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.payment, size: 20),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Pay Stage $stage Statutory Fee',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'LKR ${amount.toStringAsFixed(2)} • Required to proceed',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.9),
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward, size: 16),
            ],
          ),
        ),
      );
    }

    final bool isAllCompleted = status == 'Completed' ||
        (stage >= totalStages && (status == 'StageApproved' || activeApp.status.toLowerCase() == 'approved'));

    if (isAllCompleted) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.success,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 1,
          ),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => VerificationDetailScreen(application: activeApp),
              ),
            );
          },
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle, size: 20),
              SizedBox(width: 10),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'All Stages Verified & Completed',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Tap to view certificates & logs',
                      style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w500),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 18),
            ],
          ),
        ),
      );
    }

    // Default: PendingReview / Submitted -> Waiting for officer verification
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(
              backgroundColor: const Color(0xFFFFF9E6),
              side: const BorderSide(color: Color(0xFFFFD466), width: 1.5),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => VerificationDetailScreen(application: activeApp),
                ),
              ).then((_) {
                ref.invalidate(myApplicationsProvider);
                if (totalStages > 1) {
                  ref.invalidate(serviceStageDetailsProvider((serviceId: widget.serviceId, stage: stage)));
                }
              });
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.hourglass_top, color: Color(0xFFB25E00), size: 20),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Stage $stage Under Review',
                        style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFB25E00), fontSize: 15),
                        textAlign: TextAlign.center,
                      ),
                      if (dept.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          'Assigned to $dept',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF8A4600), fontWeight: FontWeight.w500),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.chevron_right, color: Color(0xFFB25E00), size: 18),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Your Stage $stage submission is waiting for official verification by $dept. Once verified, Stage ${(stage + 1).clamp(1, activeApp.maxStages)} will unlock.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11.5, color: AppColors.secondaryLabel),
        ),
      ],
    );
  }
}
