import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/installment_plan.dart';
import '../models/ledger.dart';
import '../models/payment.dart';
import 'service_providers.dart';
import 'session_provider.dart';

part 'payment_providers.g.dart';

/// The signed-in citizen's payments. Invalidate after anything that creates or settles a payment.
@riverpod
Future<List<Payment>> myPayments(Ref ref) async {
  final session = ref.watch(sessionProvider);
  final payments = await ref.watch(paymentServiceProvider).myPayments();
  final currentEmail = session.email.trim().toLowerCase();
  if (currentEmail.isEmpty) return payments;
  return payments.where((p) {
    final pEmail = (p.userEmail ?? '').trim().toLowerCase();
    return pEmail.isEmpty || pEmail == currentEmail;
  }).toList();
}

/// Confirms a checkout with the backend (which checks Stripe) and returns the up-to-date payment.
@riverpod
Future<Payment> paymentConfirmation(Ref ref, String paymentId) =>
    ref.watch(paymentServiceProvider).confirmPayment(paymentId);

@riverpod
Future<PaymentLedger> paymentLedger(Ref ref, String paymentId) {
  if (paymentId.isEmpty) throw Exception('No payment ID specified.');
  return ref.watch(paymentServiceProvider).getLedger(paymentId);
}

/// Thrown when the citizen has no installment plan to show.
class InstallmentPlanNotFound implements Exception {
  const InstallmentPlanNotFound();

  @override
  String toString() => 'No active installment plans found for your account.';
}

/// An installment plan by id. With an empty id (opened from the menu), finds the first
/// of the citizen's payments that has a plan. Throws [InstallmentPlanNotFound] if none.
@riverpod
Future<InstallmentPlan> installmentPlan(Ref ref, String planId) async {
  final service = ref.watch(installmentServiceProvider);

  if (planId.isNotEmpty) {
    try {
      return await service.getInstallmentPlan(planId);
    } catch (e) {
      final msg = e.toString();
      if (msg.contains('404') || msg.toLowerCase().contains('not found')) throw const InstallmentPlanNotFound();
      rethrow;
    }
  }

  final payments = await ref.watch(myPaymentsProvider.future);
  for (final payment in payments) {
    try {
      return await service.getInstallmentPlan(payment.id);
    } catch (_) {
      // Continue searching remaining payments
    }
  }
  throw const InstallmentPlanNotFound();
}

/// The department account citizens transfer installments into.
@riverpod
Future<Map<String, String>> bankDetails(Ref ref) => ref.watch(installmentServiceProvider).getBankDetails();