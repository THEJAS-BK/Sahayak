import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/services/voice_payload.dart';
import 'package:sahayak_mobile/widgets/request_review_dialog.dart';

class _Holder {
  VoiceHelpRequest? value;
  bool completed = false;
}

class _Host extends StatelessWidget {
  const _Host({required this.request, required this.onOpen});

  final VoiceHelpRequest request;
  final void Function(VoiceHelpRequest? result) onOpen;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () async {
                onOpen(await showRequestReviewDialog(context, request: request));
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
  }
}

VoiceHelpRequest _envelope() => VoiceHelpRequest.fromDataChannel({
      'v': 1,
      'type': 'help_request',
      'request_id': 'req-1',
      'request': {
        'category': 'grocery_assistance',
        'description': 'Need rice and oil',
        'priority': 'urgent',
        'details': {'items': ['rice', 'oil']},
      },
    });

Future<_Holder> _openDialog(WidgetTester tester, VoiceHelpRequest request) async {
  final holder = _Holder();
  await tester.pumpWidget(_Host(
    request: request,
    onOpen: (result) {
      holder.value = result;
      holder.completed = true;
    },
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return holder;
}

ElevatedButton _sendButton(WidgetTester tester) =>
    tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Send request'));

void main() {
  testWidgets('shows what the agent gathered', (tester) async {
    // Tall phone viewport so the whole sheet (camera tile + actions) fits.
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await _openDialog(tester, _envelope());

    expect(find.text("Here's what I noted"), findsOneWidget);
    expect(find.text('Groceries'), findsOneWidget);
    expect(find.text('Need rice and oil'), findsOneWidget);
    expect(find.text('Items: rice, oil'), findsOneWidget);
    expect(find.text('Add a photo'), findsOneWidget);
  });

  testWidgets('send returns the edited draft', (tester) async {
    // Tall phone viewport so the whole sheet (camera tile + actions) fits.
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final holder = await _openDialog(tester, _envelope());

    await tester.enterText(find.byType(TextField), 'Need milk and eggs');
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Medical help').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Normal'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Send request'));
    await tester.pumpAndSettle();

    expect(holder.completed, isTrue);
    expect(holder.value?.requestId, 'req-1');
    expect(holder.value?.description, 'Need milk and eggs');
    expect(holder.value?.category, 'medical_assistance');
    expect(holder.value?.priority, 'normal');
    expect(holder.value?.details, {'items': ['rice', 'oil']});
  });

  testWidgets('continue conversation returns null and keeps the request', (tester) async {
    // Tall phone viewport so the whole sheet (camera tile + actions) fits.
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final holder = await _openDialog(tester, _envelope());

    await tester.tap(find.text('Continue conversation'));
    await tester.pumpAndSettle();

    expect(holder.completed, isTrue);
    expect(holder.value, isNull);
  });

  testWidgets('send is disabled while the description is empty', (tester) async {
    // Tall phone viewport so the whole sheet (camera tile + actions) fits.
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await _openDialog(tester, _envelope());
    expect(_sendButton(tester).onPressed, isNotNull);

    await tester.enterText(find.byType(TextField), '   ');
    await tester.pumpAndSettle();

    expect(_sendButton(tester).onPressed, isNull);
  });

  testWidgets('camera tile is a placeholder', (tester) async {
    // Tall phone viewport so the whole sheet (camera tile + actions) fits.
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await _openDialog(tester, _envelope());

    await tester.tap(find.text('Add a photo'));
    await tester.pumpAndSettle();

    expect(find.text('Photos are not available yet.'), findsOneWidget);
  });
}
