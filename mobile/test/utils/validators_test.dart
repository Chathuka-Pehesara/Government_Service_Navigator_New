import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/validators.dart';

void main() {
  group('SriLankaNic', () {
    for (final nic in ['881234567V', '881234567x', '200012345678', ' 885234567v ', '200006012345']) {
      test('accepts $nic', () => expect(SriLankaNic.validate(nic), isNull));
    }

    final invalid = {
      '12345': '9 digits',
      '88123456V': '9 digits',
      '881234567A': '9 digits',
      '200036712345': 'day number',
      '200000012345': 'day number',
      '189912345678': 'birth year',
      '199906012345': '29 February',
    };
    invalid.forEach((nic, fragment) {
      test('rejects $nic ($fragment)', () => expect(SriLankaNic.validate(nic), contains(fragment)));
    });

    test('rejects a birth year in the future', () {
      final nextYear = DateTime.now().year + 1;
      expect(SriLankaNic.validate('${nextYear}00112345'), contains('birth year'));
    });

    test('parses birth date, gender and format', () {
      final male = SriLankaNic.parse('200016612345')!;
      expect(male.birthDate, DateTime(2000, 6, 14));
      expect(male.isFemale, isFalse);
      expect(male.isOldFormat, isFalse);

      final female = SriLankaNic.parse('885234567V')!;
      expect(female.birthDate.year, 1988);
      expect(female.isFemale, isTrue);
      expect(female.isOldFormat, isTrue);
    });

    test('day 060 is 29 February, day 061 is 1 March', () {
      expect(SriLankaNic.parse('200006012345')!.birthDate, DateTime(2000, 2, 29));
      expect(SriLankaNic.parse('199906112345')!.birthDate, DateTime(1999, 3, 1));
    });

    test('parse returns null for an invalid NIC', () => expect(SriLankaNic.parse('bad'), isNull));

    test('age counts whole years', () {
      final info = SriLankaNic.parse('200016612345')!; // 14 June 2000
      expect(info.ageOn(DateTime(2026, 6, 14)), 26);
      expect(info.ageOn(DateTime(2026, 6, 13)), 25);
    });
  });

  group('Validators', () {
    test('required', () {
      expect(Validators.required('  ', 'Name'), 'Name is required');
      expect(Validators.required('x'), isNull);
    });

    test('nic is required by default and optional on request', () {
      expect(Validators.nic(''), 'NIC number is required');
      expect(Validators.nic('', required: false), isNull);
      expect(Validators.nic('881234567V'), isNull);
    });

    test('email', () {
      expect(Validators.email('name@example.com'), isNull);
      expect(Validators.email('a@b'), isNotNull);
      expect(Validators.email('name@domain.c'), isNotNull);
      expect(Validators.email('', required: false), isNull);
    });

    test('phone', () {
      for (final ok in ['0771234567', '+94771234567', '0094771234567', '077-123 4567', '(077) 1234567']) {
        expect(Validators.phone(ok), isNull, reason: ok);
      }
      for (final bad in ['0071234567', '077123456', '1919']) {
        expect(Validators.phone(bad), isNotNull, reason: bad);
      }
      expect(Validators.normalizePhone(' (077) 123-4567 '), '0771234567');
    });

    test('person names allow Sinhala and Tamil', () {
      for (final ok in ['Nimal Silva', "O'Brien-Perera", 'K. M. Fernando', 'නිමල් සිල්වා', 'நிமல்']) {
        expect(Validators.personName(ok), isNull, reason: ok);
      }
      for (final bad in ['N', '1Nimal', 'Nimal <b>']) {
        expect(Validators.personName(bad), isNotNull, reason: bad);
      }
    });

    test('strong password', () {
      expect(Validators.strongPassword('Passw0rd'), isNull);
      expect(Validators.strongPassword(''), contains('required'));
      expect(Validators.strongPassword('Pa0rd'), contains('at least 8'));
      expect(Validators.strongPassword('password1'), contains('uppercase'));
      expect(Validators.strongPassword('PASSWORD1'), contains('lowercase'));
      expect(Validators.strongPassword('Password'), contains('number'));
      expect(Validators.strongPassword('Pass word1'), contains('spaces'));
      expect(Validators.strongPassword('Aa1${'x' * 62}'), contains('at most 64'));
    });

    test('login password only checks presence and length', () {
      expect(Validators.loginPassword('weak'), isNull);
      expect(Validators.loginPassword(''), 'Password is required');
      expect(Validators.loginPassword('x' * 129), contains('128'));
    });

    test('confirm password compares with the current original', () {
      var original = 'Passw0rd';
      final rule = Validators.confirmPassword(() => original);
      expect(rule('Passw0rd'), isNull);
      expect(rule('other'), 'Passwords do not match');
      expect(rule(''), 'Confirm your password');
      original = 'Changed1';
      expect(rule('Passw0rd'), 'Passwords do not match');
    });

    test('text', () {
      expect(Validators.text('  abc ', field: 'Reason', min: 5), contains('at least 5'));
      expect(Validators.text('x' * 21, field: 'Reason', max: 20), contains('at most 20'));
      expect(Validators.text('<b>hi</b>', field: 'Reason'), contains('HTML'));
      expect(Validators.text('5 < 6 and 7 > 3', field: 'Reason'), isNull);
      expect(Validators.text('', field: 'Notes', required: false), isNull);
    });

    test('amount', () {
      for (final ok in ['1', '0.01', '1,250.50', '10000000']) {
        expect(Validators.amount(ok), isNull, reason: ok);
      }
      expect(Validators.amount('0'), contains('greater than 0'));
      expect(Validators.amount('1.005'), contains('2 decimal'));
      expect(Validators.amount('-5'), contains('2 decimal'));
      expect(Validators.amount('10000000.01'), contains('must not exceed'));
    });

    test('number', () {
      expect(Validators.number('42', field: 'Age', min: 16, max: 125), isNull);
      expect(Validators.number('abc', field: 'Age'), 'Age must be a number');
      expect(Validators.number('12', field: 'Age', min: 16), 'Age must be at least 16');
      expect(Validators.number('130', field: 'Age', max: 125), 'Age must be at most 125');
    });

    test('date', () {
      expect(Validators.date('2026-06-15', field: 'Date'), isNull);
      expect(Validators.date('15/06/2026', field: 'Date'), contains('valid date'));
      expect(Validators.date('1850-01-01', field: 'Date'), contains('between 1900 and 2100'));
      expect(Validators.date('2099-01-01', field: 'Birth date', notFuture: true), contains('future'));
    });

    test('application id', () {
      for (final ok in ['1024', 'APP-1024', 'app-2026-8841']) {
        expect(Validators.applicationId(ok), isNull, reason: ok);
      }
      for (final bad in ['APP-', 'REF-1', '12a']) {
        expect(Validators.applicationId(bad), isNotNull, reason: bad);
      }
    });

    test('postal code', () {
      expect(Validators.postalCode('10100'), isNull);
      expect(Validators.postalCode('1010'), isNotNull);
    });

    test('byLabel picks the rule from the label', () {
      expect(Validators.byLabel('NIC Number', '12345'), isNotNull);
      expect(Validators.byLabel('Email', 'bad'), isNotNull);
      expect(Validators.byLabel('Mobile Phone', '0771234567'), isNull);
      expect(Validators.byLabel('Remarks', 'anything'), isNull);
      expect(Validators.byLabel('NIC Number', ''), isNull);
    });

    test('all returns the first failing rule', () {
      final rule = Validators.all([(v) => Validators.required(v, 'Phone'), (v) => Validators.phone(v)]);
      expect(rule(''), 'Phone is required');
      expect(rule('123'), contains('valid Sri Lankan phone'));
      expect(rule('0771234567'), isNull);
    });
  });
}
