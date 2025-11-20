-- =====================================================
-- FIX RIDE TIME INCONSISTENCY
-- =====================================================
-- Problem: Rides have estimated_arrival times that are BEFORE the start time
-- Example: Ride starts at 03:00:00 but arrives at 02:35:00 (impossible!)
-- 
-- Root Cause: When rides were edited, the time offset calculation was incorrect,
-- causing arrival times to be in the past relative to start times.
--
-- Solution: Recalculate ALL estimated_arrival times based on:
-- estimated_arrival = ride.time + (ride.duration * interval '1 minute')
-- =====================================================

-- Step 1: Fix rides table estimated_arrival
-- Calculate correct arrival time by adding duration to start time
UPDATE rides
SET estimated_arrival = (
  -- Convert time to timestamp, add duration minutes, extract time back
  (time::time + (duration || ' minutes')::interval)::time
)
WHERE estimated_arrival IS NOT NULL
  AND duration IS NOT NULL
  AND time IS NOT NULL;

-- Step 2: Fix route_stops estimated_arrival times
-- We need to calculate each stop's arrival time based on its position in the route
-- This is more complex because we need the time offset from the original route creation

-- First, let's check if there's a pattern we can use
-- We'll calculate the proportion of the journey for each stop and apply it

-- Temporary function to calculate stop arrival times
CREATE OR REPLACE FUNCTION fix_route_stop_times()
RETURNS void AS $$
DECLARE
  ride_record RECORD;
  stop_record RECORD;
  total_stops INTEGER;
  stop_index INTEGER;
  time_per_segment INTERVAL;
  cumulative_time TIME;
BEGIN
  -- Loop through each ride
  FOR ride_record IN 
    SELECT id, time, duration, estimated_arrival
    FROM rides
    WHERE duration IS NOT NULL AND time IS NOT NULL
  LOOP
    -- Get total number of stops for this ride
    SELECT COUNT(*) INTO total_stops
    FROM route_stops
    WHERE ride_id = ride_record.id;
    
    IF total_stops > 0 THEN
      -- Calculate time per segment (divide total duration by number of segments)
      time_per_segment := (ride_record.duration || ' minutes')::interval / (total_stops);
      
      -- Update each stop's estimated arrival
      FOR stop_record IN
        SELECT id, stop_order
        FROM route_stops
        WHERE ride_id = ride_record.id
        ORDER BY stop_order
      LOOP
        -- First stop gets the start time
        IF stop_record.stop_order = 0 THEN
          cumulative_time := ride_record.time;
        ELSE
          -- Subsequent stops get progressively later times
          cumulative_time := (ride_record.time::time + (time_per_segment * stop_record.stop_order))::time;
        END IF;
        
        -- Update the stop
        UPDATE route_stops
        SET estimated_arrival = cumulative_time
        WHERE id = stop_record.id;
      END LOOP;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the fix function
SELECT fix_route_stop_times();

-- Clean up the temporary function
DROP FUNCTION fix_route_stop_times();

-- Step 3: Verify the fix
-- Check if any rides still have arrival times before start times
SELECT 
  id,
  time as start_time,
  estimated_arrival,
  duration,
  CASE 
    WHEN estimated_arrival < time THEN 'STILL BROKEN'
    ELSE 'FIXED'
  END as status
FROM rides
WHERE estimated_arrival IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- Check route stops consistency
SELECT 
  r.id as ride_id,
  r.time as ride_start,
  r.estimated_arrival as ride_end,
  rs.stop_order,
  rs.estimated_arrival as stop_arrival,
  CASE 
    WHEN rs.estimated_arrival < r.time THEN 'BROKEN: Stop before ride start'
    WHEN rs.stop_order > 0 AND rs.estimated_arrival > r.estimated_arrival THEN 'BROKEN: Stop after ride end'
    ELSE 'OK'
  END as status
FROM rides r
JOIN route_stops rs ON rs.ride_id = r.id
WHERE r.id = '72ae30e3-5ab3-40ee-a3ac-233d9002fea1'
ORDER BY rs.stop_order;
