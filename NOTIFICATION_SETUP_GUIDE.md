# Notification System Setup Guide

This guide explains how to set up and use the in-app notification system for OnGoPool ride-sharing application.

## Overview

The notification system provides real-time in-app notifications for:
- **Ride Posts** - New rides matching user preferences
- **Chat Messages** - New messages in conversations
- **Ride Requests** - Riders requesting to join rides
- **Booking Updates** - Confirmations and rejections
- **Payment Notifications** - Payment and refund confirmations
- **Rating Reminders** - Reminders to rate completed rides
- **Ride Status** - Ride started/completed updates
- **Cancellations** - Ride cancellation alerts

## Database Setup

### 1. Run the Migration

Execute the SQL migration to create the necessary database tables and functions:

```bash
# Open your Supabase Dashboard
# Navigate to SQL Editor (left sidebar)
# Click "New Query"
# Copy the entire contents of NOTIFICATION_MIGRATION.sql file
# Paste into the SQL Editor and Run
```

### 2. Verify Tables Created

After running the migration, verify these tables exist in your **Table Editor**:

- ✅ `notifications` - Main notification storage with RLS policies
- ✅ `notification_preferences` - User notification preferences

### 3. Verify Functions Created

Check that these PostgreSQL functions exist:

- `create_notification()` - Creates notifications with preference checks
- `mark_notification_read()` - Marks single notification as read
- `mark_all_notifications_read()` - Marks all user notifications as read
- `get_unread_notification_count()` - Returns unread notification count

### 4. Verify Triggers

Ensure these automatic triggers are active:

- `trigger_notify_chat_message` - Fires on new chat messages
- `trigger_notify_ride_request` - Fires on new booking requests
- `trigger_notify_booking_status` - Fires on booking status changes

## Frontend Integration

### Components

**NotificationBell.tsx** - Notification bell icon with unread badge
```tsx
import { NotificationBell } from '../../components/NotificationBell';

<NotificationBell 
  onOpen={() => setNotificationPanelOpen(true)}
  className="p-2 bg-white/20 rounded-full"
/>
```

**NotificationPanel.tsx** - Sliding notification panel
```tsx
import { NotificationPanel } from '../../components/NotificationPanel';

<NotificationPanel
  isOpen={notificationPanelOpen}
  onClose={() => setNotificationPanelOpen(false)}
/>
```

**NotificationSettingsPage.tsx** - User preference management
- Access via `/settings/notifications` route
- Toggle individual notification types
- Master enable/disable switch

### Service Layer

**notificationService.ts** provides these functions:

```typescript
// Fetch notifications
getNotifications(userId, { limit?, offset?, unreadOnly?, type? })

// Get unread count
getUnreadCount(userId)

// Mark as read
markAsRead(notificationId)
markAllAsRead(userId)

// Create notification manually
createNotification({ userId, type, title, message, ... })

// Delete notification
deleteNotification(notificationId)

// Manage preferences
getNotificationPreferences(userId)
updateNotificationPreferences(userId, preferences)

// Real-time subscription
subscribeToNotifications(userId, onNewNotification, onNotificationUpdate)
```

## Usage Examples

### Basic Implementation

```tsx
import { useState, useEffect } from 'react';
import { NotificationBell } from '../components/NotificationBell';
import { NotificationPanel } from '../components/NotificationPanel';

function MyPage() {
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  return (
    <div>
      <header>
        <NotificationBell onOpen={() => setNotificationPanelOpen(true)} />
      </header>

      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
      />
    </div>
  );
}
```

### Manual Notification Creation

```typescript
import { createNotification } from '../services/notificationService';

// Example: Notify driver about payment
await createNotification({
  userId: driverId,
  type: 'payment_received',
  title: 'Payment Received',
  message: `You received $${amount} for ride #${rideId}`,
  rideId: rideId,
  metadata: { amount, paymentMethod: 'card' },
  actionUrl: `/driver/earnings`
});
```

### Real-time Subscription

```typescript
import { subscribeToNotifications } from '../services/notificationService';

useEffect(() => {
  const unsubscribe = subscribeToNotifications(
    userId,
    (newNotification) => {
      console.log('New notification:', newNotification);
      // Show toast, update badge, etc.
    },
    (updatedNotification) => {
      console.log('Notification updated:', updatedNotification);
    }
  );

  return () => unsubscribe();
}, [userId]);
```

## Notification Types

### Automatic (Triggered by Database)

These notifications are created automatically via database triggers:

1. **chat_message** - New chat message received
2. **ride_request** - New booking request for driver
3. **booking_confirmed** - Driver accepted ride request
4. **booking_rejected** - Driver rejected ride request

### Manual (Created via Service)

These must be created manually in your application code:

1. **ride_post** - New ride matching user preferences
2. **ride_started** - Driver started the ride
3. **ride_completed** - Ride finished
4. **payment_received** - Payment confirmation
5. **cancellation** - Ride cancelled
6. **rating_reminder** - Reminder to rate
7. **refund_processed** - Refund completed

## Notification Preferences

Users can manage preferences at `/settings/notifications`:

- Enable/disable all notifications (master toggle)
- Individual toggles for each notification type:
  - Ride posts
  - Chat messages
  - Ride requests
  - Booking updates
  - Payment notifications
  - Rating reminders

## Real-time Updates

The system uses Supabase Realtime for instant notification delivery:

- New notifications appear immediately without refresh
- Unread badge updates in real-time
- Notification panel automatically reflects changes
- Read status syncs across devices

## Security

### Row Level Security (RLS)

All notification tables have RLS enabled:

- Users can only view their own notifications
- Users can only update their own notifications
- System can create notifications for any user
- Users can delete their own notifications

### Data Access

- Notification content is private to each user
- Sender information is included via profile join
- Action URLs are validated on navigation

## Performance

### Indexes

Optimized database indexes for common queries:

- User ID lookup
- Unread status filtering
- Creation date sorting
- Notification type filtering
- Related entity lookups (ride, booking, chat)

### Caching

- Unread count cached in component state
- Real-time subscription prevents unnecessary queries
- Notification list fetched on demand

## Troubleshooting

### Notifications not appearing

1. Check RLS policies are enabled
2. Verify user authentication
3. Check notification preferences
4. Ensure database triggers are active

### Real-time not working

1. Verify Supabase Realtime is enabled
2. Check subscription setup in component
3. Ensure proper cleanup on unmount

### Performance issues

1. Limit notification history (auto-cleanup old notifications)
2. Use pagination for notification list
3. Optimize related entity joins

## Integration Checklist

- [ ] Run NOTIFICATION_MIGRATION.sql
- [ ] Verify tables and functions created
- [ ] Add NotificationBell to header/navigation
- [ ] Add NotificationPanel to layout
- [ ] Add notification settings route
- [ ] Implement manual notification creation for custom events
- [ ] Test real-time updates
- [ ] Configure notification preferences defaults
- [ ] Set up notification cleanup (optional)

## Future Enhancements

Potential improvements for future development:

1. **Push Notifications** - Browser/mobile push notifications
2. **Email Notifications** - Email delivery option
3. **Notification Groups** - Group similar notifications
4. **Rich Media** - Images and attachments in notifications
5. **Sound Effects** - Audio alerts for new notifications
6. **Notification History** - Archive old notifications
7. **Smart Filtering** - AI-powered notification prioritization
8. **Do Not Disturb** - Scheduled quiet hours

---

For more information, refer to the source code in:
- `src/services/notificationService.ts`
- `src/components/NotificationBell.tsx`
- `src/components/NotificationPanel.tsx`
- `src/pages/NotificationSettingsPage.tsx`
- `NOTIFICATION_MIGRATION.sql`
