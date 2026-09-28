import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart'; // Required for CupertinoIcons
import '../theme/app_colors.dart';
import 'app_drawer.dart';

class MainLayout extends StatelessWidget {
  final Widget child;
  final bool isAuthenticated;
  final Color? backgroundColor;
  final int currentIndex; // Tracks the active tab
  final ValueChanged<int>? onTabSelected; // Handles tab tap events

  const MainLayout({
    super.key,
    required this.child,
    this.isAuthenticated = false,
    this.backgroundColor,
    this.currentIndex = 0, // Defaults to Home (0)
    this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 800;

    return Scaffold(
      backgroundColor: backgroundColor ?? AppColors.background,
      drawer: isMobile ? AppDrawer(isAuthenticated: isAuthenticated) : null,
      body: SafeArea(
        child: child,
      ),
      bottomNavigationBar: isMobile
          ? BottomNavigationBar(
              currentIndex: currentIndex,
              onTap: onTabSelected,
              type: BottomNavigationBarType.fixed, // Forces all 6 items to display evenly
              selectedItemColor: AppColors.primary,
              unselectedItemColor: Colors.grey,
              selectedFontSize: 11,
              unselectedFontSize: 11,
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.home),
                  label: 'Home',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.briefcase),
                  label: 'Services',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.creditcard),
                  label: 'Payments',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.doc_text),
                  label: 'Applications',
                ),
                // ---> NEW BOOKINGS TAB <---
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.calendar),
                  label: 'Bookings',
                ),
                BottomNavigationBarItem(
                  icon: Icon(CupertinoIcons.person),
                  label: 'Profile',
                ),
              ],
            )
          : null,
    );
  }
}
