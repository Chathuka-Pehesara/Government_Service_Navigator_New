import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import '../../theme/app_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/application_providers.dart';
import '../../providers/catalog_providers.dart';
import '../../models/verification_models.dart';
import '../../screens/procedure_detail_screen.dart';
import '../../screens/describe_need_screen.dart';
import '../../screens/service_discovery_screen.dart';
import '../../screens/eligibility_self_check_screen.dart';


class HomeDashboardTab extends ConsumerStatefulWidget {
  const HomeDashboardTab({super.key});

  @override
  ConsumerState<HomeDashboardTab> createState() => _HomeDashboardTabState();
}

class _HomeDashboardTabState extends ConsumerState<HomeDashboardTab> {
  final TextEditingController _searchController = TextEditingController();

  List<ApplicationItemModel> get _applications => ref.watch(myApplicationsProvider).value ?? const [];

  int _countWhere(bool Function(String status) test) =>
      _applications.where((a) => test(a.status.toLowerCase())).length;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final services = ref.watch(servicesProvider);
    final popularServices = services.value?.take(4).toList() ?? const [];

    return SafeArea(
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // iOS-Style Header
          SliverAppBar(
            backgroundColor: AppColors.background.withValues(alpha: 0.85),
            floating: true,
            elevation: 0,
            automaticallyImplyLeading: false,
            title: Row(
              children: [
                const CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.primary,
                  child: Icon(
                    CupertinoIcons.person_fill,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'Welcome Back',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.secondaryLabel,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      'Citizen Portal',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(
                  CupertinoIcons.bell,
                  color: AppColors.primary,
                  size: 24,
                ),
                onPressed: () {},
              ),
              const SizedBox(width: 8),
            ],
          ),

          // Dashboard Body Content
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 16.0,
                vertical: 8.0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildAiNavigatorHero(context),
                  const SizedBox(height: 20),

                  _buildSearchBar(),
                  const SizedBox(height: 24),

                  _buildStatusSummaryRow(),
                  const SizedBox(height: 24),

                  const Text(
                    'Browse by Category',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: AppColors.dark,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildCategoriesHorizontalScroll(context),
                  const SizedBox(height: 24),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Active Application',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppColors.dark,
                          letterSpacing: -0.3,
                        ),
                      ),
                      TextButton(
                        onPressed: () {},
                        child: const Text(
                          'View All',
                          style: TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _buildActiveApplicationCard(),
                  const SizedBox(height: 24),

                  const Text(
                    'Popular Services',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: AppColors.dark,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  services.isLoading
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(20.0),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      : popularServices.isEmpty
                          ? const Padding(
                              padding: EdgeInsets.all(12.0),
                              child: Text('No popular services available.'),
                            )
                          : Column(
                              children: popularServices.map((service) {
                                final fees = service['feeSchedules'] as List? ?? [];
                                final feeString = fees.isNotEmpty 
                                    ? 'LKR ${fees[0]['amount']}' 
                                    : 'Free';
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 10.0),
                                  child: InkWell(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (context) => ProcedureDetailScreen(
                                            serviceId: service['id'] ?? 1,
                                          ),
                                        ),
                                      );
                                    },
                                    child: _buildPopularServiceTile(
                                      title: service['name'] ?? '',
                                      department: service['category'] ?? '',
                                      fee: feeString,
                                      icon: CupertinoIcons.briefcase,
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAiNavigatorHero(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.25),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  CupertinoIcons.sparkles,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'AI Procedure Navigator',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Describe what you need in plain language. Let our AI match your service and build your document checklist.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 14,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.primary,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => const DescribeNeedScreen()),
                      );
                    },
                    child: const Text(
                      'Ask Navigator',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white, width: 1.5),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const EligibilitySelfCheckScreen(
                            serviceId: 24,
                            serviceName: 'National Identity Card (NIC) Issuance & Replacement',
                          ),
                        ),
                      );
                    },
                    child: const Text(
                      'Eligibility Check',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return TextField(
      controller: _searchController,
      decoration: InputDecoration(
        hintText: 'Search services, permits, or departments...',
        prefixIcon: const Icon(
          CupertinoIcons.search,
          color: AppColors.secondaryLabel,
          size: 20,
        ),
        suffixIcon: _searchController.text.isNotEmpty
            ? IconButton(
                icon: const Icon(
                  CupertinoIcons.clear_thick_circled,
                  color: AppColors.secondaryLabel,
                  size: 18,
                ),
                onPressed: () {
                  _searchController.clear();
                  setState(() {});
                },
              )
            : null,
        fillColor: AppColors.cardBg,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
      ),
      onChanged: (_) => setState(() {}),
    );
  }

  Widget _buildStatusSummaryRow() {
    return Row(
      children: [
        Expanded(
          child: _buildSummaryCard(
            count: '${_countWhere((s) => s == 'pending')}',
            label: 'In Review',
            color: AppColors.warning,
            icon: CupertinoIcons.time,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildSummaryCard(
            count: '${_countWhere((s) => s == 'revised' || s == 'revision requested' || s == 'rejected')}',
            label: 'Action Needed',
            color: AppColors.danger,
            icon: CupertinoIcons.exclamationmark_circle,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildSummaryCard(
            count: '${_countWhere((s) => s == 'approved')}',
            label: 'Approved',
            color: AppColors.success,
            icon: CupertinoIcons.check_mark_circled,
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard({
    required String count,
    required String label,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                count,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
              Icon(icon, color: color, size: 20),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.secondaryLabel,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoriesHorizontalScroll(BuildContext context) {
    final categories = [
      {'title': 'Commerce', 'icon': CupertinoIcons.briefcase_fill},
      {'title': 'Transport', 'icon': CupertinoIcons.car_detailed},
      {'title': 'Identity', 'icon': CupertinoIcons.person_crop_circle_fill},
      {'title': 'Housing', 'icon': CupertinoIcons.house_fill},
      {'title': 'Taxes', 'icon': CupertinoIcons.doc_chart_fill},
    ];

    return SizedBox(
      height: 96,
      child: ListView.separated(
        physics: const BouncingScrollPhysics(),
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final cat = categories[index];
          final catTitle = cat['title'] as String;
          return GestureDetector(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ServiceDiscoveryScreen(initialCategory: catTitle),
                ),
              );
            },
            child: Container(
              width: 86,
              decoration: BoxDecoration(
                color: AppColors.cardBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.divider, width: 0.8),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      cat['icon'] as IconData,
                      color: AppColors.primary,
                      size: 24,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    catTitle,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.dark,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActiveApplicationCard() {
    final applications = ref.watch(myApplicationsProvider);
    if (applications.isLoading && !applications.hasValue) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(20.0),
          child: CircularProgressIndicator(),
        ),
      );
    }
    final active = _applications.where((a) => a.status.toLowerCase() == 'pending').toList();
    if (active.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(12.0),
        child: Text('No active applications.'),
      );
    }
    final app = active.first;
    final checks = app.verificationTask?.complianceChecks ?? [];
    final passed = checks.where((c) => c.isPassed).length;
    final progress = checks.isEmpty ? 0.0 : passed / checks.length;
    final d = app.submittedDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final submitted = 'Submitted on ${months[d.month - 1]} ${d.day}, ${d.year}';
    final subtitle = checks.isEmpty ? submitted : '$submitted • $passed of ${checks.length} checks verified';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                app.referenceNumber,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.secondaryLabel,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'In Officer Review',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.warning,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            app.serviceName,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: AppColors.dark,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: AppColors.background,
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPopularServiceTile({
    required String title,
    required String department,
    required String fee,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider, width: 0.8),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  department,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.secondaryLabel,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                fee,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 4),
              const Icon(
                CupertinoIcons.chevron_right,
                size: 16,
                color: AppColors.secondaryLabel,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
