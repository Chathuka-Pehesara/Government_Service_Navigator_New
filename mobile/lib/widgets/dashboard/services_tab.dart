import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../theme/app_colors.dart';
import '../../providers/catalog_providers.dart';
import '../../screens/procedure_detail_screen.dart';

class ServicesTab extends ConsumerStatefulWidget {
  const ServicesTab({super.key});

  @override
  ConsumerState<ServicesTab> createState() => _ServicesTabState();
}

class _ServicesTabState extends ConsumerState<ServicesTab> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _selectedCategory = 'All';
  String _feeFilter = 'All'; // 'All', 'Free', 'Paid'
  String _sortBy = 'Default'; // 'Default', 'Name (A-Z)', 'Fee (Low to High)', 'Stages (Most First)'

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool get _isFilterActive =>
      _selectedCategory != 'All' || _feeFilter != 'All' || _sortBy != 'Default';

  void _resetAllFilters() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedCategory = 'All';
      _feeFilter = 'All';
      _sortBy = 'Default';
    });
  }

  IconData _getServiceIcon(String name, String category) {
    final lowerName = name.toLowerCase();
    final lowerCat = category.toLowerCase();

    if (lowerName.contains('passport') || lowerCat.contains('immigra') || lowerCat.contains('travel')) {
      return CupertinoIcons.airplane;
    }
    if (lowerName.contains('license') || lowerName.contains('driving') || lowerCat.contains('transport')) {
      return CupertinoIcons.car_detailed;
    }
    if (lowerName.contains('identity') || lowerName.contains('nic') || lowerCat.contains('identity') || lowerCat.contains('personal') || lowerCat.contains('family')) {
      return CupertinoIcons.person_2_fill;
    }
    if (lowerName.contains('police') || lowerName.contains('clearance') || lowerCat.contains('police') || lowerCat.contains('legal') || lowerCat.contains('security')) {
      return CupertinoIcons.shield_lefthalf_fill;
    }
    if (lowerName.contains('birth') || lowerName.contains('marriage') || lowerName.contains('death') || lowerCat.contains('civil') || lowerCat.contains('public') || lowerCat.contains('community')) {
      return CupertinoIcons.building_2_fill;
    }
    if (lowerCat.contains('commerce') || lowerCat.contains('business') || lowerName.contains('trade')) {
      return CupertinoIcons.briefcase_fill;
    }
    if (lowerCat.contains('health') || lowerName.contains('medical')) {
      return CupertinoIcons.heart_fill;
    }
    if (lowerCat.contains('educat')) {
      return CupertinoIcons.book_fill;
    }
    if (lowerCat.contains('tax') || lowerCat.contains('revenue')) {
      return CupertinoIcons.money_dollar_circle_fill;
    }
    return CupertinoIcons.doc_text_fill;
  }

  double _getServiceMinFee(Map<String, dynamic> service) {
    final fees = service['feeSchedules'] as List? ?? [];
    if (fees.isEmpty) return 0.0;
    final first = fees[0]['amount'];
    if (first is num) return first.toDouble();
    return double.tryParse(first?.toString() ?? '0') ?? 0.0;
  }

  @override
  Widget build(BuildContext context) {
    final servicesAsync = ref.watch(servicesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Government Services',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.dark,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(CupertinoIcons.arrow_clockwise, size: 20),
            tooltip: 'Refresh Services',
            onPressed: () => ref.refresh(servicesProvider.future),
          ),
        ],
      ),
      body: servicesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (err, _) => _buildErrorState(ref, err.toString()),
        data: (allServices) {
          // Filter out retired services
          final activeServices = allServices.where((s) => s['status'] != 'Retired').toList();

          // Build dynamic categories list & count mapping
          final Map<String, int> categoryCounts = {'All': activeServices.length};
          for (final s in activeServices) {
            final cat = (s['category'] as String?)?.trim();
            if (cat != null && cat.isNotEmpty) {
              categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
            }
          }
          final dynamicCategories = categoryCounts.keys.where((k) => k != 'All').toList()..sort();
          final categories = ['All', ...dynamicCategories];

          // Filter by category, search query, and fee
          List<Map<String, dynamic>> filtered = activeServices.where((s) {
            final name = (s['name'] as String? ?? '').toLowerCase();
            final code = (s['serviceId'] as String? ?? '').toLowerCase();
            final cat = (s['category'] as String? ?? '').trim();
            final desc = (s['description'] as String? ?? '').toLowerCase();

            // Category filter
            final matchesCategory = _selectedCategory == 'All' ||
                cat.toLowerCase() == _selectedCategory.toLowerCase();

            // Search query matches name, category, code, or description
            final q = _searchQuery.toLowerCase();
            final matchesSearch = q.isEmpty ||
                name.contains(q) ||
                code.contains(q) ||
                cat.toLowerCase().contains(q) ||
                desc.contains(q);

            // Fee filter
            final minFee = _getServiceMinFee(s);
            final isFree = minFee <= 0;
            final matchesFee = _feeFilter == 'All' ||
                (_feeFilter == 'Free' && isFree) ||
                (_feeFilter == 'Paid' && !isFree);

            return matchesCategory && matchesSearch && matchesFee;
          }).toList();

          // Apply Sorting
          if (_sortBy == 'Name (A-Z)') {
            filtered.sort((a, b) => ((a['name'] as String?) ?? '').compareTo((b['name'] as String?) ?? ''));
          } else if (_sortBy == 'Fee (Low to High)') {
            filtered.sort((a, b) => _getServiceMinFee(a).compareTo(_getServiceMinFee(b)));
          } else if (_sortBy == 'Stages (Most First)') {
            filtered.sort((a, b) {
              final aStages = (a['totalStages'] is int) ? a['totalStages'] as int : int.tryParse(a['totalStages']?.toString() ?? '1') ?? 1;
              final bStages = (b['totalStages'] is int) ? b['totalStages'] as int : int.tryParse(b['totalStages']?.toString() ?? '1') ?? 1;
              return bStages.compareTo(aStages);
            });
          }

          return RefreshIndicator(
            color: AppColors.primary,
            onRefresh: () => ref.refresh(servicesProvider.future),
            child: Column(
              children: [
                // Top Search & Category Filter Section
                _buildSearchAndFilterHeader(categories, categoryCounts, activeServices),

                // Active Filter Summary Indicator (if any filter or search active)
                if (_isFilterActive || _searchQuery.isNotEmpty)
                  _buildActiveFiltersBar(filtered.length, activeServices.length),

                // Professional Services List
                Expanded(
                  child: filtered.isEmpty
                      ? _buildEmptyState(activeServices.length)
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                          itemCount: filtered.length,
                          separatorBuilder: (context, index) => const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final service = filtered[index];
                            return _buildServiceListItem(context, service);
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSearchAndFilterHeader(
    List<String> categories,
    Map<String, int> categoryCounts,
    List<Map<String, dynamic>> activeServices,
  ) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Search Box and Filter Button in one row
          Row(
            children: [
              // Search Input Box
              Expanded(
                child: Container(
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _searchQuery.isNotEmpty ? AppColors.primary : AppColors.divider,
                      width: _searchQuery.isNotEmpty ? 1.5 : 1,
                    ),
                  ),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchQuery = val.trim()),
                    style: const TextStyle(fontSize: 14, color: AppColors.dark, fontWeight: FontWeight.w500),
                    decoration: InputDecoration(
                      hintText: 'Search by service name or category...',
                      hintStyle: const TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
                      prefixIcon: const Icon(CupertinoIcons.search, size: 18, color: AppColors.secondaryLabel),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(CupertinoIcons.clear_circled_solid, size: 16, color: Colors.grey),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Filter Action Button
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _showFilterSheet(categories, categoryCounts, activeServices),
                child: Container(
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: _isFilterActive ? AppColors.primary : AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _isFilterActive ? AppColors.primary : AppColors.divider,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        CupertinoIcons.slider_horizontal_3,
                        size: 18,
                        color: _isFilterActive ? Colors.white : AppColors.dark,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Filter',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: _isFilterActive ? Colors.white : AppColors.dark,
                        ),
                      ),
                      if (_isFilterActive) ...[
                        const SizedBox(width: 5),
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: Colors.amber,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Horizontal Fast Category Pills
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final cat = categories[index];
                final isSelected = _selectedCategory.toLowerCase() == cat.toLowerCase();
                final count = categoryCounts[cat] ?? 0;

                return GestureDetector(
                  onTap: () => setState(() => _selectedCategory = cat),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primary : AppColors.background,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isSelected ? AppColors.primary : AppColors.divider,
                        width: 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          cat,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                            color: isSelected ? Colors.white : AppColors.dark,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? Colors.white.withValues(alpha: 0.25)
                                : Colors.black.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$count',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: isSelected ? Colors.white : AppColors.secondaryLabel,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveFiltersBar(int matchCount, int totalCount) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.primary.withValues(alpha: 0.04),
      child: Row(
        children: [
          Icon(CupertinoIcons.info_circle, size: 14, color: AppColors.primary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'Showing $matchCount of $totalCount services'
              '${_selectedCategory != 'All' ? ' in "$_selectedCategory"' : ''}'
              '${_searchQuery.isNotEmpty ? ' matching "$_searchQuery"' : ''}'
              '${_feeFilter != 'All' ? ' ($_feeFilter)' : ''}',
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
                color: AppColors.dark,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          GestureDetector(
            onTap: _resetAllFilters,
            child: const Text(
              'Clear All',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.bold,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showFilterSheet(
    List<String> categories,
    Map<String, int> categoryCounts,
    List<Map<String, dynamic>> activeServices,
  ) {
    String tempCategory = _selectedCategory;
    String tempFee = _feeFilter;
    String tempSort = _sortBy;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Container(
              height: MediaQuery.of(context).size.height * 0.72,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Column(
                children: [
                  // Drag indicator
                  Container(
                    margin: const EdgeInsets.only(top: 10, bottom: 6),
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  // Modal Header
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Filter Services',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.dark,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(CupertinoIcons.xmark_circle_fill, color: Colors.grey, size: 24),
                          onPressed: () => Navigator.pop(sheetContext),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.divider),

                  // Modal Scrollable Content
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      children: [
                        // Category Section
                        Row(
                          children: const [
                            Icon(CupertinoIcons.folder_badge_person_crop, size: 16, color: AppColors.primary),
                            SizedBox(width: 8),
                            Text(
                              'CATEGORY & DEPARTMENT',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.secondaryLabel,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),

                        // Categories Options
                        Container(
                          decoration: BoxDecoration(
                            color: AppColors.background,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.divider),
                          ),
                          child: Column(
                            children: categories.map((cat) {
                              final isSelected = tempCategory.toLowerCase() == cat.toLowerCase();
                              final count = categoryCounts[cat] ?? 0;
                              return InkWell(
                                onTap: () => setSheetState(() => tempCategory = cat),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                                  child: Row(
                                    children: [
                                      Icon(
                                        isSelected
                                            ? CupertinoIcons.checkmark_circle_fill
                                            : CupertinoIcons.circle,
                                        size: 18,
                                        color: isSelected ? AppColors.primary : Colors.grey.shade400,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          cat == 'All' ? 'All Categories' : cat,
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                                            color: AppColors.dark,
                                          ),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: isSelected
                                              ? AppColors.primary.withValues(alpha: 0.12)
                                              : Colors.black.withValues(alpha: 0.05),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          '$count',
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: isSelected ? AppColors.primary : AppColors.secondaryLabel,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Fee Schedule Section
                        Row(
                          children: const [
                            Icon(CupertinoIcons.money_dollar_circle, size: 16, color: AppColors.primary),
                            SizedBox(width: 8),
                            Text(
                              'SERVICE FEE',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.secondaryLabel,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: ['All', 'Free', 'Paid'].map((f) {
                            final isSel = tempFee == f;
                            return Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4.0),
                                child: InkWell(
                                  onTap: () => setSheetState(() => tempFee = f),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    decoration: BoxDecoration(
                                      color: isSel ? AppColors.primary : AppColors.background,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSel ? AppColors.primary : AppColors.divider,
                                      ),
                                    ),
                                    alignment: Alignment.center,
                                    child: Text(
                                      f == 'All' ? 'All Fees' : (f == 'Free' ? 'Free Only' : 'Paid Only'),
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: isSel ? FontWeight.bold : FontWeight.w500,
                                        color: isSel ? Colors.white : AppColors.dark,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 20),

                        // Sort Section
                        Row(
                          children: const [
                            Icon(CupertinoIcons.sort_down, size: 16, color: AppColors.primary),
                            SizedBox(width: 8),
                            Text(
                              'SORT BY',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.secondaryLabel,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Container(
                          decoration: BoxDecoration(
                            color: AppColors.background,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.divider),
                          ),
                          child: Column(
                            children: [
                              'Default',
                              'Name (A-Z)',
                              'Fee (Low to High)',
                              'Stages (Most First)'
                            ].map((sortOption) {
                              final isSel = tempSort == sortOption;
                              return InkWell(
                                onTap: () => setSheetState(() => tempSort = sortOption),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  child: Row(
                                    children: [
                                      Icon(
                                        isSel
                                            ? CupertinoIcons.check_mark_circled_solid
                                            : CupertinoIcons.circle,
                                        size: 18,
                                        color: isSel ? AppColors.primary : Colors.grey.shade400,
                                      ),
                                      const SizedBox(width: 10),
                                      Text(
                                        sortOption,
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: isSel ? FontWeight.bold : FontWeight.w500,
                                          color: AppColors.dark,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Bottom Action Buttons
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: AppColors.divider)),
                    ),
                    child: SafeArea(
                      top: false,
                      child: Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                side: const BorderSide(color: AppColors.divider),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: () {
                                setSheetState(() {
                                  tempCategory = 'All';
                                  tempFee = 'All';
                                  tempSort = 'Default';
                                });
                              },
                              child: const Text(
                                'Reset',
                                style: TextStyle(
                                  color: AppColors.dark,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                elevation: 0,
                              ),
                              onPressed: () {
                                setState(() {
                                  _selectedCategory = tempCategory;
                                  _feeFilter = tempFee;
                                  _sortBy = tempSort;
                                });
                                Navigator.pop(sheetContext);
                              },
                              child: const Text(
                                'Apply Filters',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildServiceListItem(BuildContext context, Map<String, dynamic> service) {
    final name = (service['name'] as String?) ?? 'Government Procedure';
    final category = (service['category'] as String?) ?? 'General';
    final serviceCode = (service['serviceId'] as String?) ?? '';
    final totalStages = service['totalStages'] is int
        ? service['totalStages'] as int
        : int.tryParse(service['totalStages']?.toString() ?? '1') ?? 1;

    final fees = service['feeSchedules'] as List? ?? [];
    final feeString = fees.isNotEmpty ? 'LKR ${fees[0]['amount']}' : 'Free';
    final icon = _getServiceIcon(name, category);

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        Navigator.push(
          context,
          CupertinoPageRoute(
            builder: (context) => ProcedureDetailScreen(
              serviceId: service['id'],
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.divider),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Leading Category Icon
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.primary, size: 22),
            ),
            const SizedBox(width: 12),

            // Service Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Category Tag and Code
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          category,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                      if (serviceCode.isNotEmpty) ...[
                        const SizedBox(width: 6),
                        Text(
                          serviceCode,
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppColors.secondaryLabel,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 5),

                  // Service Name
                  Text(
                    name,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.dark,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 6),

                  // Metadata Row: Fee & Stages
                  Row(
                    children: [
                      // Fee pill
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: feeString.toLowerCase() == 'free'
                              ? AppColors.success.withValues(alpha: 0.1)
                              : const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          feeString,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: feeString.toLowerCase() == 'free'
                                ? AppColors.success
                                : AppColors.dark,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Stages indicator
                      Text(
                        '$totalStages ${totalStages == 1 ? 'Stage' : 'Stages'}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.secondaryLabel,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Live Available dot
                      const Row(
                        children: [
                          Icon(Icons.circle, size: 6, color: AppColors.success),
                          SizedBox(width: 3),
                          Text(
                            'Active',
                            style: TextStyle(
                              fontSize: 11,
                              color: AppColors.success,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // Trailing Chevron
            const Icon(
              CupertinoIcons.chevron_right,
              size: 16,
              color: AppColors.secondaryLabel,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(int totalServicesCount) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              CupertinoIcons.search,
              size: 48,
              color: AppColors.secondaryLabel,
            ),
            const SizedBox(height: 16),
            const Text(
              'No Matching Services Found',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _searchQuery.isNotEmpty
                  ? 'No services matching "$_searchQuery" with selected filters.'
                  : 'No services available in the selected category/filters.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _resetAllFilters,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text('Show All Services'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(WidgetRef ref, String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              CupertinoIcons.exclamationmark_circle,
              size: 48,
              color: AppColors.danger,
            ),
            const SizedBox(height: 16),
            const Text(
              'Failed to Load Services',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.dark),
            ),
            const SizedBox(height: 6),
            Text(
              error,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.secondaryLabel),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(servicesProvider),
              icon: const Icon(CupertinoIcons.arrow_clockwise, size: 16),
              label: const Text('Retry'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
