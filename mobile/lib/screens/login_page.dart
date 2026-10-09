import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/screens/dashboard_screen.dart';
import '../theme/app_colors.dart';
import '../theme/glass_theme.dart';
import '../providers/auth_provider.dart';
import '../utils/validators.dart';
import 'signup_page.dart';

class LoginPage extends ConsumerStatefulWidget {
  final String? initialEmail;
  const LoginPage({super.key, this.initialEmail});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    final signedIn = await ref.read(authControllerProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

    if (!signedIn || !mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      CupertinoPageRoute(builder: (_) => const DashboardScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final isLoading = auth.isLoading;
    final errorMessage = auth.hasError ? auth.error.toString() : null;

    return AuroraBackdrop(
      child: Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Back chevron — hidden when login is the first screen (returning user, or after logout)
                if (Navigator.of(context).canPop())
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: () => Navigator.of(context).pop(),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(CupertinoIcons.chevron_left,
                            color: AppColors.primary, size: 20),
                        SizedBox(width: 4),
                        Text('Back',
                            style: TextStyle(
                                color: AppColors.primary,
                                fontSize: 17,
                                fontWeight: FontWeight.w400)),
                      ],
                    ),
                  )
                else
                  const SizedBox(height: 44),
                const SizedBox(height: 32),
                // App icon
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.25),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.account_balance,
                      color: Colors.white, size: 30),
                ),
                const SizedBox(height: 28),
                const Text(
                  'Welcome back',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Sign in to continue tracking your applications.',
                  style: TextStyle(
                    fontSize: 15,
                    color: AppColors.secondaryLabel,
                  ),
                ),
                const SizedBox(height: 36),
                // Grouped fields — iOS grouped table style
                _buildGroupedFields(),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: () {},
                    child: const Text(
                      'Forgot password?',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (errorMessage != null) ...[
                  _buildErrorBanner(errorMessage),
                  const SizedBox(height: 16),
                ],
                // iOS-style full-width blue button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: CupertinoButton.filled(
                    borderRadius: BorderRadius.circular(14),
                    onPressed: isLoading ? null : _handleLogin,
                    child: isLoading
                        ? const CupertinoActivityIndicator(
                            color: Colors.white, radius: 11)
                        : const Text(
                            'Sign In',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 28),
                Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        "Don't have an account?  ",
                        style: TextStyle(
                          color: AppColors.secondaryLabel,
                          fontSize: 15,
                        ),
                      ),
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        onPressed: () async {
                          await Navigator.of(context).push(
                            CupertinoPageRoute(
                                builder: (_) => const SignUpPage()),
                          );
                          // Don't carry a sign-up error back onto the login form
                          ref.invalidate(authControllerProvider);
                        },
                        child: const Text(
                          'Sign Up',
                          style: TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    );
  }

  // iOS grouped-list style for fields
  Widget _buildGroupedFields() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // Email row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              style: const TextStyle(fontSize: 16, color: AppColors.dark),
              decoration: InputDecoration(
                hintText: 'Email',
                hintStyle: TextStyle(color: AppColors.secondaryLabel),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                prefixIcon: const Icon(CupertinoIcons.mail,
                    color: AppColors.primary, size: 20),
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
              ),
              validator: Validators.email,
            ),
          ),
          Divider(height: 1, color: AppColors.divider, indent: 52),
          // Password row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: TextFormField(
              controller: _passwordController,
              obscureText: _obscurePassword,
              style: const TextStyle(fontSize: 16, color: AppColors.dark),
              decoration: InputDecoration(
                hintText: 'Password',
                hintStyle: TextStyle(color: AppColors.secondaryLabel),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                prefixIcon: const Icon(CupertinoIcons.lock,
                    color: AppColors.primary, size: 20),
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
                suffixIcon: CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: () =>
                      setState(() => _obscurePassword = !_obscurePassword),
                  child: Icon(
                    _obscurePassword
                        ? CupertinoIcons.eye
                        : CupertinoIcons.eye_slash,
                    color: AppColors.secondaryLabel,
                    size: 20,
                  ),
                ),
              ),
              validator: Validators.loginPassword,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.exclamationmark_circle,
              color: AppColors.danger, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message,
                style: const TextStyle(
                    color: AppColors.danger, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
