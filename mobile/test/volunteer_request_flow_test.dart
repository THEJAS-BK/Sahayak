import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/screens/volunteer_home_screen.dart';

void main() {
  testWidgets('Volunteer home opens notification sheet with Accept/Decline',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: VolunteerHomeScreen()),
    );

    await tester.tap(find.byIcon(Icons.notifications_outlined));
    await tester.pumpAndSettle();

    expect(find.text('New Help Request!'), findsOneWidget);
    expect(find.text('Accept Request'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    expect(find.text('Priya Sharma'), findsOneWidget);
  });

  testWidgets('Tapping a nearby request opens detail', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: VolunteerHomeScreen()),
    );

    await tester.tap(find.text('Anita Desai'));
    await tester.pumpAndSettle();

    expect(find.text('Request Detail'), findsOneWidget);
    expect(find.text('Accept Request'), findsOneWidget);
    expect(find.text('Decline Request'), findsOneWidget);
  });
}
