import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/index/loading_page.dart';
import 'package:mobile/screens/payments/payment_screen.dart';
import 'package:mobile/screens/payments/installment_plan_view.dart';
import 'package:mobile/screens/refunds/refund_request_screen.dart';
import 'package:mobile/screens/payments/transaction_history_screen.dart';
import 'package:mobile/screens/bookings_list_screen.dart';
import 'package:mobile/screens/booking_options_screen.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Dark status bar icons over the light theme
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarBrightness: Brightness.light,
    statusBarIconBrightness: Brightness.dark,
    statusBarColor: Colors.transparent,
  ));
  runApp(
    ProviderScope(
      // Surface failures right away (screens show their own retry UI) instead of
      // Riverpod's default automatic retry with backoff.
      retry: (retryCount, error) => null,
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Government Service Navigator',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      // iOS-style page transitions throughout
      builder: (context, child) {
        return ScrollConfiguration(
          behavior: _IOSScrollBehavior(),
          child: child!,
        );
      },
      home: const LoadingPage(),
      onGenerateRoute: (settings) {
        Widget page;
        switch (settings.name) {
          case '/payment':
            page = const PaymentScreen();
            break;
          case '/installment-plan':
            page = const InstallmentPlanView();
            break;
          case '/refund-request':
            page = const RefundRequestScreen();
            break;
          case '/transaction-history':
            page = const TransactionHistoryScreen();
            break;
          // ---> NEW ROUTE FOR BOOKINGS <---
          case '/bookings':
            page = const BookingsListScreen();
            break;
          default:
            return null;
        }
        return CupertinoPageRoute(
          builder: (_) => page,
          settings: settings,
        );
      },
    );
  }
}

/// Gives the entire app native iOS momentum-style scrolling physics
class _IOSScrollBehavior extends ScrollBehavior {
  @override
  ScrollPhysics getScrollPhysics(BuildContext context) =>
      const BouncingScrollPhysics();
}
