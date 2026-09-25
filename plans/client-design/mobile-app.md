# Sahayak — Application Page Flow & Navigation Context

## Purpose

This document defines the current page flow for the **Sahayak** application. It
is intended to be used as:

- Context for AI coding agents
- A reference for team members
- A guide when implementing frontend routing and navigation
- A shared understanding of the application's user journey

The flow is based on the current application design.

## 1. Overall Application Flow

The application starts at the **Open App** entry point.

```text
Open App
   |
   +--------------------+
   |                    |
   v                    v
Create Account Page   Login Page
   |                    |
   +---------+----------+
             |
             v
        Email Page
             |
             v
          OTP Page
             |
             v
       Role Select Page
             |
       +-----+------+
       |            |
       v            v
Volunteer      Senior Citizen
   Flow             Flow
```

After the user verifies their email using OTP, they select their role. The
selected role determines which set of pages they enter.

## 2. Entry Point

### Open App Page

**Purpose:** Starting point of the application.

The user can choose between:

- Creating a new account
- Logging into an existing account

**Navigation:**

```text
Open App
   ├──> Create Account Page
   └──> Login Page
```

## 3. Authentication Flow

### Create Account Page

**Purpose:** Allow a new user to begin account registration.

After starting account creation, the user proceeds to the common email
verification flow.

**Navigation:**

```text
Create Account Page
        |
        v
   Email Page
```

### Login Page

**Purpose:** Allow an existing user to log into the application.

The login flow also proceeds through the common email verification flow.

**Navigation:**

```text
Login Page
     |
     v
Email Page
```

### Email Page

**Purpose:** Collect or verify the user's email address as part of
authentication.

Both registration and login flows converge here.

**Navigation:**

```text
Create Account Page ──┐
                      |
                      v
                  Email Page
                      ^
                      |
Login Page ────────────┘
```

### OTP Page

**Purpose:** Verify the user's email using a one-time password (OTP).

The user enters the OTP received through the configured email verification
mechanism.

**Navigation:**

```text
Email Page
    |
    v
OTP Page
    |
    v
Role Select Page
```

## 4. Role Selection

### Role Select Page

**Purpose:** Determine which type of user is accessing Sahayak.

The current application supports two user roles:

1. **Volunteer**
2. **Senior Citizen**

The selected role determines the subsequent application flow.

**Navigation:**

```text
Role Select Page
      |
      +-------------------------+
      |                         |
      v                         v
Volunteer Form Page      Senior Citizen Form Page
```

## 5. Volunteer Flow

### Volunteer Form Page

**Purpose:** Collect the information required to create or complete a volunteer
profile.

The form should contain the fields required for a volunteer to use the Sahayak
platform.

After completing the form, the volunteer proceeds to the volunteer home page.

**Navigation:**

```text
Volunteer Form Page
        |
        v
Volunteer Home Page
```

### Volunteer Home Page

**Purpose:** Main landing page for volunteers after completing their profile.

This is the primary entry point for volunteer-side functionality.

Future volunteer features can be connected from this page, such as:

- Assistance requests
- Requests assigned to the volunteer
- Active assistance
- Notifications
- Profile
- Availability/status
- Other volunteer-related functionality

The exact feature set can be expanded independently without changing the core
authentication flow.

## 6. Senior Citizen Flow

### Senior Citizen Form Page

**Purpose:** Collect the information required to create or complete a senior
citizen profile.

After completing the form, the senior citizen proceeds to the senior home page.

**Navigation:**

```text
Senior Citizen Form Page
        |
        v
Senior Home Page
```

### Senior Home Page

**Purpose:** Main landing page for senior citizens.

This page acts as the central interface for accessing assistance.

From the senior home page, the user can enter the agent conversation experience.

**Navigation:**

```text
Senior Home Page
      |
      v
Agent Conversation Page
```

### Agent Conversation Page

**Purpose:** Provide the voice-first/agent interaction interface for senior
citizens.

This page is intended to be the primary conversational interface between the
senior citizen and the Sahayak assistance agent.

The agent conversation can be used to handle senior assistance requests and
guide the user through the appropriate action.

Potential responsibilities include:

- Receiving voice input
- Understanding the user's request
- Asking follow-up questions
- Creating an assistance request
- Connecting the senior citizen with appropriate assistance
- Providing status or response information
- Escalating appropriate situations to volunteers or emergency services

The exact agent behavior is implemented separately from the page navigation.

## 7. Complete User Flow

**Complete Flow Diagram:**

```text
                           +-------------+
                           |   Open App  |
                           +------+------+
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
          +-------------------+       +----------------+
          | Create Account    |       |   Login Page   |
          |      Page         |       |                |
          +---------+---------+       +-------+--------+
                    |                         |
                    +------------+------------+
                                 |
                                 v
                         +---------------+
                         |   Email Page  |
                         +-------+-------+
                                 |
                                 v
                         +---------------+
                         |    OTP Page   |
                         +-------+-------+
                                 |
                                 v
                       +-------------------+
                       |  Role Select Page |
                       +---------+---------+
                                 |
                    +------------+------------+
                    |                         |
                    v                         v
          +--------------------+    +-----------------------+
          | Volunteer Form     |    | Senior Citizen Form   |
          | Page               |    | Page                  |
          +---------+----------+    +-----------+-----------+
                    |                           |
                    v                           v
          +--------------------+    +-----------------------+
          | Volunteer Home     |    | Senior Home Page      |
          | Page               |    |                       |
          +--------------------+    +-----------+-----------+
                                                |
                                                v
                                    +-----------------------+
                                    | Agent Conversation    |
                                    | Page                  |
                                    +-----------------------+
```

## 8. Route Structure

The exact route names can be adjusted during implementation, but the logical
route structure should follow this hierarchy.

```text
/
├── /create-account
├── /login
├── /email
├── /otp
├── /select-role
│
├── /volunteer
│   ├── /form
│   └── /home
│
└── /senior
    ├── /form
    ├── /home
    └── /agent
```

A possible route naming convention is:

| Page                | Suggested Route  |
| ------------------- | ---------------- |
| Open App            | `/`              |
| Create Account      | `/create-account` |
| Login               | `/login`         |
| Email               | `/email`         |
| OTP                 | `/otp`           |
| Role Select         | `/select-role`   |
| Volunteer Form      | `/volunteer/form` |
| Volunteer Home      | `/volunteer/home` |
| Senior Citizen Form | `/senior/form`   |
| Senior Home         | `/senior/home`   |
| Agent Conversation  | `/senior/agent`  |

These routes are suggestions, not strict requirements.

## 9. Navigation Rules

### Authentication

1. User opens the application.
2. User chooses **Create Account** or **Login**.
3. Both flows proceed to the **Email Page**.
4. User completes email verification.
5. User enters the OTP.
6. After successful OTP verification, the user reaches **Role Select**.
7. The selected role determines the destination flow.

### Volunteer

```text
Role Select
    ↓
Volunteer Form
    ↓
Volunteer Home
```

### Senior Citizen

```text
Role Select
    ↓
Senior Citizen Form
    ↓
Senior Home
    ↓
Agent Conversation
```

## 10. Agent Implementation Context

When modifying or generating frontend code, preserve the following navigation
relationships unless the team explicitly changes the application flow.

### Authentication relationships

- `Open App → Create Account`
- `Open App → Login`
- `Create Account → Email`
- `Login → Email`
- `Email → OTP`
- `OTP → Role Select`

### Volunteer relationships

- `Role Select → Volunteer Form`
- `Volunteer Form → Volunteer Home`

### Senior relationships

- `Role Select → Senior Citizen Form`
- `Senior Citizen Form → Senior Home`
- `Senior Home → Agent Conversation`

## 11. Important Design Principle

The **Email → OTP → Role Select** section is a shared authentication/onboarding
flow.

The role-specific functionality begins **after Role Select**.

Therefore, the application can be thought of as three logical sections:

```text
                 AUTHENTICATION
                       |
        +--------------+--------------+
        |                             |
   Volunteer Flow              Senior Flow
        |                             |
   Volunteer Home             Senior Home
                                      |
                              Agent Conversation
```

This separation should be maintained when organizing frontend components,
routes, authentication state, and role-based access control.

## 12. Page Inventory

There are currently **11 logical pages/screens** in the flow:

### Common

1. Open App Page
2. Create Account Page
3. Login Page
4. Email Page
5. OTP Page
6. Role Select Page

### Volunteer

7. Volunteer Form Page
8. Volunteer Home Page

### Senior Citizen

9. Senior Citizen Form Page
10. Senior Home Page
11. Agent Conversation Page

## 13. Future Expansion

The current diagram represents the **core navigation flow**, not the complete
final feature set.

Additional pages can later be added under the role-specific home pages.

For example:

```text
Volunteer Home
    ├── Requests
    ├── Active Assistance
    ├── Notifications
    └── Profile

Senior Home
    ├── Agent Conversation
    ├── Assistance Status
    ├── Emergency Assistance
    └── Profile
```

These are examples of possible future pages and are **not part of the current
confirmed flow**.

## 14. Source of Truth

For the current implementation, this document should be treated as the reference
for the **basic page-to-page navigation flow**.

If a new feature requires changing this flow:

1. Update the navigation design.
2. Update this document.
3. Update the frontend routes.
4. Update role/authentication guards if required.
5. Ensure existing navigation paths remain consistent with the updated design.