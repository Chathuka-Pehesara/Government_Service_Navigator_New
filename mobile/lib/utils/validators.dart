/// Form field rules shared by every mobile screen. They mirror the backend
/// (backend/src/Validation) and web/src/utils/validation.ts - keep the three in step.
///
/// Each validator returns an error message, or null when the value is valid, so they plug
/// straight into `TextFormField.validator`. Optional fields pass when empty; wrap them with
/// [Validators.required] (or pass `required: true`) to make them mandatory.
library;

/// Birth details read from a valid Sri Lankan NIC.
class NicInfo {
  final DateTime birthDate;
  final bool isFemale;
  final bool isOldFormat;

  const NicInfo({required this.birthDate, required this.isFemale, required this.isOldFormat});

  int ageOn(DateTime today) {
    var age = today.year - birthDate.year;
    if (today.month < birthDate.month || (today.month == birthDate.month && today.day < birthDate.day)) {
      age--;
    }
    return age;
  }
}

/// Sri Lankan National Identity Card numbers.
/// Old format: 9 digits + V/X (e.g. 881234567V), year 19YY.
/// New format: 12 digits (e.g. 198812345678).
/// The day-of-year digits are 001-366 for men and 501-866 for women; day 060 (29 Feb)
/// only exists in leap years.
class SriLankaNic {
  SriLankaNic._();

  static String normalize(String? nic) => (nic ?? '').trim().toUpperCase();

  static final RegExp _old = RegExp(r'^[0-9]{9}[VX]$');
  static final RegExp _new = RegExp(r'^[0-9]{12}$');

  static bool _isLeap(int y) => (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;

  /// The reason the NIC is invalid, or null when it is valid.
  static String? validate(String? nic) {
    final value = normalize(nic);
    int year, day;
    if (_old.hasMatch(value)) {
      year = 1900 + int.parse(value.substring(0, 2));
      day = int.parse(value.substring(2, 5));
    } else if (_new.hasMatch(value)) {
      year = int.parse(value.substring(0, 4));
      day = int.parse(value.substring(4, 7));
    } else {
      return 'NIC must be 9 digits followed by V or X (e.g. 881234567V) or 12 digits (e.g. 198812345678).';
    }

    if (day > 500) day -= 500;
    final today = DateTime.now();
    if (year < 1900 || year > today.year) return 'NIC contains an invalid birth year.';
    if (day < 1 || day > 366) return 'NIC contains an invalid birth day number.';
    if (day == 60 && !_isLeap(year)) return 'NIC contains 29 February for a year that is not a leap year.';

    final birth = _birthDate(year, day);
    if (birth.isAfter(DateTime(today.year, today.month, today.day))) {
      return 'NIC contains a birth date in the future.';
    }
    return null;
  }

  /// Birth details, or null if the NIC is invalid.
  static NicInfo? parse(String? nic) {
    if (validate(nic) != null) return null;
    final value = normalize(nic);
    final isOld = value.length == 10;
    final year = isOld ? 1900 + int.parse(value.substring(0, 2)) : int.parse(value.substring(0, 4));
    var day = int.parse(isOld ? value.substring(2, 5) : value.substring(4, 7));
    final isFemale = day > 500;
    if (isFemale) day -= 500;
    return NicInfo(birthDate: _birthDate(year, day), isFemale: isFemale, isOldFormat: isOld);
  }

  // Day numbers always count 29 Feb, so walk a leap year then move to the real year
  static DateTime _birthDate(int year, int day) {
    final inLeapYear = DateTime(2000, 1, 1).add(Duration(days: day - 1));
    return DateTime(year, inLeapYear.month, inLeapYear.day);
  }
}

class Validators {
  Validators._();

  static final RegExp _email = RegExp(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$');
  static final RegExp _phone = RegExp(r'^(?:\+94|0094|0)[1-9][0-9]{8}$');
  static final RegExp _name = RegExp(r"^\p{L}[\p{L}\p{M} .'\-]{1,99}$", unicode: true);
  static final RegExp _html = RegExp(r'<\s*/?\s*[a-zA-Z][^>]*>');

  static bool _empty(String? v) => v == null || v.trim().isEmpty;

  /// Removes spaces, dashes and brackets from a phone number.
  static String normalizePhone(String v) => v.trim().replaceAll(RegExp(r'[\s\-()]'), '');

  static String? required(String? v, [String field = 'This field']) =>
      _empty(v) ? '$field is required' : null;

  /// Runs each rule in order and returns the first error.
  static String? Function(String?) all(List<String? Function(String?)> rules) => (v) {
        for (final rule in rules) {
          final error = rule(v);
          if (error != null) return error;
        }
        return null;
      };

  static String? nic(String? v, {bool required = true}) {
    if (_empty(v)) return required ? 'NIC number is required' : null;
    return SriLankaNic.validate(v);
  }

  static String? email(String? v, {bool required = true}) {
    if (_empty(v)) return required ? 'Email is required' : null;
    final value = v!.trim();
    if (value.length > 254 || !_email.hasMatch(value)) return 'Enter a valid email address, e.g. name@example.com';
    return null;
  }

  static String? phone(String? v, {bool required = true}) {
    if (_empty(v)) return required ? 'Phone number is required' : null;
    if (!_phone.hasMatch(normalizePhone(v!))) {
      return 'Enter a valid Sri Lankan phone number, e.g. 0771234567 or +94771234567';
    }
    return null;
  }

  static String? personName(String? v, {bool required = true, String field = 'Name'}) {
    if (_empty(v)) return required ? '$field is required' : null;
    if (!_name.hasMatch(v!.trim())) {
      return '$field must be 2-100 characters and contain only letters, spaces, dots, apostrophes or hyphens';
    }
    return null;
  }

  /// New passwords: 8-64 characters with an uppercase letter, a lowercase letter and a number.
  static String? strongPassword(String? v) {
    if (v == null || v.isEmpty) return 'Password is required';
    if (v.length < 8) return 'Password must be at least 8 characters';
    if (v.length > 64) return 'Password must be at most 64 characters';
    if (!v.contains(RegExp(r'[A-Z]'))) return 'Password must contain an uppercase letter';
    if (!v.contains(RegExp(r'[a-z]'))) return 'Password must contain a lowercase letter';
    if (!v.contains(RegExp(r'[0-9]'))) return 'Password must contain a number';
    if (v.contains(RegExp(r'\s'))) return 'Password must not contain spaces';
    return null;
  }

  /// Login only checks presence: older accounts may predate the strength rule.
  static String? loginPassword(String? v) {
    if (v == null || v.isEmpty) return 'Password is required';
    if (v.length > 128) return 'Password must be at most 128 characters';
    return null;
  }

  static String? Function(String?) confirmPassword(String Function() original) =>
      (v) => (v == null || v.isEmpty)
          ? 'Confirm your password'
          : (v != original() ? 'Passwords do not match' : null);

  /// Free text with a length range and no HTML.
  static String? text(String? v, {required String field, int min = 0, int max = 1000, bool required = true}) {
    if (_empty(v)) return required ? '$field is required' : null;
    final value = v!.trim();
    if (value.length < min) return '$field must be at least $min characters';
    if (value.length > max) return '$field must be at most $max characters';
    if (_html.hasMatch(value)) return '$field must not contain HTML';
    return null;
  }

  /// LKR amount: more than 0, at most 10,000,000, at most 2 decimal places.
  static String? amount(String? v, {bool required = true, double max = 10000000}) {
    if (_empty(v)) return required ? 'Amount is required' : null;
    final value = v!.trim().replaceAll(',', '');
    if (!RegExp(r'^[0-9]+(\.[0-9]{1,2})?$').hasMatch(value)) {
      return 'Enter a valid amount with at most 2 decimal places';
    }
    final n = double.parse(value);
    if (n <= 0) return 'Amount must be greater than 0';
    if (n > max) return 'Amount must not exceed LKR ${max.toStringAsFixed(0)}';
    return null;
  }

  static String? number(String? v, {required String field, bool required = true, num? min, num? max}) {
    if (_empty(v)) return required ? '$field is required' : null;
    final n = num.tryParse(v!.trim());
    if (n == null) return '$field must be a number';
    if (min != null && n < min) return '$field must be at least $min';
    if (max != null && n > max) return '$field must be at most $max';
    return null;
  }

  /// yyyy-MM-dd (or any date DateTime.parse accepts) between 1900 and 2100.
  static String? date(String? v, {required String field, bool required = true, bool notFuture = false}) {
    if (_empty(v)) return required ? '$field is required' : null;
    final d = DateTime.tryParse(v!.trim());
    if (d == null) return '$field must be a valid date (YYYY-MM-DD)';
    if (d.year < 1900 || d.year > 2100) return '$field must be between 1900 and 2100';
    if (notFuture && d.isAfter(DateTime.now())) return '$field cannot be in the future';
    return null;
  }

  /// An application reference such as 1024, APP-1024 or APP-2026-8841.
  static String? applicationId(String? v, {bool required = true}) {
    if (_empty(v)) return required ? 'Application ID is required' : null;
    return RegExp(r'^(?:APP-)?[0-9]{1,10}(?:-[0-9]{1,10})?$', caseSensitive: false).hasMatch(v!.trim())
        ? null
        : 'Enter a valid application ID, e.g. APP-1024';
  }

  /// Sri Lankan postal code: 5 digits.
  static String? postalCode(String? v, {bool required = true}) {
    if (_empty(v)) return required ? 'Postal code is required' : null;
    return RegExp(r'^[0-9]{5}$').hasMatch(v!.trim()) ? null : 'Postal code must be 5 digits, e.g. 10100';
  }

  /// Picks a rule from a form field's label, mirroring the backend's ApplicationAnswersValidator.
  static String? byLabel(String label, String? v) {
    if (_empty(v)) return null;
    final l = label.toLowerCase();
    if (l.contains('nic') || l.contains('identity card') || l.contains('national id')) return nic(v);
    if (l.contains('email') || l.contains('e-mail')) return email(v);
    if (l.contains('phone') || l.contains('mobile') || l.contains('telephone') || l.contains('contact no')) {
      return phone(v);
    }
    return null;
  }
}
