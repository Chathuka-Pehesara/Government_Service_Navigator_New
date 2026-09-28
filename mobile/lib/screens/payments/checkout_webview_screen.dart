import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:webview_flutter/webview_flutter.dart';
// dart:html is web-only, so pick the implementation per platform
import 'web_window_opener_stub.dart'
    if (dart.library.html) 'web_window_opener_web.dart';
import '../../theme/app_colors.dart';

class CheckoutWebViewScreen extends StatefulWidget {
  final String checkoutUrl;

  const CheckoutWebViewScreen({
    super.key,
    required this.checkoutUrl,
  });

  @override
  State<CheckoutWebViewScreen> createState() => _CheckoutWebViewScreenState();
}

class _CheckoutWebViewScreenState extends State<CheckoutWebViewScreen> {
  WebViewController? _controller;
  bool _isLoading = true;
  // The redirect is seen by several navigation callbacks; only close the screen once
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (String url) {
              if (mounted) setState(() => _isLoading = true);
              _checkRedirect(url);
            },
            onPageFinished: (String url) {
              if (mounted) setState(() => _isLoading = false);
              _checkRedirect(url);
            },
            onNavigationRequest: (NavigationRequest request) {
              if (_checkRedirect(request.url)) {
                return NavigationDecision.prevent;
              }
              return NavigationDecision.navigate;
            },
          ),
        )
        ..loadRequest(Uri.parse(widget.checkoutUrl));
    } else {
      _isLoading = false;
      // On web, attempt to open the Stripe checkout tab automatically
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _openWebCheckout();
      });
    }
  }

  void _openWebCheckout() {
    try {
      openInNewTab(widget.checkoutUrl);
    } catch (_) {}
  }

  bool _checkRedirect(String url) {
    if (_closed) return true;
    final lowerUrl = url.toLowerCase();
    if (lowerUrl.contains('/success') ||
        lowerUrl.contains('success=true') ||
        lowerUrl.contains('status=success') ||
        lowerUrl.contains('checkout/success')) {
      _closed = true;
      if (mounted) Navigator.of(context).pop(true);
      return true;
    } else if (lowerUrl.contains('/cancel') ||
        lowerUrl.contains('cancel=true') ||
        lowerUrl.contains('status=cancel') ||
        lowerUrl.contains('checkout/cancel')) {
      _closed = true;
      if (mounted) Navigator.of(context).pop(false);
      return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Checkout Payment'),
        backgroundColor: AppColors.cardBg,
        elevation: 0,
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.of(context).pop(false),
          child: const Icon(CupertinoIcons.xmark, color: AppColors.primary),
        ),
      ),
      body: kIsWeb ? _buildWebCheckoutUI() : _buildMobileWebView(),
    );
  }

  Widget _buildMobileWebView() {
    return Stack(
      children: [
        if (_controller != null) WebViewWidget(controller: _controller!),
        if (_isLoading)
          const Center(
            child: CupertinoActivityIndicator(radius: 14),
          ),
      ],
    );
  }

  Widget _buildWebCheckoutUI() {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 480),
        margin: const EdgeInsets.all(24),
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.divider, width: 0.8),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(CupertinoIcons.creditcard_fill, color: AppColors.primary, size: 36),
            ),
            const SizedBox(height: 16),
            const Text(
              'Online Stripe Checkout',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.dark),
            ),
            const SizedBox(height: 8),
            const Text(
              'A secure Stripe Checkout window has been opened in a new tab. If it did not open, click the button below to complete your payment.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel, height: 1.4),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(12),
                padding: const EdgeInsets.symmetric(vertical: 14),
                onPressed: _openWebCheckout,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.arrow_up_right_square, color: Colors.white, size: 18),
                    SizedBox(width: 8),
                    Text('Open Checkout Tab', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                color: AppColors.success,
                borderRadius: BorderRadius.circular(12),
                padding: const EdgeInsets.symmetric(vertical: 14),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.checkmark_circle_fill, color: Colors.white, size: 18),
                    SizedBox(width: 8),
                    Text('I Have Completed Payment', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel Payment', style: TextStyle(color: AppColors.danger, fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}
