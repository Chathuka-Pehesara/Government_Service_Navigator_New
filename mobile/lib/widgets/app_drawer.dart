import 'package:flutter/material.dart';
//import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/session_provider.dart';
import '../theme/app_colors.dart';
import '../screens/login_page.dart';

class AppDrawer extends ConsumerWidget {
  /// Forces the signed-in menu; otherwise it follows the current session.
  final bool isAuthenticated;

  const AppDrawer({super.key, this.isAuthenticated = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAuthenticated = this.isAuthenticated || ref.watch(sessionProvider).isSignedIn;

    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          isAuthenticated ? _buildAuthHeader(context) : _buildGuestHeader(context),
          if (!isAuthenticated) ...[
            ListTile(
              leading: const Icon(Icons.home),
              title: const Text('Home'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.dashboard),
              title: const Text('Dashboard'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.info),
              title: const Text('About Us'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.contact_support),
              title: const Text('Support'),
              onTap: () => Navigator.pop(context),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.login),
              title: const Text('Login'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                );
              },
            ),
          ] else ...[
            ListTile(
              leading: const Icon(Icons.dashboard),
              title: const Text('Dashboard'),
              onTap: () => Navigator.pop(context),
            ),
            
            ListTile(
              leading: const Icon(Icons.folder),
              title: const Text('My Applications'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.payment),
              title: const Text('Make Payment'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).pushNamed('/payment');
              },
            ),
            ListTile(
              leading: const Icon(Icons.calendar_month),
              title: const Text('Installment Plans'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).pushNamed('/installment-plan');
              },
            ),
            ListTile(
              leading: const Icon(Icons.money_off),
              title: const Text('Request Refund'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).pushNamed('/refund-request');
              },
            ),
            ListTile(
              leading: const Icon(Icons.book_online),
              title: const Text('Bookings'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).pushNamed('/bookings');
              },
            ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Transaction History'),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).pushNamed('/transaction-history');
              },
            ),
            ListTile(
              leading: const Icon(Icons.person),
              title: const Text('Profile'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.settings),
              title: const Text('Settings'),
              onTap: () => Navigator.pop(context),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: AppColors.danger),
              title: const Text('Log Out',
                  style: TextStyle(color: AppColors.danger)),
              onTap: () {
                ref.read(sessionProvider.notifier).signOut();
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(
                    builder: (_) => const LoginPage(),
                  ),
                  (route) => false,
                );
              },
            ),
          ]
        ],
      ),
    );
  }

  Widget _buildGuestHeader(BuildContext context) {
    return DrawerHeader(
      decoration: const BoxDecoration(
        color: AppColors.primary,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.account_balance,
                color: AppColors.primary, size: 30),
          ),
          const SizedBox(height: 12),
          const Text(
            'GovServiceNav',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAuthHeader(BuildContext context) {
    return DrawerHeader(
      decoration: const BoxDecoration(
        color: AppColors.primary,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CircleAvatar(
            radius: 30,
            backgroundColor: Colors.white,
            child: Icon(Icons.person,
                size: 35, color: AppColors.primary),
          ),
          const SizedBox(height: 10),
          Text(
            'Citizen',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
  }
}
