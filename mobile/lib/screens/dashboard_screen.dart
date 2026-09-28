import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../theme/app_colors.dart';
import '../theme/glass_theme.dart';

import '../widgets/dashboard/home_dashboard_tab.dart';
import '../widgets/dashboard/services_tab.dart';
import '../widgets/dashboard/payments_tab.dart';
import '../widgets/dashboard/applications_tab.dart';
import '../widgets/dashboard/profile_tab.dart';
// Import the Bookings screen (adjust the path if necessary based on your folder structure)
import 'bookings_list_screen.dart'; 

/// Signed-in home. The tabs read the session (token, email) from Riverpod.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;

  static const List<Widget> _tabs = [
    HomeDashboardTab(),
    ServicesTab(),
    PaymentsDashboardTab(),
    ApplicationsTab(),
    BookingsListScreen(), // ---> ADDED BOOKINGS TAB WIDGET
    ProfileTab(),
  ];

  @override
  Widget build(BuildContext context) {
    return AuroraBackdrop(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: IndexedStack(
          index: _currentIndex,
          children: _tabs,
        ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: AppColors.cardBg.withValues(alpha: 0.92),
            border: const Border(
              top: BorderSide(color: AppColors.divider, width: 0.5),
            ),
          ),
          child: SafeArea(
            child: CupertinoTabBar(
              currentIndex: _currentIndex,
              backgroundColor: Colors.transparent,
              activeColor: AppColors.primary,
              inactiveColor: AppColors.secondaryLabel,
              border: null,
              iconSize: 24,
              onTap: (index) => setState(() => _currentIndex = index),
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.home),
                  activeIcon: Icon(CupertinoIcons.house_fill),
                  label: 'Home',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.briefcase),
                  activeIcon: Icon(CupertinoIcons.briefcase_fill),
                  label: 'Services',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.creditcard),
                  activeIcon: Icon(CupertinoIcons.creditcard_fill),
                  label: 'Payments',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.doc_text),
                  activeIcon: Icon(CupertinoIcons.doc_text_fill),
                  label: 'Applications',
                ),
                // ---> ADDED BOOKINGS NAV ITEM <---
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.calendar),
                  activeIcon: Icon(CupertinoIcons.calendar_today),
                  label: 'Bookings',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.person),
                  activeIcon: Icon(CupertinoIcons.person_fill),
                  label: 'Profile',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
