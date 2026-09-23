import '../widgets/status_badge.dart';

/// Dummy help-request payload used by volunteer screens.
/// Matches the Figma volunteer accept/decline flow.
class HelpRequest {
  final String id;
  final String caller;
  final int age;
  final String phone;
  final String location;
  final String time;
  final RequestPriority priority;
  final String category;
  final String description;
  final List<String> tags;
  final String distance;
  final String duration;
  final String deadline;

  const HelpRequest({
    required this.id,
    required this.caller,
    required this.age,
    required this.phone,
    required this.location,
    required this.time,
    required this.priority,
    required this.category,
    required this.description,
    required this.tags,
    required this.distance,
    required this.duration,
    required this.deadline,
  });

  String get initial => caller.isEmpty ? '?' : caller[0].toUpperCase();

  static const incoming = HelpRequest(
    id: 'REQ-1027',
    caller: 'Priya Sharma',
    age: 72,
    phone: '+91 98765 43210',
    location: 'Green Park, New Delhi',
    time: 'Just now',
    priority: RequestPriority.high,
    category: 'Medical Assistance',
    description:
        'Needs help getting to a nearby clinic for a scheduled check-up. Walking aid required.',
    tags: ['Medical Assistance', '2 hrs', 'Walking Aid'],
    distance: '1.2 km',
    duration: '2 hrs',
    deadline: '30 minutes',
  );

  static const area = [
    HelpRequest(
      id: 'REQ-1024',
      caller: 'Anita Desai',
      age: 68,
      phone: '+91 98111 22334',
      location: 'Greater Kailash',
      time: '10:45 AM',
      priority: RequestPriority.high,
      category: 'Grocery Assistance',
      description:
          'Needs help buying weekly groceries and carrying bags up to a second-floor flat.',
      tags: ['Grocery Assistance', '2 hrs', 'Walking Aid'],
      distance: '0.8 km',
      duration: '2 hrs',
      deadline: '30 minutes',
    ),
    HelpRequest(
      id: 'REQ-1025',
      caller: 'Ramesh Singh',
      age: 74,
      phone: '+91 98222 33445',
      location: 'Vasant Vihar',
      time: '11:15 AM',
      priority: RequestPriority.medium,
      category: 'Transport',
      description: 'Needs a ride to the bank and back home the same afternoon.',
      tags: ['Transport', '1 hr'],
      distance: '2.1 km',
      duration: '1 hr',
      deadline: '45 minutes',
    ),
    HelpRequest(
      id: 'REQ-1026',
      caller: 'Kamala Rao',
      age: 70,
      phone: '+91 98333 44556',
      location: 'Defence Colony',
      time: '12:00 PM',
      priority: RequestPriority.low,
      category: 'Companionship',
      description: 'Would like company for a short walk in the neighbourhood park.',
      tags: ['Companionship', '45 min'],
      distance: '1.5 km',
      duration: '45 min',
      deadline: '1 hour',
    ),
  ];

  static const acceptedSeed = HelpRequest(
    id: 'REQ-1020',
    caller: 'Meena Gupta',
    age: 71,
    phone: '+91 98444 55667',
    location: 'Lajpat Nagar',
    time: '09:00 AM',
    priority: RequestPriority.medium,
    category: 'Medication',
    description: 'Needs a volunteer to pick up a prescription from the chemist.',
    tags: ['Medication', '1 hr'],
    distance: '1.0 km',
    duration: '1 hr',
    deadline: '40 minutes',
  );
}
