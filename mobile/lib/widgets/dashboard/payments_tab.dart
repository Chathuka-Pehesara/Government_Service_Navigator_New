import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../theme/app_colors.dart';
import '../../providers/payment_providers.dart';
import '../../providers/application_providers.dart';
import '../../models/payment.dart';
import '../../models/verification_models.dart';
import '../../screens/payments/payment_screen.dart';
import '../../screens/payments/payment_ledger_screen.dart';
import '../../screens/payments/transaction_history_screen.dart';
import '../../screens/refunds/refund_request_screen.dart';
import '../../screens/refunds/my_refunds_screen.dart';

class PaymentsDashboardTab extends ConsumerWidget {
  const PaymentsDashboardTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
            // 1. Pending Application Fees (if any)
            _buildPendingApplicationFeesSection(context, ref, applicationsAsync),

            // 2. Recent Payment History
            _buildRecentPaymentsSection(context, ref, paymentsAsync),
            const SizedBox(height: 24),

            // 3. Refunds Section
            _buildRefundsSection(context),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildPendingApplicationFeesSection(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<List<ApplicationItemModel>> applicationsAsync,
  ) {
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
            const SizedBox(height: 14),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Widget _buildRecentPaymentsSection(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<List<Payment>> paymentsAsync,
  ) {
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
                return _RealtimePaymentItemCard(
                  initialPayment: payment,
                  onReturned: () {
                    ref.invalidate(myPaymentsProvider);
                  },
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

  Widget _buildRefundsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('Refunds'),
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

/// Helper widget that resolves real-time payment status updates from the parent payments provider
class _RealtimePaymentItemCard extends ConsumerWidget {
  final Payment initialPayment;
  final VoidCallback onReturned;

  const _RealtimePaymentItemCard({
    required this.initialPayment,
    required this.onReturned,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch the master payments list provider to stay synchronized with real-time updates
    final paymentsAsync = ref.watch(myPaymentsProvider);
    
    // Find the latest matching payment from the provider list, or fall back to initial item
    final payment = paymentsAsync.value?.firstWhere(
          (p) => p.id == initialPayment.id,
          orElse: () => initialPayment,
        ) ?? initialPayment;

    final statusStr = payment.status ?? 'Pending';
    final isPaid = statusStr.toLowerCase() == 'paid' || statusStr.toLowerCase() == 'verified';
    final isPending = statusStr.toLowerCase().contains('pending');
    final statusColor = isPaid ? AppColors.success : (isPending ? AppColors.warning : AppColors.danger);

    final refIntent = payment.stripePaymentIntentId;
    final createdDateStr = payment.createdDate;

    String refDisplay;
    if (refIntent != null && refIntent.startsWith('PAY-')) {
      refDisplay = refIntent;
    } else {
      final datePart = (createdDateStr != null && createdDateStr.length >= 10)
          ? createdDateStr.substring(0, 10).replaceAll('-', '')
          : DateTime.now().toIso8601String().substring(0, 10).replaceAll('-', '');
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
            onPressed: () async {
              await Navigator.of(context).push(
                CupertinoPageRoute(
                  builder: (_) => PaymentLedgerScreen(paymentId: payment.id),
                ),
              );
              onReturned();
            },
            child: const Icon(CupertinoIcons.chevron_right, size: 14, color: AppColors.secondaryLabel),
          ),
        ],
      ),
    );
  }
}