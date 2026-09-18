// Basic smoke test – verifies the app launches without throwing.

import 'package:flutter_test/flutter_test.dart';

import 'package:sahayak_mobile/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Build the app and trigger a frame.
    await tester.pumpWidget(const SahayakApp());

    // The app should render without throwing.
    expect(tester.takeException(), isNull);
  });
}
