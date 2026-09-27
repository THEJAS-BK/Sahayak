import 'package:flutter/material.dart';

import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/requests_service.dart';
import '../theme/app_colors.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/status_badge.dart';
import 'senior_request_detail_screen.dart';


/// Scrollable list of past/active help requests for the logged-in senior.
///
/// Fetches from the live API (`GET /api/requests/me` — Q-02) so the list
/// reflects real backend state. Each card shows the category, a 2-line
/// description, relative age, and a colour-coded status badge. Tapping a
/// card opens [SeniorRequestDetailScreen] for the full view.
class SeniorMyRequestsScreen extends StatefulWidget {
  const SeniorMyRequestsScreen({super.key});

  @override
  State<SeniorMyRequestsScreen> createState() => _SeniorMyRequestsScreenState();
}

class _SeniorMyRequestsScreenState extends State<SeniorMyRequestsScreen> {
  List<HelpRequest> _requests = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final requests = await RequestsService.instance.mine();
      if (!mounted) return;
      setState(() {
        _requests = requests;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not reach the server. Pull down to retry.';
        _loading = false;
      });
    }
  }

  IconData _categoryIcon(String category) {
    final lower = category.toLowerCase();
    if (lower.contains('medical') || lower.contains('medication')) {
      return Icons.medical_services_outlined;
    }
    if (lower.contains('transport')) return Icons.directions_car_outlined;
    if (lower.contains('grocery')) return Icons.shopping_bag_outlined;
    return Icons.help_outline;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: const SahayakAppBar(
        subtitle: 'My Requests',
        showBack: true,
        showActions: false,
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.accentBlue,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.accentBlue),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined,
                  size: 48, color: AppColors.textSecondary),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: _load,
                child: const Text('Retry',
                    style: TextStyle(color: AppColors.accentBlue)),
              ),
            ],
          ),
        ),
      );
    }

    if (_requests.isEmpty) {
      return ListView(
        // Allows RefreshIndicator to work even when empty.
        children: const [
          SizedBox(height: 120),
          Center(
            child: Column(
              children: [
                Icon(Icons.inbox_outlined,
                    size: 56, color: AppColors.textSecondary),
                SizedBox(height: 12),
                Text(
                  'You have not submitted any help requests yet.',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _requests.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final r = _requests[index];
        return _RequestCard(
          request: r,
          categoryIcon: _categoryIcon(r.category),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => SeniorRequestDetailScreen(request: r),
            ),
          ),
        );
      },
    );
  }
}

class _RequestCard extends StatelessWidget {
  final HelpRequest request;
  final IconData categoryIcon;
  final VoidCallback onTap;

  const _RequestCard({
    required this.request,
    required this.categoryIcon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final r = request;
    final timeLabel = r.createdLabel ?? '';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(8),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.accentBlue.withAlpha(24),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    categoryIcon,
                    color: AppColors.accentBlue,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    r.id,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      fontFamily: 'monospace',
                      color: AppColors.textSecondary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                if (r.status != null) HelpRequestStatusBadge(status: r.status),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              r.category,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              r.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textPrimary,
                height: 1.4,
              ),
            ),
            if (timeLabel.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                timeLabel,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
