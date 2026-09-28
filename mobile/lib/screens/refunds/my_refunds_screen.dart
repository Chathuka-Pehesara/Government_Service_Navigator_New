import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/refund_providers.dart';
import '../../models/refund.dart';
import '../../widgets/status_badge.dart';
import 'refund_detail_screen.dart';
import 'refund_request_screen.dart';

class MyRefundsScreen extends ConsumerStatefulWidget {
  const MyRefundsScreen({super.key});

  @override
  ConsumerState<MyRefundsScreen> createState() => _MyRefundsScreenState();
}

class _MyRefundsScreenState extends ConsumerState<MyRefundsScreen> {
  AsyncValue<List<RefundRequest>> get _refundsState => ref.watch(myRefundsProvider);
  bool get _isLoading => _refundsState.isLoading;
  String? get _errorMessage =>
      _refundsState.hasError ? _refundsState.error.toString().replaceAll('Exception: ', '') : null;
  List<RefundRequest> get _refunds => _refundsState.value ?? const [];

  Future<void> _loadRefunds() async {
    try {
      ref.invalidate(myRefundsProvider);
      await ref.read(myRefundsProvider.future);
    } catch (_) {
      // Handled by provider error state
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('My Refunds'),
        backgroundColor: AppColors.cardBg,
        elevation: 0,
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.of(context).pop(),
          child: const Icon(CupertinoIcons.chevron_left, color: AppColors.primary),
        ),
        actions: [
          CupertinoButton(
            padding: const EdgeInsets.only(right: 16),
            onPressed: () async {
              await Navigator.of(context).push(
                CupertinoPageRoute(
                  builder: (_) => const RefundRequestScreen(),
                ),
              );
              if (mounted) _loadRefunds();
            },
            child: const Icon(CupertinoIcons.add, color: AppColors.primary),
          ),
        ],
      ),
      body: SafeArea(
        child: _isLoading
            ? _buildLoading()
            : _errorMessage != null
                ? _buildError()
                : _refunds.isEmpty
                    ? _buildEmpty()
                    : _buildList(),
      ),
    );
  }

  Widget _buildLoading() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CupertinoActivityIndicator(radius: 14),
          SizedBox(height: 12),
          Text(
            'Loading refund requests...',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.secondaryLabel,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(CupertinoIcons.exclamationmark_triangle_fill,
                color: AppColors.danger, size: 48),
            const SizedBox(height: 16),
            const Text(
              'Failed to load refunds',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage ?? 'Failed to load refund requests.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.secondaryLabel, fontSize: 14),
            ),
            const SizedBox(height: 24),
            CupertinoButton.filled(
              borderRadius: BorderRadius.circular(12),
              onPressed: _loadRefunds,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return RefreshIndicator(
      onRefresh: _loadRefunds,
      color: AppColors.primary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.22),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      CupertinoIcons.arrow_uturn_left_circle_fill,
                      color: AppColors.primary,
                      size: 48,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'No refund requests found',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'No refund requests match your current account session. Tap + to submit a new request.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: AppColors.secondaryLabel),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: _loadRefunds,
      color: AppColors.primary,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _refunds.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final r = _refunds[index];
          return _RefundListItem(
            initialRefund: r,
            onReturned: _loadRefunds,
          );
        },
      ),
    );
  }
}

/// Helper widget that subscribes to real-time polling updates for each list item
class _RefundListItem extends ConsumerWidget {
  final RefundRequest initialRefund;
  final VoidCallback onReturned;

  const _RefundListItem({
    required this.initialRefund,
    required this.onReturned,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watches the same real-time polling provider used in RefundDetailScreen
    final liveRefundAsync = ref.watch(refundDetailProvider(initialRefund.id));
    
    // Fall back to initial list data if live fetch is still loading or errored
    final currentStatus = liveRefundAsync.value?.status ?? initialRefund.status;
    final currentAmount = liveRefundAsync.value?.refundAmount ?? initialRefund.refundAmount;
    final currentReason = liveRefundAsync.value?.reason ?? initialRefund.reason;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider, width: 0.8),
        boxShadow: [
          BoxShadow(
            color: AppColors.dark.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () async {
            await Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (_) => RefundDetailScreen(
                  refundId: initialRefund.id,
                ),
              ),
            );
            onReturned();
          },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    CupertinoIcons.arrow_uturn_left,
                    color: AppColors.primary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Payment #${initialRefund.paymentId}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.dark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'LKR ${currentAmount.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppColors.secondaryLabel,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (currentReason != null && currentReason.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          currentReason,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.secondaryLabel,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                StatusBadge(status: currentStatus),
                const SizedBox(width: 6),
                const Icon(
                  CupertinoIcons.chevron_right,
                  size: 14,
                  color: AppColors.secondaryLabel,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
