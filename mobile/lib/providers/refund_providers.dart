import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/refund.dart';
import 'service_providers.dart';

part 'refund_providers.g.dart';

@riverpod
Future<List<RefundRequest>> myRefunds(Ref ref) => ref.watch(refundServiceProvider).myRefunds();

/// One refund request. Staff decisions arrive through the realtime hub; this slow poll only
/// covers missed messages and skips while the app is in the background.
@riverpod
class RefundDetail extends _$RefundDetail {
  static const _pollInterval = Duration(seconds: 60);

  @override
  Future<RefundRequest> build(String refundId) async {
    if (refundId.isEmpty) throw Exception('No refund ID specified.');

    final timer = Timer.periodic(_pollInterval, (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) _silentRefresh();
    });
    ref.onDispose(timer.cancel);

    final service = ref.watch(refundServiceProvider);
    final refund = await service.getRefund(refundId);
    // The status endpoint can be fresher than the record itself
    try {
      final freshStatus = await service.getRefundStatus(refundId);
      return _withStatus(refund, freshStatus);
    } catch (_) {
      return refund;
    }
  }

  /// Background poll: only replaces the data on success, never flips the screen to loading/error.
  Future<void> _silentRefresh() async {
    try {
      final refund = await ref.read(refundServiceProvider).getRefund(refundId);
      if (ref.mounted) state = AsyncData(refund);
    } catch (_) {}
  }

  RefundRequest _withStatus(RefundRequest r, RefundStatus status) => RefundRequest(
        id: r.id,
        paymentId: r.paymentId,
        refundAmount: r.refundAmount,
        reason: r.reason,
        status: status,
        refundTransactionRef: r.refundTransactionRef,
        requestedByEmail: r.requestedByEmail,
        departmentName: r.departmentName,
        decidedByEmail: r.decidedByEmail,
        decisionNote: r.decisionNote,
        requestedDate: r.requestedDate,
        decidedDate: r.decidedDate,
        completedDate: r.completedDate,
      );
}
