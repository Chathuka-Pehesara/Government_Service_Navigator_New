import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'landing_page.dart';
import '../../theme/glass_theme.dart';
import '../../theme/app_colors.dart';
import '../login_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';

/// Splash screen: calm light backdrop, a frosted emblem card with a soft light sweep,
/// a slowly rotating navy ring, and a navy progress bar. Then routes to onboarding or login.
class LoadingPage extends ConsumerStatefulWidget {
  const LoadingPage({super.key});

  @override
  ConsumerState<LoadingPage> createState() => _LoadingPageState();
}

class _LoadingPageState extends ConsumerState<LoadingPage> with TickerProviderStateMixin {
  static const _splashDuration = Duration(milliseconds: 2800);
  static const _accent = GlassTheme.accentGradient;
  static const _statusMessages = [
    'Securing your connection…',
    'Loading government services…',
    'Almost ready…',
  ];

  late final AnimationController _intro;
  late final AnimationController _shimmer;
  late final AnimationController _spin;
  late final AnimationController _progress;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..forward();
    _shimmer = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();
    _spin = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
    _progress = AnimationController(vsync: this, duration: _splashDuration)..forward();
    _navigateNext();
  }

  /// First launch: slides → terms → sign up. After the user has signed up or logged in once: login page.
  Future<void> _navigateNext() async {
    final results = await Future.wait([
      ref.read(onboardingCompletedProvider.future),
      Future.delayed(_splashDuration),
    ]);
    if (!mounted) return;
    final onboardingCompleted = results[0] as bool;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 700),
        pageBuilder: (_, _, _) => onboardingCompleted ? const LoginPage() : const LandingPage(),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  void dispose() {
    _intro.dispose();
    _shimmer.dispose();
    _spin.dispose();
    _progress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cardIn = CurvedAnimation(parent: _intro, curve: const Interval(0.0, 0.65, curve: Curves.easeOutBack));
    final textIn = CurvedAnimation(parent: _intro, curve: const Interval(0.35, 1.0, curve: Curves.easeOutCubic));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: AuroraBackdrop(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    FadeTransition(
                      opacity: cardIn,
                      child: ScaleTransition(scale: Tween(begin: 0.7, end: 1.0).animate(cardIn), child: _buildEmblem()),
                    ),
                    const SizedBox(height: 36),
                    FadeTransition(
                      opacity: textIn,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0, 0.5), end: Offset.zero).animate(textIn),
                        child: Column(
                          children: [
                            NeonGradient(
                              colors: _accent,
                              child: const Text(
                                'GovServiceNav',
                                style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -0.8),
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'GOVERNMENT SERVICES, SIMPLIFIED',
                              style: TextStyle(fontSize: 12, letterSpacing: 3, color: GlassTheme.textMuted, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 48),
                    FadeTransition(opacity: textIn, child: _buildProgress()),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Rotating navy ring around a frosted card holding the emblem, with a soft light sweeping across.
  Widget _buildEmblem() {
    return SizedBox(
      width: 190,
      height: 190,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Rotating gradient ring
          RotationTransition(
            turns: _spin,
            child: Container(
              width: 190,
              height: 190,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: SweepGradient(
                  colors: [Color(0x001F3A68), GlassTheme.navySoft, GlassTheme.navy, Color(0x001F3A68)],
                  stops: [0.0, 0.45, 0.75, 1.0],
                ),
              ),
            ),
          ),
          // Cut the ring's middle out with the background colour so only a thin arc glows
          Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.background,
            ),
          ),
          GlassCard(
            radius: 36,
            padding: EdgeInsets.zero,
            child: SizedBox(
              width: 124,
              height: 124,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  NeonGradient(
                    colors: _accent,
                    child: const Icon(Icons.account_balance, size: 64, color: Colors.white),
                  ),
                  // Light beam sweeping diagonally across the card
                  AnimatedBuilder(
                    animation: _shimmer,
                    builder: (_, _) {
                      final x = -1.5 + 3 * Curves.easeInOut.transform(_shimmer.value);
                      return Positioned.fill(
                        child: IgnorePointer(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment(x - 0.4, -1),
                                end: Alignment(x + 0.4, 1),
                                colors: [
                                  GlassTheme.navy.withValues(alpha: 0),
                                  GlassTheme.navy.withValues(alpha: 0.08),
                                  GlassTheme.navy.withValues(alpha: 0),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          // Sparkles
          ..._sparkles(),
        ],
      ),
    );
  }

  List<Widget> _sparkles() {
    const positions = [Offset(-78, -60), Offset(80, -38), Offset(66, 72), Offset(-70, 66)];
    return [
      for (var i = 0; i < positions.length; i++)
        AnimatedBuilder(
          animation: _shimmer,
          builder: (_, _) {
            final pulse = 0.5 + 0.5 * math.sin((_shimmer.value + i / positions.length) * 2 * math.pi);
            return Transform.translate(
              offset: positions[i],
              child: Opacity(
                opacity: pulse,
                child: Transform.scale(
                  scale: 0.6 + 0.6 * pulse,
                  child: Icon(CupertinoIcons.sparkles, size: 14, color: GlassTheme.navySoft.withValues(alpha: 0.6)),
                ),
              ),
            );
          },
        ),
    ];
  }

  Widget _buildProgress() {
    return AnimatedBuilder(
      animation: _progress,
      builder: (_, _) {
        final value = Curves.easeInOut.transform(_progress.value);
        final message = _statusMessages[(value * _statusMessages.length).floor().clamp(0, _statusMessages.length - 1)];
        return Column(
          children: [
            Container(
              width: 200,
              height: 6,
              decoration: BoxDecoration(
                color: AppColors.divider,
                borderRadius: BorderRadius.circular(3),
              ),
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: value,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: _accent),
                    borderRadius: BorderRadius.circular(3),
                    boxShadow: [BoxShadow(color: GlassTheme.navy.withValues(alpha: 0.25), blurRadius: 8)],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: Text(
                message,
                key: ValueKey(message),
                style: const TextStyle(fontSize: 13, color: GlassTheme.textMuted),
              ),
            ),
          ],
        );
      },
    );
  }
}
