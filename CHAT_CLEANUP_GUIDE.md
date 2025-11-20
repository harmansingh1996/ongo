# Chat Auto-Cleanup System Guide

## Problem Statement

Previously, chat conversations and messages were not automatically deleted when rides were completed or cancelled. This caused:
- Stale conversations to appear in chat lists
- Database clutter from old messages
- Poor user experience with outdated chats

## Solution Overview

The chat cleanup system implements a **two-layer approach**:

1. **Frontend Filtering** (Immediate) - Hides old conversations from UI
2. **Database Cleanup** (Periodic) - Permanently removes old data

Both layers use the same **8-hour cleanup window** to match the ride cleanup logic in `filterCleanupRides()`.

---

## Implementation Details

### 1. Frontend Filtering (src/services/chatService.ts)

**Function**: `shouldHideConversation(ride)`
- Checks if ride is completed/cancelled
- Calculates hours since completion
- Returns `true` if > 8 hours old

**Updated**: `getUserConversations(userId)`
- Fetches conversations with ride status info
- Filters out conversations for old completed/cancelled rides
- Logs how many conversations were filtered
- Returns only active conversations to UI

**Benefits**:
- ✅ Immediate UX improvement
- ✅ No database migration required
- ✅ Users see clean chat lists instantly

### 2. Database Cleanup (CHAT_AUTO_CLEANUP.sql)

**Function**: `cleanup_old_conversations()`
- Finds conversations linked to old completed/cancelled rides
- Deletes conversations (messages cascade delete automatically)
- Returns count of deleted conversations
- Can be run manually or scheduled

**Cleanup Logic**:
```sql
DELETE FROM conversations
WHERE ride_request_id IN (
  SELECT rr.id FROM ride_requests rr
  JOIN rides r ON r.id = rr.ride_id
  WHERE r.status IN ('completed', 'cancelled')
  AND (r.completed_at < NOW() - INTERVAL '8 hours'
       OR r.updated_at < NOW() - INTERVAL '8 hours')
)
```

**Benefits**:
- ✅ Permanent data cleanup
- ✅ Frees database storage
- ✅ Maintains data integrity via cascade deletes

---

## Usage Instructions

### Running Database Cleanup

**Option 1: Manual Cleanup**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM cleanup_old_conversations();
```

**Option 2: Scheduled Cleanup (Recommended)**
Set up a scheduled job (e.g., daily) to run:
```sql
SELECT * FROM cleanup_old_conversations();
```

### Monitoring

**Frontend**:
- Check browser console for: `📊 Filtered X old conversations`
- Verify chat lists only show recent conversations

**Database**:
- Check cleanup function logs: `NOTICE: Cleaned up X old conversations`
- Verify conversation count decreases after cleanup

---

## Technical Architecture

### Database Schema (Existing)
```
rides
  └─ ride_requests
       └─ conversations (ON DELETE CASCADE)
            └─ conversation_messages (ON DELETE CASCADE)
```

**Cascade Delete Behavior**:
- When `ride_request` deleted → conversation auto-deleted
- When `conversation` deleted → all messages auto-deleted

### Why Not Direct Cascade from Rides?
Rides are **never deleted** from the database - they only change status to `completed` or `cancelled`. This is why we need:
1. Frontend filtering to hide conversations
2. Periodic cleanup function to delete old data

---

## Cleanup Timeline

```
Ride Completed/Cancelled
         ↓
    [0-8 hours]
         ↓
  ✅ Conversation visible in UI
  ✅ Users can still chat
         ↓
    [8+ hours]
         ↓
  🔄 Frontend filters out (immediate)
  🔄 Database cleanup (next scheduled run)
         ↓
  ✅ Conversation hidden from UI
  ✅ Data permanently removed
```

---

## Testing

### Test Frontend Filtering

1. Complete or cancel a ride
2. Wait 8 hours (or modify test data timestamps)
3. Navigate to chat list
4. Verify old conversations don't appear

### Test Database Cleanup

1. Create test rides and mark as completed/cancelled
2. Update timestamps to 9 hours ago:
   ```sql
   UPDATE rides 
   SET completed_at = NOW() - INTERVAL '9 hours'
   WHERE id = 'test-ride-id';
   ```
3. Run cleanup: `SELECT * FROM cleanup_old_conversations();`
4. Verify conversations deleted

---

## Maintenance

### Recommended Schedule
- **Development**: Run cleanup manually as needed
- **Production**: Schedule daily cleanup at low-traffic hours

### Performance Notes
- Cleanup function is optimized with proper indexes
- Cascade deletes are efficient
- No performance impact on active conversations

### Troubleshooting

**Issue**: Conversations not being filtered
- Check if `ride_request` has valid `ride_id` reference
- Verify ride status is 'completed' or 'cancelled'
- Check console for filter logs

**Issue**: Database cleanup not working
- Verify migration was applied: `CHAT_AUTO_CLEANUP.sql`
- Check function exists: `SELECT * FROM pg_proc WHERE proname = 'cleanup_old_conversations';`
- Run manual cleanup and check logs

---

## Future Enhancements

Potential improvements:
1. Add user notification before chat expires
2. Make cleanup window configurable (env variable)
3. Add analytics tracking for cleanup operations
4. Implement soft delete with archive table

---

## Summary

✅ **Frontend**: Conversations for old rides hidden immediately
✅ **Database**: Old data cleaned up periodically
✅ **User Experience**: Clean, relevant chat lists
✅ **Performance**: Efficient cleanup with cascade deletes
✅ **Consistency**: Matches 8-hour ride cleanup logic
