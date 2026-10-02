import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/analytics.dart';
import 'package:mobile/models/installment_plan.dart';
import 'package:mobile/models/ledger.dart';
import 'package:mobile/models/payment.dart';
import 'package:mobile/models/refund.dart';
import 'package:mobile/models/verification_models.dart';

void main() {
  group('Payment', () {
    test('reads every field and turns numbers into strings', () {
      final p = Payment.fromJson({
        'id': 5,
        'applicationId': 12,
        'amount': 3500,
        'currency': 'LKR',
        'method': 'Bank Deposit',
        'status': 'PendingVerification',
        'department': 'Police Department',
        'paymentId': 9,
      });

      expect(p.id, '5');
      expect(p.applicationId, '12');
      expect(p.amount, 3500.0);
      expect(p.status, 'PendingVerification');
      expect(p.department, 'Police Department');
      expect(p.paymentId, '9');
    });

    test('missing values get safe defaults', () {
      final p = Payment.fromJson({});

      expect(p.id, '');
      expect(p.amount, 0.0);
      expect(p.applicationId, isNull);
    });

    test('checkout response', () {
      final c = CheckoutResponse.fromJson({'paymentId': 7, 'checkoutUrl': 'https://checkout.stripe.com/x'});

      expect(c.paymentId, '7');
      expect(c.checkoutUrl, 'https://checkout.stripe.com/x');
      expect(CheckoutResponse.fromJson({}).checkoutUrl, '');
    });
  });

  group('RefundStatus', () {
    test('round-trips every backend value', () {
      for (final status in RefundStatus.values) {
        expect(RefundStatus.fromInt(status.toInt()), status);
      }
    });

    test('unknown values read as pending', () {
      expect(RefundStatus.fromInt(99), RefundStatus.pending);
    });

    test('labels are human readable', () {
      expect(RefundStatus.processing.label, 'Processing');
    });

    test('refund reads int or double status and defaults otherwise', () {
      expect(RefundRequest.fromJson({'status': 4}).status, RefundStatus.completed);
      expect(RefundRequest.fromJson({'status': 2.0}).status, RefundStatus.rejected);
      expect(RefundRequest.fromJson({'status': 'Approved'}).status, RefundStatus.pending);
      final r = RefundRequest.fromJson({'id': 3, 'paymentId': 5, 'refundAmount': 1200, 'departmentName': 'Police Department'});
      expect(r.id, '3');
      expect(r.refundAmount, 1200.0);
      expect(r.departmentName, 'Police Department');
    });
  });

  group('Installments and ledger', () {
    test('installment plan reads its installments', () {
      final plan = InstallmentPlan.fromJson({
        'id': 1,
        'paymentId': 5,
        'numberOfInstallments': 3,
        'totalAmount': 9000,
        'status': 'Active',
        'installments': [
          {'id': 10, 'installmentNumber': 1, 'amount': 3000, 'status': 'Paid'},
          {'id': 11, 'installmentNumber': 2, 'amount': 3000, 'status': 'Pending'},
        ],
      });

      expect(plan.totalAmount, 9000.0);
      expect(plan.installments, hasLength(2));
      expect(plan.installments.first.status, 'Paid');
      expect(InstallmentPlan.fromJson({}).installments, isEmpty);
    });

    test('installment summary ignores non-map input and reads dates', () {
      expect(InstallmentSummary.fromJson(null), isNull);
      expect(InstallmentSummary.fromJson('x'), isNull);

      final s = InstallmentSummary.fromJson({
        'planId': 4,
        'status': 'Active',
        'numberOfInstallments': 3,
        'paidCount': 1,
        'nextAmount': 3000,
        'nextDueDate': '2026-07-01T00:00:00Z',
      })!;
      expect(s.isActive, isTrue);
      expect(s.nextAmount, 3000.0);
      expect(s.nextDueDate, isNotNull);
      expect(InstallmentSummary.fromJson({'status': 'Completed'})!.isActive, isFalse);
    });

    test('ledger entries fall back to createdAt for their date', () {
      final ledger = PaymentLedger.fromJson({
        'paymentId': 5,
        'originalAmount': 3500,
        'totalRefunded': 500,
        'runningBalance': 3000,
        'entries': [
          {'type': 'Payment', 'amount': 3500, 'date': '2026-06-01'},
          {'type': 'Refund', 'amount': -500, 'createdAt': '2026-06-05'},
        ],
      });

      expect(ledger.runningBalance, 3000.0);
      expect(ledger.entries[1].date, '2026-06-05');
    });
  });

  group('Verification models', () {
    test('task reads reviews and compliance checks', () {
      final task = VerificationTaskModel.fromJson({
        'id': 40,
        'applicationId': 12,
        'status': 'Revised',
        'createdDate': '2026-06-01T08:00:00Z',
        'reviews': [],
        'complianceChecks': [
          {'id': 1, 'checkType': 'Identity Format Check', 'isPassed': true, 'details': 'ok'},
        ],
      });

      expect(task.status, 'Revised');
      expect(task.createdDate.year, 2026);
      expect(task.complianceChecks.single.checkType, 'Identity Format Check');
    });

    test('task defaults when fields are missing', () {
      final task = VerificationTaskModel.fromJson({});

      expect(task.status, 'Pending');
      expect(task.reviews, isEmpty);
    });

    test('compliance check defaults to passed', () {
      final check = ComplianceCheckModel.fromJson({});

      expect(check.isPassed, isTrue);
      expect(check.checkType, 'General Compliance');
      expect(ComplianceCheckModel.fromJson(check.toJson()).checkType, check.checkType);
    });

    test('application copyWith changes only what is given', () {
      final app = ApplicationItemModel(
        applicationId: 12,
        referenceNumber: 'APP-12',
        serviceName: 'Police Clearance',
        category: 'Legal & Security',
        submittedDate: DateTime(2026, 6, 1),
        status: 'Pending',
      );

      final updated = app.copyWith(status: 'Approved', currentStage: 2);

      expect(updated.status, 'Approved');
      expect(updated.currentStage, 2);
      expect(updated.referenceNumber, 'APP-12');
      expect(updated.stageStatus, 'PendingReview');
    });
  });

  test('approval likelihood defaults to zero', () {
    expect(ApprovalLikelihood.fromJson({}).approvalLikelihoodPercent, 0);
    expect(ApprovalLikelihood.fromJson({'approvalLikelihoodPercent': 82.6, 'sampleSize': 40}).approvalLikelihoodPercent, 82);
  });
}
